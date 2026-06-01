# Trend Over Time Design

## Goal

Show users how their topic proficiency scores have changed over the last 30 days by expanding any topic card in the stats page to reveal a line chart.

## Architecture

A nightly pg_cron job snapshots current scores from `topic_proficiency` into a new `proficiency_score_snapshots` table. A new backend endpoint exposes the last 30 days of snapshots. The stats page fetches history upfront alongside existing proficiency data and renders an inline line chart when a topic card is expanded.

## Tech Stack

- **Chart library:** shadcn/ui chart component (`npx shadcn add chart`) — wraps Recharts v3, auto-respects app theme
- **Backend:** Go/Fiber, pgx, existing patterns
- **Cron:** pg_cron (already enabled)

---

## Section 1: Data Layer

### New table

```sql
CREATE TABLE IF NOT EXISTS proficiency_score_snapshots (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic         TEXT  NOT NULL,
  stage         TEXT  NOT NULL,
  score         FLOAT NOT NULL,
  snapshot_date DATE  NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, topic, stage, snapshot_date)
);
```

Primary key prevents duplicate snapshots on the same date if the cron runs twice.

### pg_cron jobs

Two jobs added to `schema.sql`:

**Nightly snapshot** (2am UTC) — copies all rows from `topic_proficiency` into the snapshot table:

```sql
SELECT cron.schedule('snapshot-proficiency-scores', '0 2 * * *', $$
  INSERT INTO proficiency_score_snapshots (user_id, topic, stage, score, snapshot_date)
  SELECT user_id, topic, stage, score, CURRENT_DATE
  FROM topic_proficiency
  ON CONFLICT DO NOTHING
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snapshot-proficiency-scores'
);
```

**Cleanup** (3am UTC) — deletes rows older than 90 days:

```sql
SELECT cron.schedule('cleanup-proficiency-snapshots', '30 3 * * *', $$
  DELETE FROM proficiency_score_snapshots WHERE snapshot_date < CURRENT_DATE - 90
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-snapshots'
);
```

90 days retained; chart shows last 30. Extra headroom for future flexibility.

### Scale

Max rows per user: 23 topics × 5 stages × 90 days = 10,350. Very manageable.

---

## Section 2: Backend

### New model

`backend/internal/models/proficiency_snapshot.go`:

```go
package models

type ProficiencySnapshot struct {
    Topic        string  `json:"topic"         db:"topic"`
    Stage        string  `json:"stage"         db:"stage"`
    Score        float64 `json:"score"         db:"score"`
    SnapshotDate string  `json:"snapshot_date" db:"snapshot_date"`
}
```

`SnapshotDate` is a `string` (ISO date `"2026-06-01"`) — no need for `time.Time` since it's passed straight to JSON.

### Storage

New method on `Postgres` in `backend/internal/storage/postgres/proficiency.go`:

```go
func (p *Postgres) GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error)
```

SQL: select `topic`, `stage`, `score`, `snapshot_date::text AS snapshot_date` from `proficiency_score_snapshots` where `user_id = $1` and `snapshot_date >= CURRENT_DATE - 30`, ordered by `(topic, stage, snapshot_date ASC)`. The `::text` cast ensures pgx scans the DATE value directly into the `string` field without needing `time.Time`.

### Storage interface

`backend/internal/storage/storage.go` — add to proficiency group:

```go
GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error)
```

### Handler

New file `backend/internal/handlers/proficiency.go`:

```go
// GET /api/proficiency/history
func (hs *HandlerService) GetProficiencyHistory(c *fiber.Ctx) error
```

- Gets `userID` via `xcontext.GetUserId(c)`
- Calls `hs.storage.GetProficiencyHistory(ctx, userID)`
- Returns `{ "history": [...] }`

### Route

In `handlers/routes.go`, inside the `RequireAuth` group:

```
GET /api/proficiency/history → hs.GetProficiencyHistory
```

---

## Section 3: Frontend

### New type

`frontend/src/types.ts`:

```ts
export interface ProficiencySnapshot {
  topic: string
  stage: string
  score: number
  snapshot_date: string
}
```

### New API function

`frontend/src/api.ts`:

```ts
export async function getProficiencyHistory(signal?: AbortSignal): Promise<ProficiencySnapshot[]>
```

Calls `GET /api/proficiency/history`, returns `data.history`.

### StatsPage changes

`frontend/src/components/StatsPage.tsx`:

**Data fetching:** Add `getProficiencyHistory` to the existing `Promise.all` — three parallel fetches. History stored in `history: ProficiencySnapshot[]` state.

**Expand state:** `const [expandedTopic, setExpandedTopic] = useState<string | null>(null)` — only one topic expanded at a time.

**Topic card header:** Add a `▸/▾` toggle button. Clicking toggles `expandedTopic` between the topic name and `null`.

**Expanded content:** Rendered beneath the score bars when `expandedTopic === topic`:

- Install shadcn chart: `npx shadcn add chart`
- Use `LineChart` from shadcn/recharts
- X-axis: `snapshot_date` values (formatted as `MMM D`)
- Y-axis: 0–100, tick formatter adds `%`
- 6 lines:
  - One per stage: `edge_cases`, `brute_force`, `pattern`, `algorithm`, `tc_sc` — colored distinctly, labeled with `stageLabel` display names
  - One `Overall` line — average score across all stages for each date
- Data shape fed to chart: array of `{ date, edge_cases, brute_force, pattern, algorithm, tc_sc, overall }` objects, one per unique `snapshot_date`
- Empty state: if no history rows exist for this topic, render `"Practice more sessions to see your trend"` instead of the chart

### Chart data transformation

Pure function `buildChartData(history: ProficiencySnapshot[], topic: string)`:
- Filter to `topic`
- Group by `snapshot_date`
- For each date, build one object with a key per stage and an `overall` key (average)
- Return sorted by date ascending
