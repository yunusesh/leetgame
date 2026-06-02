# Streak Redesign — 24h Window Flame States

## Goal

Replace the calendar-day streak system with a rolling time-based flame display: solid flame if practiced in the last 24 hours, hollow (greyed) flame if 24–48 hours ago, no flame after 48 hours. Streak count remains calendar-day-based (UTC). Replace the `practice_days` multi-row table with a single-row-per-user `user_streaks` table.

## Flame Display Rules

| Time since last practice | Flame | Streak shown |
|---|---|---|
| < 24h | 🔥 (solid) | yes |
| 24–48h | 🔥 (greyed, `opacity-50 grayscale`) | yes |
| ≥ 48h | none | no |

## Database

### New table

```sql
CREATE TABLE user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak            INT         NOT NULL DEFAULT 1 CHECK (streak >= 1),
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Replaces `practice_days`. One row per user; upserted on every practice completion.

### Migration

`MAX(day)::TIMESTAMPTZ` is cast with explicit UTC to avoid session-timezone drift:

```sql
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
) s;

DROP TABLE practice_days;
```

`schema.sql` is updated to reflect `user_streaks` only (remove `practice_days`).

## Backend

### Upsert SQL (`UpsertPracticeDay`)

Single statement handles all cases. Both sides of the day-boundary comparison use `DATE(... AT TIME ZONE 'UTC')` to ensure consistency regardless of DB session timezone:

```sql
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
```

### GetStreak

Reads one row with two manual `.Scan` targets (`&streak`, `&lastPracticedAt`). On `pgx.ErrNoRows` (user has never practiced), returns `StreakInfo{Streak: 0, LastPracticedAt: nil}` — `LastPracticedAt` is a pointer (`*time.Time`) so it serializes as `null` in JSON rather than the Go zero-time sentinel `"0001-01-01T00:00:00Z"`. The frontend null guard handles this correctly.

### New type: `types.StreakInfo`

Manual scanning is used (not `pgx.RowToStructByName`), so no `db` tags are needed:

```go
// types/streak_info.go
type StreakInfo struct {
    Streak          int        `json:"streak"`
    LastPracticedAt *time.Time `json:"last_practiced_at"`
}
```

### API response

Both `GET /api/streak` and `POST /api/streak` return:

```json
{ "streak": 7, "last_practiced_at": "2026-06-02T10:30:00Z" }
```

For a user who has never practiced: `{ "streak": 0, "last_practiced_at": null }`.

Status (`solid`/`hollow`/`none`) is not computed server-side — it is a display concern owned by the frontend.

### Files changed

| File | Change |
|---|---|
| `backend/db/schema.sql` | Replace `practice_days` with `user_streaks` |
| `internal/types/streak_info.go` | New file — `StreakInfo` struct |
| `internal/storage/storage.go` | `GetStreak` returns `(types.StreakInfo, error)` |
| `internal/storage/postgres/streak.go` | New SQL for both methods |
| `internal/storage/processcache/process_cache.go` | Passthrough updated to new signature |
| `internal/storage/processcache/process_cache_test.go` | `stubStorage.GetStreak` stub updated |
| `internal/handlers/streak.go` | Return `StreakInfo`; add `types` import |

## Frontend

### `api.ts`

```ts
getStreak(): Promise<{ streak: number; last_practiced_at: string | null }>
recordStreak(): Promise<{ streak: number; last_practiced_at: string | null }>
```

### `useAuth.ts`

Add `lastPracticedAt: string | null` state (initial value `null`). Reset to `null` on sign-out and in the unauthenticated branch of `INITIAL_SESSION`. Both `getStreak` and `recordStreak` `.then()` callbacks set **both** `streak` and `lastPracticedAt`:

```ts
getStreak().then(({ streak, last_practiced_at }) => {
  setStreak(streak)
  setLastPracticedAt(last_practiced_at)
}).catch(() => {})
```

Compute `streakStatus` with explicit `ms` definition and null guard:

```ts
const ms = lastPracticedAt === null ? Infinity : Date.now() - new Date(lastPracticedAt).getTime()
const streakStatus: 'solid' | 'hollow' | 'none' | null =
  lastPracticedAt === null ? null
  : ms < 864e5  ? 'solid'
  : ms < 1728e5 ? 'hollow'
  : 'none'
```

Expose `streakStatus` alongside `streak` from the hook.

### `NavBar.tsx`

Updated props: `streak: number | null`, `streakStatus: 'solid' | 'hollow' | 'none' | null`.

Preserve `data-tour="streak"` on the solid variant for the product tour:

```tsx
{streakStatus === 'solid' && (
  <span data-tour="streak" className="text-sm font-medium">🔥 {streak}</span>
)}
{streakStatus === 'hollow' && (
  <span data-tour="streak" className="text-sm font-medium opacity-50 grayscale">🔥 {streak}</span>
)}
```

### `App.tsx`

Destructure `streakStatus` from `useAuth` and pass both `streak` and `streakStatus` to `NavBar`.

## Out of Scope

- Per-user timezone support
- Stale `streakStatus` when tab wakes from sleep (would need a `setInterval` recomputation)
- Streak freeze / grace period
- Streak history or longest-streak tracking
