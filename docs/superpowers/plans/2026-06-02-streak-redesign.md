# Streak Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `practice_days` (multi-row calendar-day table) with `user_streaks` (single-row-per-user), add rolling 24h/48h flame display states, and return `last_practiced_at` from the API so the frontend can compute solid/hollow/none flame status.

**Architecture:** A new `user_streaks` table with one row per user stores the streak count and last practice timestamp; a single upsert SQL handles all increment/reset logic. The backend returns `{ streak, last_practiced_at }` and the frontend computes display status from the timestamp. The existing `practice_days` table is migrated and dropped.

**Tech Stack:** Go 1.23, Fiber v2, pgx v5, TypeScript, React, Tailwind v4

---

## File Map

| File | Action |
|---|---|
| `backend/db/schema.sql` | Replace `practice_days` table with `user_streaks` |
| `backend/db/migrate_streak.sql` | One-time migration: seed `user_streaks`, drop `practice_days` |
| `backend/internal/types/streak_info.go` | New — `StreakInfo` struct |
| `backend/internal/storage/storage.go` | `GetStreak` return type: `(int, error)` → `(types.StreakInfo, error)` |
| `backend/internal/storage/postgres/streak.go` | New SQL for both methods |
| `backend/internal/storage/processcache/process_cache.go` | Passthrough return type update |
| `backend/internal/storage/processcache/process_cache_test.go` | Stub return type update |
| `backend/internal/handlers/streak.go` | Return `StreakInfo` directly; add `types` import |
| `frontend/src/api.ts` | Update return types of `getStreak` and `recordStreak` |
| `frontend/src/hooks/useAuth.ts` | Add `lastPracticedAt` state, `streakStatus` derived value, reset on sign-out |
| `frontend/src/components/NavBar.tsx` | Add `streakStatus` prop, solid/hollow/none flame rendering |
| `frontend/src/App.tsx` | Destructure and pass `streakStatus` to `NavBar` |

---

## Task 1: Update DB schema and write migration

**Files:**
- Modify: `backend/db/schema.sql`
- Create: `backend/db/migrate_streak.sql`

- [ ] **Step 1: Replace `practice_days` with `user_streaks` in `schema.sql`**

In `backend/db/schema.sql`, replace the `practice_days` block:

```sql
-- REMOVE this:
CREATE TABLE IF NOT EXISTS practice_days (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, day)
);

-- REPLACE with:
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak            INT         NOT NULL DEFAULT 1 CHECK (streak >= 1),
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Create the one-time migration file**

Create `backend/db/migrate_streak.sql`:

```sql
-- One-time migration: replaces practice_days with user_streaks.
-- Run once against the existing database before deploying the new backend.

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak            INT         NOT NULL DEFAULT 1 CHECK (streak >= 1),
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_streaks (user_id, streak, last_practiced_at)
SELECT pd.user_id, s.streak,
  TIMEZONE('UTC', (SELECT MAX(day)::TIMESTAMP FROM practice_days WHERE user_id = pd.user_id))
FROM (SELECT DISTINCT user_id FROM practice_days) pd
CROSS JOIN LATERAL (
  WITH ranked AS (
    SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
    FROM practice_days WHERE user_id = pd.user_id
  )
  SELECT COUNT(*)::INT AS streak FROM ranked
  WHERE day = (SELECT MAX(day) FROM practice_days WHERE user_id = pd.user_id) - CAST(rn - 1 AS INTEGER)
) s
ON CONFLICT (user_id) DO NOTHING;

DROP TABLE practice_days;
```

- [ ] **Step 3: Commit**

```bash
git add backend/db/schema.sql backend/db/migrate_streak.sql
git commit -m "feat: add user_streaks schema and migration from practice_days"
```

---

## Task 2: Add `types.StreakInfo`

**Files:**
- Create: `backend/internal/types/streak_info.go`

- [ ] **Step 1: Create the file**

```go
package types

import "time"

type StreakInfo struct {
	Streak          int        `json:"streak"`
	LastPracticedAt *time.Time `json:"last_practiced_at"`
}
```

`LastPracticedAt` is a pointer so it serializes as `null` (not `"0001-01-01T00:00:00Z"`) when a user has never practiced.

- [ ] **Step 2: Verify the package compiles**

```bash
cd backend && go build ./internal/types/...
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/types/streak_info.go
git commit -m "feat: add StreakInfo type"
```

---

## Task 3: Update storage interface

**Files:**
- Modify: `backend/internal/storage/storage.go`

- [ ] **Step 1: Change `GetStreak` signature**

In `backend/internal/storage/storage.go`, update the streak line (currently line 25):

```go
// BEFORE:
GetStreak(ctx context.Context, userID uuid.UUID) (int, error)

// AFTER:
GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error)
```

The `types` import is already present in this file (used by `SearchProblems`), so no new import needed.

- [ ] **Step 2: Verify the expected compile errors**

```bash
cd backend && go build ./... 2>&1 | grep "cannot use\|does not implement\|have GetStreak"
```

Expected: errors in `process_cache.go`, `process_cache_test.go`, and `handlers/streak.go` — all because they implement/call the old `(int, error)` signature. These are fixed in Tasks 4–6.

---

## Task 4: Update postgres streak implementation

**Files:**
- Modify: `backend/internal/storage/postgres/streak.go`

- [ ] **Step 1: Rewrite the file**

```go
package postgres

import (
	"context"
	"errors"
	"time"

	"leetgame/internal/types"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	const sql = `
		INSERT INTO user_streaks (user_id, streak, last_practiced_at)
		VALUES ($1, 1, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		  streak = CASE
		    WHEN DATE(user_streaks.last_practiced_at AT TIME ZONE 'UTC') = DATE(NOW() AT TIME ZONE 'UTC')
		      THEN user_streaks.streak
		    WHEN NOW() - user_streaks.last_practiced_at <= INTERVAL '48 hours'
		      THEN user_streaks.streak + 1
		    ELSE 1
		  END,
		  last_practiced_at = NOW()
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error) {
	const sql = `SELECT streak, last_practiced_at FROM user_streaks WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (types.StreakInfo, error) {
		var streak int
		var lastPracticedAt *time.Time
		err := p.Pool.QueryRow(ctx, sql, userID).Scan(&streak, &lastPracticedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return types.StreakInfo{}, nil
		}
		return types.StreakInfo{Streak: streak, LastPracticedAt: lastPracticedAt}, err
	})
}
```

- [ ] **Step 2: Verify it compiles in isolation**

```bash
cd backend && go build ./internal/storage/postgres/...
```

Expected: no output (success).

---

## Task 5: Update process cache passthrough and test stub

**Files:**
- Modify: `backend/internal/storage/processcache/process_cache.go:269`
- Modify: `backend/internal/storage/processcache/process_cache_test.go:46`

- [ ] **Step 1: Update the passthrough method in `process_cache.go`**

Find and replace the `GetStreak` method (currently line 269):

```go
// BEFORE:
func (c *CachedStorage) GetStreak(ctx context.Context, userID uuid.UUID) (int, error) {
	return c.inner.GetStreak(ctx, userID)
}

// AFTER:
func (c *CachedStorage) GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error) {
	return c.inner.GetStreak(ctx, userID)
}
```

The `types` import is already present in this file.

- [ ] **Step 2: Update the stub in `process_cache_test.go`**

Find and replace the `GetStreak` stub (currently line 46):

```go
// BEFORE:
func (s *stubStorage) GetStreak(_ context.Context, _ uuid.UUID) (int, error) { panic("unexpected") }

// AFTER:
func (s *stubStorage) GetStreak(_ context.Context, _ uuid.UUID) (types.StreakInfo, error) {
	panic("unexpected")
}
```

- [ ] **Step 3: Run the process cache tests**

```bash
cd backend && go test ./internal/storage/processcache/... -v
```

Expected: all tests pass (PASS).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/storage/storage.go \
        backend/internal/storage/postgres/streak.go \
        backend/internal/storage/processcache/process_cache.go \
        backend/internal/storage/processcache/process_cache_test.go
git commit -m "feat: update GetStreak to return StreakInfo with last_practiced_at"
```

---

## Task 6: Update streak handlers

**Files:**
- Modify: `backend/internal/handlers/streak.go`

- [ ] **Step 1: Rewrite the file**

The inline `response` struct is no longer needed — `types.StreakInfo` already has JSON tags and can be returned directly.

```go
package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RecordStreak(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	if err := hs.storage.UpsertPracticeDay(c.Context(), uid); err != nil {
		return err
	}

	info, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	return c.JSON(info)
}

func (hs *HandlerService) GetStreak(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	info, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	return c.JSON(info)
}
```

- [ ] **Step 2: Build the entire backend**

```bash
cd backend && go build ./...
```

Expected: no output (success). This confirms the full backend compiles cleanly.

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass (PASS).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/streak.go
git commit -m "feat: streak handlers return StreakInfo with last_practiced_at"
```

---

## Task 7: Update `api.ts` return types

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Update `getStreak`**

In `frontend/src/api.ts`, replace the `getStreak` function (currently lines 132–138):

```ts
export async function getStreak(): Promise<{ streak: number; last_practiced_at: string | null }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Update `recordStreak`**

Replace the `recordStreak` function (currently lines 140–147):

```ts
export async function recordStreak(): Promise<{ streak: number; last_practiced_at: string | null }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 8: Update `useAuth.ts`

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Add `lastPracticedAt` state after the `streak` state declaration**

Current line 11:
```ts
const [streak, setStreak] = useState<number | null>(null)
```

Add the new state immediately after it:
```ts
const [streak, setStreak] = useState<number | null>(null)
const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null)
```

- [ ] **Step 2: Add `streakStatus` derived value after the new state**

Add these two lines immediately after the `lastPracticedAt` state:

```ts
const ms = lastPracticedAt === null ? Infinity : Date.now() - new Date(lastPracticedAt).getTime()
const streakStatus: 'solid' | 'hollow' | 'none' | null =
  lastPracticedAt === null ? null
  : ms < 864e5  ? 'solid'
  : ms < 1728e5 ? 'hollow'
  : 'none'
```

- [ ] **Step 3: Update the `getStreak` call in the auth effect (currently line 24)**

```ts
// BEFORE:
getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})

// AFTER:
getStreak().then(({ streak, last_practiced_at }) => {
  setStreak(streak)
  setLastPracticedAt(last_practiced_at)
}).catch(() => {})
```

- [ ] **Step 4: Add `setLastPracticedAt(null)` to the unauthenticated `INITIAL_SESSION` branch**

The `else` block inside `if (session)` (currently around line 34) handles the case where the session is null on load:

```ts
// BEFORE:
} else {
  setStreak(null)
  applyLocalSettings()
  setSettingsReady(true)
}

// AFTER:
} else {
  setStreak(null)
  setLastPracticedAt(null)
  applyLocalSettings()
  setSettingsReady(true)
}
```

- [ ] **Step 5: Add `setLastPracticedAt(null)` to the `SIGNED_OUT` branch (currently line 39)**

```ts
// BEFORE:
} else if (event === 'SIGNED_OUT') {
  setStreak(null)
  setActiveTopics(NEETCODE_TOPICS)
  applyLocalSettings()
  setSettingsReady(true)
}

// AFTER:
} else if (event === 'SIGNED_OUT') {
  setStreak(null)
  setLastPracticedAt(null)
  setActiveTopics(NEETCODE_TOPICS)
  applyLocalSettings()
  setSettingsReady(true)
}
```

- [ ] **Step 6: Update `recordAndUpdateStreak` (currently line 97)**

```ts
// BEFORE:
const recordAndUpdateStreak = () => {
  recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
}

// AFTER:
const recordAndUpdateStreak = () => {
  recordStreak().then(({ streak, last_practiced_at }) => {
    setStreak(streak)
    setLastPracticedAt(last_practiced_at)
  }).catch(() => {})
}
```

- [ ] **Step 7: Add `streakStatus` to the hook's return object**

In the `return` block at the bottom of the hook, add `streakStatus` alongside `streak`:

```ts
return {
  session,
  authLoading,
  streak,
  streakStatus,
  activeStages,
  hideTitle,
  activeTopics,
  tourDone,
  settingsReady,
  persistStages,
  persistHideTitle,
  persistTopics,
  persistTourDone,
  recordAndUpdateStreak,
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 9: Update `NavBar.tsx` and `App.tsx`

**Files:**
- Modify: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add `streakStatus` to `NavBar` props interface**

In `frontend/src/components/NavBar.tsx`, update the `Props` interface (currently lines 8–19):

```ts
interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
  streakStatus: 'solid' | 'hollow' | 'none' | null
  activeStages: ActiveStage[]
  onStagesChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  onTakeTour?: () => void
}
```

- [ ] **Step 2: Add `streakStatus` to the function destructuring**

Update the function signature (currently line 21):

```ts
export function NavBar({ view, onNavigate, session, authLoading, streak, streakStatus, activeStages, onStagesChange, hideTitle, onHideTitleChange, onTakeTour }: Props) {
```

- [ ] **Step 3: Replace the flame display (currently lines 81–83)**

```tsx
// BEFORE:
{streak !== null && streak >= 1 && (
  <span data-tour="streak" className="text-sm font-medium">🔥 {streak}</span>
)}

// AFTER:
{streakStatus === 'solid' && (
  <span data-tour="streak" className="text-sm font-medium">🔥 {streak}</span>
)}
{streakStatus === 'hollow' && (
  <span data-tour="streak" className="text-sm font-medium opacity-50 grayscale">🔥 {streak}</span>
)}
```

- [ ] **Step 4: Update `App.tsx` destructuring**

In `frontend/src/App.tsx`, update the `useAuth` destructuring (currently line 56) to include `streakStatus`:

```ts
const { session, authLoading, streak, streakStatus, activeStages, hideTitle, activeTopics, tourDone, settingsReady, persistStages, persistHideTitle, persistTopics, persistTourDone, recordAndUpdateStreak } = useAuth()
```

- [ ] **Step 5: Pass `streakStatus` to `NavBar` in `App.tsx`**

Find the `<NavBar>` usage (currently around line 459) and add the new prop:

```tsx
<NavBar
  view={view}
  onNavigate={setView}
  session={session}
  authLoading={authLoading}
  streak={streak}
  streakStatus={streakStatus}
  activeStages={activeStages}
  onStagesChange={persistStages}
  hideTitle={hideTitle}
  onHideTitleChange={persistHideTitle}
  onTakeTour={startTour}
/>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.ts \
        frontend/src/hooks/useAuth.ts \
        frontend/src/components/NavBar.tsx \
        frontend/src/App.tsx
git commit -m "feat: streak flame states — solid/hollow/none based on last_practiced_at"
```

---

## Task 10: Run the migration against the database

This task is run once against the live Supabase database before deploying the new backend.

- [ ] **Step 1: Run the migration SQL**

Open the Supabase dashboard SQL editor and run the contents of `backend/db/migrate_streak.sql`. Verify:

```sql
-- Confirm user_streaks has data
SELECT COUNT(*) FROM user_streaks;

-- Confirm practice_days is gone
SELECT * FROM information_schema.tables WHERE table_name = 'practice_days';
-- Expected: 0 rows
```

- [ ] **Step 2: Deploy the new backend**

Deploy the updated backend (the new code expects `user_streaks`, not `practice_days`). The migration must complete before the new backend goes live.
