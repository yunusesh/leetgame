# Daily Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track consecutive practice days for logged-in users and show a flame icon + count in the NavBar.

**Architecture:** A `practice_days` table in Supabase Postgres stores one row per user per calendar day (UTC). When the LLM stream returns `stage: "complete"`, the frontend calls `POST /api/streak` which upserts today's row and returns the updated streak count. `GET /api/streak` is called on page load to initialise the display. The NavBar shows `🔥 N` when streak ≥ 1.

**Tech Stack:** Go + Fiber v2 (backend), pgx/v5 (Postgres), React 19 + TypeScript (frontend)

---

## File Map

**Created:**
- `backend/internal/storage/postgres/streak.go` — `UpsertPracticeDay` and `GetStreak` postgres implementations
- `backend/internal/handlers/streak.go` — `RecordStreak` and `GetStreak` handler methods

**Modified:**
- `backend/internal/storage/storage.go` — add `UpsertPracticeDay` and `GetStreak` to `Storage` interface
- `backend/internal/handlers/routes.go` — register `GET /api/streak` and `POST /api/streak`
- `frontend/src/api.ts` — add `recordStreak` and `getStreak` functions
- `frontend/src/App.tsx` — add `streak` state, fetch on session load, POST on complete
- `frontend/src/components/NavBar.tsx` — add `streak` prop, show flame when ≥ 1

---

## Task 1: Create practice_days table in Supabase

**This is a manual step — no code changes.**

- [ ] **Step 1: Run the SQL in the Supabase dashboard**

Go to your Supabase project → SQL Editor → New query. Paste and run:

```sql
CREATE TABLE practice_days (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, day)
);
```

- [ ] **Step 2: Verify the table exists**

In the Supabase dashboard → Table Editor, confirm `practice_days` appears with columns `user_id` (uuid) and `day` (date).

---

## Task 2: Backend storage layer

**Files:**
- Modify: `backend/internal/storage/storage.go`
- Create: `backend/internal/storage/postgres/streak.go`

- [ ] **Step 1: Add methods to the Storage interface**

In `backend/internal/storage/storage.go`, add a `// streaks` section after `// problems`:

```go
// streaks
UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error
GetStreak(ctx context.Context, userID uuid.UUID) (int, error)
```

The full file after the change:

```go
package storage

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetRandomProblemFiltered(ctx context.Context, q, difficulty string, tags []string, tagMatch, excludeID string) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
	SearchProblems(ctx context.Context, q, difficulty string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)
	GetProblemTags(ctx context.Context) ([]types.ProblemTag, error)

	// streaks
	UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error
	GetStreak(ctx context.Context, userID uuid.UUID) (int, error)
}
```

- [ ] **Step 2: Run to verify it fails to compile**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... 2>&1
```

Expected: compile error — `*postgres.Postgres does not implement storage.Storage (missing UpsertPracticeDay method)`.

- [ ] **Step 3: Create postgres/streak.go**

Create `backend/internal/storage/postgres/streak.go`:

```go
package postgres

import (
	"context"

	"leetgame/internal/utils"

	"github.com/google/uuid"
)

func (p *Postgres) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	const sql = `
		INSERT INTO practice_days (user_id, day)
		VALUES ($1, CURRENT_DATE)
		ON CONFLICT (user_id, day) DO NOTHING
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetStreak(ctx context.Context, userID uuid.UUID) (int, error) {
	const sql = `
		WITH ranked AS (
			SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
			FROM practice_days WHERE user_id = $1
		)
		SELECT COUNT(*) FROM ranked
		WHERE day = CURRENT_DATE - CAST(rn - 1 AS INTEGER)
	`
	return utils.Retry(ctx, func(ctx context.Context) (int, error) {
		var n int
		err := p.Pool.QueryRow(ctx, sql, userID).Scan(&n)
		return n, err
	})
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/storage/storage.go backend/internal/storage/postgres/streak.go
git commit -m "feat: add UpsertPracticeDay and GetStreak to storage layer"
```

---

## Task 3: Backend handlers and routes

**Files:**
- Create: `backend/internal/handlers/streak.go`
- Modify: `backend/internal/handlers/routes.go`

- [ ] **Step 1: Create handlers/streak.go**

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

	streak, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		Streak int `json:"streak"`
	}
	return c.JSON(response{Streak: streak})
}

func (hs *HandlerService) GetStreak(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	streak, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		Streak int `json:"streak"`
	}
	return c.JSON(response{Streak: streak})
}
```

- [ ] **Step 2: Register routes in routes.go**

In `backend/internal/handlers/routes.go`, add after `api.Post("/chat", hs.Chat)`:

```go
api.Get("/streak", hs.GetStreak)
api.Post("/streak", hs.RecordStreak)
```

The full routes.go after the change:

```go
package handlers

import (
	"net/http"

	"leetgame/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RegisterRoutes(app *fiber.App) {
	app.Route("/api", func(api fiber.Router) {
		api.Get("/healthcheck", func(c *fiber.Ctx) error {
			if err := hs.storage.Ping(c.Context()); err != nil {
				return c.Status(http.StatusInternalServerError).SendString("failed to ping database")
			}
			return c.SendStatus(http.StatusOK)
		})

		api.Use(middleware.OptionalAuth(hs.keyfunc))

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
			problems.Get("/tags", hs.GetProblemTags)
			problems.Get("/", hs.GetProblems)
		})

		api.Post("/chat", hs.Chat)
		api.Get("/streak", hs.GetStreak)
		api.Post("/streak", hs.RecordStreak)
	})
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... 2>&1
```

Expected: no errors.

- [ ] **Step 4: Run all backend tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./... 2>&1
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/streak.go backend/internal/handlers/routes.go
git commit -m "feat: add streak endpoints GET and POST /api/streak"
```

---

## Task 4: Frontend — api, state, and NavBar

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/NavBar.tsx`

- [ ] **Step 1: Add recordStreak and getStreak to api.ts**

At the end of `frontend/src/api.ts`, add:

```typescript
export async function getStreak(): Promise<{ streak: number }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}

export async function recordStreak(): Promise<{ streak: number }> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Add streak state to App.tsx**

In `frontend/src/App.tsx`:

**a) Add the import** — add `getStreak, recordStreak` to the existing import from `'./api'`:

```typescript
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getStreak, recordStreak } from './api'
```

**b) Add streak state** — add after the `streamingMessage` state:

```typescript
const [streak, setStreak] = useState<number | null>(null)
```

**c) Fetch streak on session load** — add a new `useEffect` after the auth `useEffect`:

```typescript
useEffect(() => {
  if (!session) {
    setStreak(null)
    return
  }
  getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
}, [session])
```

**d) Record streak on complete** — in `handleSubmit`, inside the `} else if (event.type === 'done') {` block, add after `setStage(event.stage)`:

```typescript
if (event.stage === 'complete' && session) {
  recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
}
```

The full updated `handleSubmit` done block:

```typescript
} else if (event.type === 'done') {
  setHistory([...nextHistory, { role: 'assistant', content: event.message }])
  setStage(event.stage)
  setStreamingMessage('')
  if (event.stage === 'complete' && session) {
    recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
  }
}
```

**e) Pass streak to NavBar** — update the NavBar usage:

```typescript
<NavBar view={view} onNavigate={setView} session={session} authLoading={authLoading} streak={streak} />
```

- [ ] **Step 3: Update NavBar to show the streak**

In `frontend/src/components/NavBar.tsx`:

**a) Add `streak` to the Props interface:**

```typescript
interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
}
```

**b) Destructure it:**

```typescript
export function NavBar({ view, onNavigate, session, authLoading, streak }: Props) {
```

**c) Show the flame inside the auth section.** Replace the `<div className="ml-auto ...">` block with:

```typescript
<div className="ml-auto flex items-center gap-2">
  {authLoading ? null : session ? (
    <>
      {streak !== null && streak >= 1 && (
        <span className="text-sm font-medium">🔥 {streak}</span>
      )}
      {session.user.user_metadata?.avatar_url && (
        <img
          src={session.user.user_metadata.avatar_url as string}
          alt="avatar"
          className="h-6 w-6 rounded-full"
        />
      )}
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {session.user.user_metadata?.name as string ?? session.user.email}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
        Sign out
      </Button>
    </>
  ) : (
    <Button size="sm" onClick={() => void handleSignIn()}>
      Sign in
    </Button>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/App.tsx frontend/src/components/NavBar.tsx
git commit -m "feat: add daily streak to frontend — flame icon in NavBar"
```
