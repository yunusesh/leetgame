# Configurable Practice Stages — Design Spec

## Goal

Allow users to select which practice stages the LLM takes them through per problem. Defaults are lean (3 stages) for fast reps; power users can enable all 5 for full interview simulation.

## Architecture

The frontend owns the active stages list and sends it with every chat request. The backend receives it, builds the LLM prompt dynamically, and validates the current stage against the active list. No DB lookup on the hot path.

User preferences are persisted in a `user_settings` table for authenticated users and in `localStorage` for unauthenticated users.

---

## Data Model

### Stages

Five canonical stage IDs in fixed canonical order:

| ID | Label | Description |
|----|-------|-------------|
| `edge_cases` | Edge Cases | Identify gotchas and boundary conditions |
| `brute_force` | Brute Force | Describe the naive solution |
| `pattern` | Optimal Pattern | Identify the algorithm pattern for the optimal solution |
| `algorithm` | Optimal Algorithm | Describe the optimal algorithm |
| `tc_sc` | Time & Space Complexity | State time and space complexity |

`complete` is the terminal state — never in the active stages list, always the final stage returned by the LLM when the last active stage is passed.

**Default active stages:** `["pattern", "algorithm", "tc_sc"]`

### DB Table

```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages TEXT[] NOT NULL DEFAULT '{pattern,algorithm,tc_sc}'
);
```

Upsert on save. Row is created on first PUT or lazily on first GET (returns default if missing).

---

## Backend

### LLM Prompt

`SystemPromptTemplate` is rewritten to accept a dynamic ordered stage list. The prompt:
- Lists only the active stages and their sequence (e.g. "Stage 0 — Pattern, Stage 1 — Algorithm, Stage 2 — TC/SC")
- Describes evaluation criteria and Socratic behavior for each active stage
- Instructs the LLM to return the next stage in the active list on success, or `complete` after the last stage
- JSON response format unchanged: `{"message": "...", "stage": "..."}`

### Chat Request

`ChatRequest` gains `ActiveStages []string` field:

```go
type ChatRequest struct {
    ProblemID    uuid.UUID        `json:"problem_id"`
    Stage        string           `json:"stage"`
    ActiveStages []string         `json:"active_stages"`
    History      []HistoryMessage `json:"history"`
    Message      string           `json:"message"`
}
```

Validation:
- `active_stages` must be non-empty
- Each element must be one of: `edge_cases`, `brute_force`, `pattern`, `algorithm`, `tc_sc`
- No duplicates
- `stage` must be one of the values in `active_stages` (not a hardcoded list)

### LLM Client Interface

`Evaluate` signature gains `activeStages []string`:

```go
Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, onToken func(string)) (EvaluateResponse, error)
```

### Settings Endpoints

Both routes require auth (`RequireAuth` middleware):

```
GET  /api/settings  → { "active_stages": ["pattern", "algorithm", "tc_sc"] }
PUT  /api/settings  → body: { "active_stages": [...] } → 200 OK
```

`GET` returns the default if no row exists for the user (no auto-create on GET).
`PUT` upserts.

New storage methods:
```go
GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error)
UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string) error
```

New model:
```go
type UserSettings struct {
    UserID       uuid.UUID `json:"user_id" db:"user_id"`
    ActiveStages []string  `json:"active_stages" db:"active_stages"`
}
```

---

## Frontend

### Types

```typescript
export type Stage =
  | 'edge_cases'
  | 'brute_force'
  | 'pattern'
  | 'algorithm'
  | 'tc_sc'
  | 'complete'

export const CANONICAL_STAGES: Exclude<Stage, 'complete'>[] = [
  'edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc'
]

export const DEFAULT_STAGES: Exclude<Stage, 'complete'>[] = [
  'pattern', 'algorithm', 'tc_sc'
]
```

### Active Stages State

`App.tsx` gains:
```typescript
const [activeStages, setActiveStages] = useState<Stage[]>(DEFAULT_STAGES)
```

On mount (after auth resolves):
- Logged in → `GET /api/settings`, set `activeStages`
- Logged out → read from `localStorage` key `leetgame_active_stages`, fall back to `DEFAULT_STAGES`

### Chat API

`streamChat` gains `activeStages` param, sends it in the request body.

### Stage Progression

Stage advancement is driven by the active stages array:
- `nextStage(current, activeStages)` → returns the next stage in the list, or `'complete'` if current is the last
- Completion banner shown when `stage === 'complete'`
- Stage banner text covers all 5 stages

### Settings UI

New settings panel accessible from a gear icon in the NavBar (shown only when not auth-loading). The panel is a simple popover/sheet with:

- 5 toggle rows, one per stage, in canonical order
- Each row: stage name + one-line description + toggle
- At least one stage must remain enabled (last active stage cannot be toggled off)
- Changes apply immediately:
  - Logged in: debounced PUT to `/api/settings` (300ms)
  - Logged out: write to `localStorage`

The panel does not reset the current practice session — active stages only take effect on the next problem load.

---

## Error Handling

- `GET /api/settings` with no existing row → return default `{ active_stages: ["pattern", "algorithm", "tc_sc"] }`
- `PUT /api/settings` with invalid stages → 422 with field errors
- `POST /api/chat` with invalid/missing `active_stages` → 422
- localStorage read failure → silently fall back to `DEFAULT_STAGES`

---

## Out of Scope

- Per-problem stage override
- Stage reordering by the user (canonical order is fixed)
- Analytics on which stages users skip

---

## Notes

- The LLM-returned stage is validated in the claude/ollama clients against `activeStages` — if the returned stage is not in the active list and is not `complete`, it is treated as a JSON parse failure (raw text fallback).
- Changing active stages mid-session (via the settings panel) takes effect on the next problem only. The current session continues with whatever stages were active when the problem was loaded. This is intentional — changing stages mid-conversation would break the LLM's context.
