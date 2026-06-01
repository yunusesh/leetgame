# Trend Over Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-topic line chart (5 stages + overall) in the stats page, powered by nightly score snapshots.

**Architecture:** A pg_cron job snapshots `topic_proficiency` scores nightly into `proficiency_score_snapshots`. A new `GET /api/proficiency/history` endpoint serves the last 30 days. The stats page fetches history upfront alongside proficiency data and renders an inline collapsible line chart per topic card using the shadcn chart component (Recharts v3).

**Tech Stack:** Go/Fiber/pgx, PostgreSQL pg_cron, React 19, shadcn/ui chart (Recharts v3), TypeScript

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/db/schema.sql` | Modify | Add snapshot table + 2 cron jobs |
| `backend/internal/models/proficiency_snapshot.go` | Create | `ProficiencySnapshot` model |
| `backend/internal/storage/storage.go` | Modify | Add `GetProficiencyHistory` to interface |
| `backend/internal/storage/postgres/proficiency.go` | Modify | Implement `GetProficiencyHistory` |
| `backend/internal/handlers/proficiency.go` | Create | `GetProficiencyHistory` handler |
| `backend/internal/handlers/routes.go` | Modify | Register `GET /api/proficiency/history` |
| `frontend/src/types.ts` | Modify | Add `ProficiencySnapshot` type |
| `frontend/src/api.ts` | Modify | Add `getProficiencyHistory` function |
| `frontend/src/components/ui/chart.tsx` | Create (via CLI) | shadcn chart component |
| `frontend/src/components/StatsPage.tsx` | Modify | History fetch, expand toggle, line chart |

---

## Task 1: Schema — snapshot table and cron jobs

**Files:**
- Modify: `backend/db/schema.sql`

**Context:** The schema already has `proficiency_sessions` and two pg_cron jobs as a reference. Add after the `proficiency_sessions` table definition.

- [ ] **Step 1: Add snapshot table and cron jobs to schema.sql**

Open `backend/db/schema.sql` and append after the `proficiency_sessions` block:

```sql
CREATE TABLE IF NOT EXISTS proficiency_score_snapshots (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic         TEXT  NOT NULL,
  stage         TEXT  NOT NULL,
  score         FLOAT NOT NULL,
  snapshot_date DATE  NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, topic, stage, snapshot_date)
);

-- nightly snapshot at 2am UTC: copy current scores into history
SELECT cron.schedule('snapshot-proficiency-scores', '0 2 * * *', $$
  INSERT INTO proficiency_score_snapshots (user_id, topic, stage, score, snapshot_date)
  SELECT user_id, topic, stage, score, CURRENT_DATE
  FROM topic_proficiency
  ON CONFLICT DO NOTHING
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snapshot-proficiency-scores'
);

-- cleanup: delete snapshots older than 90 days at 3:30am UTC
SELECT cron.schedule('cleanup-proficiency-snapshots', '30 3 * * *', $$
  DELETE FROM proficiency_score_snapshots WHERE snapshot_date < CURRENT_DATE - 90
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-snapshots'
);
```

- [ ] **Step 2: Commit**

```bash
git add backend/db/schema.sql
git commit -m "feat: add proficiency_score_snapshots table and cron jobs"
```

---

## Task 2: Backend model and storage interface

**Files:**
- Create: `backend/internal/models/proficiency_snapshot.go`
- Modify: `backend/internal/storage/storage.go`

**Context:** Models follow the pattern in `backend/internal/models/topic_proficiency.go` — all fields have `json` and `db` tags. The storage interface in `storage.go` groups methods by domain with inline comments.

- [ ] **Step 1: Create the model**

Create `backend/internal/models/proficiency_snapshot.go`:

```go
package models

import "time"

type ProficiencySnapshot struct {
	Topic        string    `json:"topic"         db:"topic"`
	Stage        string    `json:"stage"         db:"stage"`
	Score        float64   `json:"score"         db:"score"`
	SnapshotDate time.Time `json:"snapshot_date" db:"snapshot_date"`
}
```

- [ ] **Step 2: Add method to storage interface**

In `backend/internal/storage/storage.go`, add `GetProficiencyHistory` to the `// topic proficiency` group:

```go
// topic proficiency
UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error
GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error)
GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error)
```

- [ ] **Step 3: Verify the project builds**

```bash
cd backend && go build ./...
```

Expected: build error because `GetProficiencyHistory` is not yet implemented on `Postgres`. That's correct — the interface is defined but the implementation is in the next task.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/models/proficiency_snapshot.go backend/internal/storage/storage.go
git commit -m "feat: add ProficiencySnapshot model and GetProficiencyHistory to storage interface"
```

---

## Task 3: Storage implementation

**Files:**
- Modify: `backend/internal/storage/postgres/proficiency.go`

**Context:** Existing methods in this file use `utils.Retry`, `pgx.CollectRows`, and `pgx.RowToStructByName`. Follow that pattern exactly. The `SnapshotDate` field is `time.Time` — pgx scans `DATE` columns into `time.Time` correctly with no casting needed. The handler (Task 4) handles formatting.

- [ ] **Step 1: Add GetProficiencyHistory to proficiency.go**

Append to `backend/internal/storage/postgres/proficiency.go`:

```go
func (p *Postgres) GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error) {
	const q = `
		SELECT topic, stage, score, snapshot_date
		FROM proficiency_score_snapshots
		WHERE user_id = $1
		  AND snapshot_date >= CURRENT_DATE - 30
		ORDER BY topic, stage, snapshot_date ASC`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.ProficiencySnapshot, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.ProficiencySnapshot])
	})
}
```

- [ ] **Step 2: Verify the project builds**

```bash
cd backend && go build ./...
```

Expected: clean build. The interface is now satisfied.

- [ ] **Step 3: Run existing tests to confirm no regressions**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/storage/postgres/proficiency.go
git commit -m "feat: implement GetProficiencyHistory storage method"
```

---

## Task 4: Handler and route

**Files:**
- Create: `backend/internal/handlers/proficiency.go`
- Modify: `backend/internal/handlers/routes.go`

**Context:** Handlers follow the pattern in `backend/internal/handlers/streak.go`. Use `xcontext.GetUserID(c)` for the user ID. The `SnapshotDate` field is `time.Time` — format it as `"2006-01-02"` in an inline response struct so the frontend receives ISO date strings. The route goes inside the existing `/api/proficiency` group in `routes.go`.

- [ ] **Step 1: Create the handler**

Create `backend/internal/handlers/proficiency.go`:

```go
package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetProficiencyHistory(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	snapshots, err := hs.storage.GetProficiencyHistory(c.Context(), uid)
	if err != nil {
		return err
	}

	type snapshotResponse struct {
		Topic        string  `json:"topic"`
		Stage        string  `json:"stage"`
		Score        float64 `json:"score"`
		SnapshotDate string  `json:"snapshot_date"`
	}

	resp := make([]snapshotResponse, len(snapshots))
	for i, s := range snapshots {
		resp[i] = snapshotResponse{
			Topic:        s.Topic,
			Stage:        s.Stage,
			Score:        s.Score,
			SnapshotDate: s.SnapshotDate.Format("2006-01-02"),
		}
	}

	type response struct {
		History []snapshotResponse `json:"history"`
	}
	return c.JSON(response{History: resp})
}
```

- [ ] **Step 2: Register the route**

In `backend/internal/handlers/routes.go`, add `history` to the existing `/proficiency` group:

```go
api.Route("/proficiency", func(proficiency fiber.Router) {
    proficiency.Use(middleware.RequireAuth(hs.keyfunc))
    proficiency.Get("/", hs.GetProficiency)
    proficiency.Get("/history", hs.GetProficiencyHistory)
})
```

- [ ] **Step 3: Build and test**

```bash
cd backend && go build ./... && go test ./...
```

Expected: clean build, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/proficiency.go backend/internal/handlers/routes.go
git commit -m "feat: add GET /api/proficiency/history endpoint"
```

---

## Task 5: Frontend types and API function

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

**Context:** `types.ts` already exports `TopicProficiency`, `ProblemTag`, etc. `api.ts` exports `getProficiency` which follows the exact pattern to copy for `getProficiencyHistory`. The backend returns `{ history: [...] }`.

- [ ] **Step 1: Add ProficiencySnapshot type to types.ts**

In `frontend/src/types.ts`, add after `TopicProficiency`:

```ts
export interface ProficiencySnapshot {
  topic: string
  stage: string
  score: number
  snapshot_date: string
}
```

- [ ] **Step 2: Add getProficiencyHistory to api.ts**

In `frontend/src/api.ts`, first add `ProficiencySnapshot` to the import line at the top:

```ts
import type { Problem, ChatMessage, Stage, ActiveStage, ProblemSearchResponse, ProblemTag, TopicProficiency, ProficiencySnapshot } from './types'
```

Then append the new function at the bottom of the file:

```ts
export async function getProficiencyHistory(signal?: AbortSignal): Promise<ProficiencySnapshot[]> {
  const res = await fetch(`${API_URL}/api/proficiency/history`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok) throw new Error(`Failed to fetch proficiency history: ${res.status}`)
  const data = await res.json()
  return data.history
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: add ProficiencySnapshot type and getProficiencyHistory API function"
```

---

## Task 6: Install shadcn chart component

**Files:**
- Create: `frontend/src/components/ui/chart.tsx` (via CLI)
- Modify: `frontend/package.json` (recharts added as dependency)

**Context:** The project already uses shadcn/ui components (Button, etc.) in `frontend/src/components/ui/`. The shadcn CLI adds the chart component and installs recharts. Run from the `frontend/` directory.

- [ ] **Step 1: Install the chart component**

```bash
cd frontend && npx shadcn@latest add chart
```

When prompted "Would you like to install recharts?", answer `y`. This creates `frontend/src/components/ui/chart.tsx` and adds `recharts` to `package.json`.

- [ ] **Step 2: Verify recharts is in package.json**

```bash
grep recharts frontend/package.json
```

Expected: `"recharts": "..."` in dependencies.

- [ ] **Step 3: Verify the dev build compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds (zero TypeScript errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/chart.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: install shadcn chart component (recharts)"
```

---

## Task 7: StatsPage — history fetch, expand toggle, and line chart

**Files:**
- Modify: `frontend/src/components/StatsPage.tsx`

**Context:** `StatsPage.tsx` already fetches proficiency and tags in a `Promise.all`. The component renders topic cards with score bars. Read the current file before editing — it's 191 lines. Key patterns to follow: `activeSet` for O(1) lookups; inline `topicPicker` JSX defined before early returns; `cn()` for conditional classes.

The chart uses shadcn's `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` wrappers around Recharts primitives (`LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`). Each line key must match a key in the `chartConfig` object.

The `buildChartData` pure function is defined outside the component. It takes the full history array and a topic string, groups by date, and returns sorted chart-ready data with an `overall` field.

- [ ] **Step 1: Add imports and buildChartData**

At the top of `frontend/src/components/StatsPage.tsx`, update the import block:

```ts
import { useEffect, useState } from 'react'
import type { TopicProficiency, ProblemTag, ProficiencySnapshot } from '../types'
import { getProficiency, getProblemTags, getProficiencyHistory } from '../api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
```

Then define these constants and function **outside** the component (above the `stageLabel` const):

```ts
const STAGES = ['edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc'] as const

const chartConfig = {
  edge_cases:  { label: 'Edge Cases',   color: 'hsl(var(--chart-1))' },
  brute_force: { label: 'Brute Force',  color: 'hsl(var(--chart-2))' },
  pattern:     { label: 'Pattern',      color: 'hsl(var(--chart-3))' },
  algorithm:   { label: 'Algorithm',    color: 'hsl(var(--chart-4))' },
  tc_sc:       { label: 'Time & Space', color: 'hsl(var(--chart-5))' },
  overall:     { label: 'Overall',      color: 'hsl(var(--foreground))' },
} as const

interface ChartPoint {
  date: string
  edge_cases?: number
  brute_force?: number
  pattern?: number
  algorithm?: number
  tc_sc?: number
  overall: number
}

function buildChartData(history: ProficiencySnapshot[], topic: string): ChartPoint[] {
  const topicHistory = history.filter(s => s.topic === topic)
  const byDate = new Map<string, Partial<Record<string, number>>>()
  for (const s of topicHistory) {
    const existing = byDate.get(s.snapshot_date) ?? {}
    existing[s.stage] = Math.round(s.score * 100)
    byDate.set(s.snapshot_date, existing)
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stages]) => {
      const values = Object.values(stages) as number[]
      const overall = values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0
      return { date, ...stages, overall } as ChartPoint
    })
}
```

- [ ] **Step 2: Add history state, expand state, and update data fetching**

Inside the `StatsPage` component, add the new state variables after the existing ones:

```ts
const [history, setHistory] = useState<ProficiencySnapshot[]>([])
const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
```

Replace the existing `useEffect` `Promise.all` call with one that includes history:

```ts
useEffect(() => {
  const controller = new AbortController()
  Promise.all([
    getProficiency(controller.signal),
    getProblemTags(controller.signal),
    getProficiencyHistory(controller.signal),
  ])
    .then(([prof, tags, hist]) => {
      if (!controller.signal.aborted) {
        setProficiencies(prof)
        setAllTags(tags)
        setHistory(hist)
        setFetchError(false)
      }
    })
    .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
    .finally(() => { if (!controller.signal.aborted) setLoading(false) })
  return () => controller.abort()
}, [])
```

- [ ] **Step 3: Add the expand toggle and chart to each topic card**

Replace the topic card render in the final `return` block. Find the existing:

```tsx
{topics.map(({ topic, rows }) => (
  <div key={topic} className="rounded-md border border-border bg-muted p-4">
    <p className="text-sm font-semibold mb-3">{topic}</p>
    <div className="flex flex-col gap-2">
      {rows.map(row => (
        <div key={row.stage} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-24 shrink-0">
            {stageLabel[row.stage] ?? row.stage}
          </span>
          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                row.score >= 0.7 ? "bg-green-500" :
                row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
              )}
              style={{ width: `${Math.round(row.score * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
            {Math.round(row.score * 100)}%
          </span>
        </div>
      ))}
    </div>
  </div>
))}
```

Replace with:

```tsx
{topics.map(({ topic, rows }) => {
  const isExpanded = expandedTopic === topic
  const chartData = buildChartData(history, topic)
  return (
    <div key={topic} className="rounded-md border border-border bg-muted p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">{topic}</p>
        <button
          onClick={() => setExpandedTopic(isExpanded ? null : topic)}
          aria-expanded={isExpanded}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? '▾ Hide trend' : '▸ Show trend'}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(row => (
          <div key={row.stage} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0">
              {stageLabel[row.stage] ?? row.stage}
            </span>
            <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  row.score >= 0.7 ? "bg-green-500" :
                  row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                )}
                style={{ width: `${Math.round(row.score * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
              {Math.round(row.score * 100)}%
            </span>
          </div>
        ))}
      </div>
      {isExpanded && (
        <div className="mt-4">
          {chartData.length === 0 ? (
            <p className="text-xs text-muted-foreground">Practice more sessions to see your trend.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-48 w-full">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => {
                    const date = new Date(d + 'T00:00:00')
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {STAGES.map(stage => (
                  <Line
                    key={stage}
                    type="monotone"
                    dataKey={stage}
                    stroke={chartConfig[stage].color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="overall"
                  stroke={chartConfig.overall.color}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 2"
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          )}
        </div>
      )}
    </div>
  )
})}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and test visually**

```bash
cd frontend && npm run dev
```

Open the stats page. Verify:
1. Each topic card shows `▸ Show trend` toggle
2. Clicking expands to show either the chart or the empty-state message
3. Clicking again collapses
4. Only one topic is expanded at a time (clicking a second topic collapses the first)
5. Chart has 6 lines when data exists: 5 stage lines + 1 dashed overall line
6. X-axis shows dates formatted as "Jun 1"
7. Y-axis shows 0%–100%
8. Tooltip shows on hover

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StatsPage.tsx
git commit -m "feat: add collapsible trend chart to topic cards in StatsPage"
```
