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

```sql
INSERT INTO user_streaks (user_id, streak, last_practiced_at)
SELECT pd.user_id, s.streak,
  (SELECT MAX(day)::TIMESTAMPTZ FROM practice_days WHERE user_id = pd.user_id)
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

Single statement handles all cases. Day boundary uses explicit UTC to avoid session-timezone drift:

```sql
INSERT INTO user_streaks (user_id, streak, last_practiced_at)
VALUES ($1, 1, NOW())
ON CONFLICT (user_id) DO UPDATE SET
  streak = CASE
    WHEN DATE(user_streaks.last_practiced_at AT TIME ZONE 'UTC') = CURRENT_DATE
      THEN user_streaks.streak
    WHEN NOW() - user_streaks.last_practiced_at <= INTERVAL '48 hours'
      THEN user_streaks.streak + 1
    ELSE 1
  END,
  last_practiced_at = NOW()
```

### GetStreak

Reads one row, scans into `(streak int, lastPracticedAt time.Time)`. Returns zero-value `StreakInfo{}` (not an error) on `pgx.ErrNoRows`.

### New type: `types.StreakInfo`

```go
// types/streak_info.go
type StreakInfo struct {
    Streak          int       `json:"streak"`
    LastPracticedAt time.Time `json:"last_practiced_at"`
}
```

### API response

Both `GET /api/streak` and `POST /api/streak` return:

```json
{ "streak": 7, "last_practiced_at": "2026-06-02T10:30:00Z" }
```

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
getStreak(): Promise<{ streak: number; last_practiced_at: string }>
recordStreak(): Promise<{ streak: number; last_practiced_at: string }>
```

### `useAuth.ts`

Add `lastPracticedAt: string | null` state. Both `getStreak` and `recordStreak` `.then()` callbacks set both `streak` and `lastPracticedAt`. Compute `streakStatus` with null guard:

```ts
const streakStatus: 'solid' | 'hollow' | 'none' | null = lastPracticedAt === null
  ? null
  : ms < 864e5 ? 'solid'
  : ms < 1728e5 ? 'hollow'
  : 'none'
```

Expose `streakStatus` alongside `streak` from the hook.

### `NavBar.tsx`

Updated props: `streak: number | null`, `streakStatus: 'solid' | 'hollow' | 'none' | null`.

```tsx
{streakStatus === 'solid' && <span className="text-sm font-medium">🔥 {streak}</span>}
{streakStatus === 'hollow' && <span className="text-sm font-medium opacity-50 grayscale">🔥 {streak}</span>}
```

### `App.tsx`

Pass both `streak` and `streakStatus` to `NavBar`.

## Out of Scope

- Per-user timezone support
- Streak freeze / grace period items
- Streak history or longest-streak tracking
