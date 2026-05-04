# Problem Search Design

## Goal

Add a search page where users can find problems by title, difficulty, and topic tags, then jump directly into the practice view for any result.

## Architecture

State-based navigation in `App.tsx` — a `view` field switches between `'practice'` and `'search'`. No router added. A nav bar sits at the top of both views. Selecting a problem from search sets it as the active problem and switches to the practice view.

## Backend

**New endpoint:** `GET /api/problems`

Query params (all optional):
- `q` — case-insensitive substring match on `title`
- `difficulty` — one of `Easy`, `Medium`, `Hard`
- `tags` — comma-separated list; matches problems containing ALL specified tags

Returns `[]Problem` (same struct as existing endpoints), capped at 50 results. No params returns up to 50 problems.

**New storage method:** `SearchProblems(ctx context.Context, q, difficulty string, tags []string) ([]models.Problem, error)` in `internal/storage/postgres/problems.go`. Uses squirrel for dynamic WHERE clause construction.

**New handler:** `GetProblems(c *fiber.Ctx) error` in `internal/handlers/problems.go`. Parses query params, calls `SearchProblems`, returns JSON array.

**Route:** `problems.Get("/", hs.GetProblems)` added to the existing `/api/problems` route group in `routes.go`.

## Frontend

**Navigation**

A fixed nav bar at the top of both views with two buttons: "Practice" and "Search". Switches `view` state in `App.tsx`.

**`App.tsx` changes**

- Add `view: 'practice' | 'search'` state, default `'practice'`
- Add `selectedProblem: Problem | null` state — set when user clicks a search result, cleared on skip
- Pass `selectedProblem` to practice view; if set, use it instead of fetching random
- Pass `onSelectProblem` callback to `SearchPage`

**`SearchPage` component** (`frontend/src/components/SearchPage.tsx`)

- Text input for title search
- Difficulty toggle: All / Easy / Medium / Hard (single select)
- Tag filter: text input that adds tags to an active filter list, with removable chips
- Results list: each row shows title, difficulty badge, topic tags
- Search fires on input change (debounced 300ms) and on filter change
- Clicking a result calls `onSelectProblem(problem)` which sets the selected problem and switches view to `'practice'`
- Empty state: "No problems found" when results are empty

**`api.ts` changes**

New function: `searchProblems(q: string, difficulty: string, tags: string[]) => Promise<Problem[]>`

## Data flow

```
User types in search → debounced GET /api/problems?q=...&difficulty=...&tags=...
→ results rendered in list
→ user clicks result → onSelectProblem(problem) → view = 'practice', problem pre-loaded
→ user can chat, skip (loads random), or go back to search via nav
```

## Error handling

- Search errors show inline message in results area, don't crash the page
- Empty results show "No problems found"
- Practice view error handling unchanged
