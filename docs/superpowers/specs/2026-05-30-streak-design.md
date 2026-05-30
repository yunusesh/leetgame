# Daily Streak Design

## Goal

Track how many consecutive days a logged-in user has completed at least one problem (reaching the `complete` stage). Show a flame icon and count in the NavBar.

## Trigger

A "practice day" is recorded when the LLM stream returns `stage: "complete"` — meaning the user completed the full pattern → algorithm → complexity flow. Multiple completions on the same day count as one practice day.

## Data Layer

Single table in Supabase Postgres:

```sql
CREATE TABLE practice_days (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, day)
);
```

- One row per user per calendar day (UTC).
- `ON DELETE CASCADE` removes rows if the user is deleted.
- Upserts on `(user_id, day)` — duplicate completions same day are no-ops.
- Created once via the Supabase dashboard SQL editor.

## Backend API

Two new endpoints in the `/api` route group, both behind `RequireAuth`.

### `POST /api/streak`

Records today's practice and returns the updated streak.

- Upserts `(user_id, CURRENT_DATE)` into `practice_days`.
- Computes and returns current streak.
- Response: `{ "streak": N }`

### `GET /api/streak`

Returns the current streak without recording anything.

- Response: `{ "streak": N }`

### Streak computation SQL

```sql
WITH ranked AS (
  SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
  FROM practice_days WHERE user_id = $1
)
SELECT COUNT(*) FROM ranked
WHERE day = CURRENT_DATE - CAST(rn - 1 AS INTEGER)
```

Counts consecutive days from today backwards. A gap of one day resets the count to zero.

## Backend Implementation

Following existing patterns:

- **Model:** `backend/internal/models/streak.go` — `StreakResponse { Streak int }`
- **Storage:** add `UpsertPracticeDay` and `GetStreak` methods to `storage.Storage` interface; implement in `backend/internal/storage/postgres/streak.go`
- **Handler:** `backend/internal/handlers/streak.go` — `RecordStreak` (POST) and `GetStreak` (GET) methods on `HandlerService`
- **Routes:** register in `backend/internal/handlers/routes.go` under `/api/streak` behind `RequireAuth`

## Frontend

### App.tsx

In `handleSubmit`, when the SSE stream returns `stage === "complete"` and `session` is non-null, call `POST /api/streak`. Store the returned streak count in a new `streak: number | null` state variable and pass it to NavBar.

On session load (when session becomes non-null), call `GET /api/streak` to initialise the streak count.

### NavBar

New prop: `streak: number | null`

When `streak` is a number ≥ 1 and the user is logged in, show `🔥 {streak}` between the nav toggle buttons and the user info section.

```
[Practice] [Search]          🔥 5   [avatar] Aaron   [Sign out]
```

Hidden when `streak` is null (not logged in, loading, or zero).

## Error Handling

- `POST /api/streak` failure is silent on the frontend — streak display just doesn't update. It doesn't interrupt the completion flow.
- `GET /api/streak` failure on load leaves streak as null — flame is hidden.

## Out of Scope

- Timezone handling (UTC only for now)
- Longest streak / streak history
- Streak freeze / grace period
- Push notifications
