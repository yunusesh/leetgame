# LeetCode ID + Search State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `leetcode_id` (LeetCode problem number) to the DB and UI, sort search results by it, display it as `#N` in the problem title and search results, and preserve search state across tab switches.

**Architecture:** Add a nullable `INT` column `leetcode_id` to the `problems` table. Backfill it from the HuggingFace dataset using a Python script. Update all backend SQL queries to include the column and sort by it. Lift `SearchPage` state up to `App.tsx` so it survives tab switches — `SearchPage` becomes a controlled component that receives state as props.

**Tech Stack:** Go/Fiber backend, pgx/squirrel, React 19 + TypeScript + Tailwind v4, Python/psycopg2 for backfill

---

## File Structure

**Backend (modify):**
- `backend/db/schema.sql` — add `leetcode_id INT` column
- `backend/internal/models/problem.go` — add `LeetcodeID *int` field
- `backend/internal/storage/postgres/problems.go` — add column to all SELECT queries, change `OrderBy("title ASC")` to `OrderBy("leetcode_id ASC NULLS LAST")`

**Scripts (modify):**
- `scripts/seed.py` — add `question_id` field to INSERT
- `scripts/backfill_leetcode_id.py` (create) — one-time backfill script

**Frontend (modify):**
- `frontend/src/types.ts` — add `leetcode_id: number | null` to `Problem`
- `frontend/src/App.tsx` — lift search state up, pass as props to `SearchPage`
- `frontend/src/components/SearchPage.tsx` — accept lifted state as props, remove internal state for lifted fields, show `#N` in results
- `frontend/src/components/ProblemView.tsx` — show `#N` in problem header

---

### Task 1: Add `leetcode_id` to DB schema and backend model

**Files:**
- Modify: `backend/db/schema.sql`
- Modify: `backend/internal/models/problem.go`

- [ ] **Step 1: Add column to schema**

In `backend/db/schema.sql`, update the problems table definition:

```sql
CREATE TABLE IF NOT EXISTS problems (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  difficulty  TEXT        NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  topic_tags  TEXT[]      NOT NULL DEFAULT '{}',
  leetcode_id INT         UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

```sql
ALTER TABLE problems ADD COLUMN IF NOT EXISTS leetcode_id INT UNIQUE;
```

- [ ] **Step 3: Update Go model**

In `backend/internal/models/problem.go`:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

type Problem struct {
	Id          uuid.UUID `json:"id" db:"id"`
	Slug        string    `json:"slug" db:"slug"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description" db:"description"`
	Difficulty  string    `json:"difficulty" db:"difficulty"`
	TopicTags   []string  `json:"topic_tags" db:"topic_tags"`
	LeetcodeID  *int      `json:"leetcode_id" db:"leetcode_id"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
```

Note: `*int` (pointer) because the column is nullable — existing rows will have NULL until backfilled.

- [ ] **Step 4: Add leetcode_id to all SELECT queries in `backend/internal/storage/postgres/problems.go`**

Every `SELECT id, slug, title, description, difficulty, topic_tags, created_at` must become:

```sql
SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
```

There are 3 raw SQL queries (GetRandomProblem, GetProblemByID) and 2 squirrel queries (GetRandomProblemFiltered, SearchProblems). Update all of them:

In `GetRandomProblem`:
```go
const q = `
    SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
    FROM problems
    ORDER BY RANDOM()
    LIMIT 1`
```

In `GetProblemByID`:
```go
const q = `
    SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
    FROM problems
    WHERE id = $1`
```

In `GetRandomProblemFiltered`, change squirrel select:
```go
squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
```

In `SearchProblems`, change both squirrel selects (count stays as `COUNT(*)`):
```go
squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
```

Also update `OrderBy` in `SearchProblems`:
```go
OrderBy("leetcode_id ASC NULLS LAST").
```

- [ ] **Step 5: Build backend to verify no errors**

```bash
cd backend && go build ./...
```

Expected: no output (success)

- [ ] **Step 6: Commit**

```bash
git add backend/db/schema.sql backend/internal/models/problem.go backend/internal/storage/postgres/problems.go
git commit -m "feat: add leetcode_id to problems model and sort by it"
```

---

### Task 2: Backfill `leetcode_id` from dataset

**Files:**
- Modify: `scripts/seed.py`
- Create: `scripts/backfill_leetcode_id.py`

- [ ] **Step 1: Update seed.py to include question_id for future seeds**

In `scripts/seed.py`, add `leetcode_id` to the INSERT:

```python
raw_id = row.get("question_id")
leetcode_id = int(raw_id) if raw_id is not None else None
```

Change the INSERT:
```python
cur.execute(
    """
    INSERT INTO problems (id, slug, title, description, difficulty, topic_tags, leetcode_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (slug) DO NOTHING
    """,
    (str(uuid.uuid4()), slug, title, description, difficulty, topic_tags, leetcode_id),
)
```

- [ ] **Step 2: Create backfill script**

Create `scripts/backfill_leetcode_id.py`:

```python
#!/usr/bin/env python3
"""One-time script to backfill leetcode_id from the HuggingFace dataset."""

import os
import psycopg2
from datasets import load_dataset

DATABASE_URL = os.environ["DATABASE_URL"]

print("Loading dataset...")
ds = load_dataset("newfacade/LeetCodeDataset", split="train")
print(f"Loaded {len(ds)} problems.")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

updated = 0
skipped = 0

try:
    for row in ds:
        slug = row.get("task_id") or ""
        raw_id = row.get("question_id")
        if not slug or raw_id is None:
            skipped += 1
            continue
        leetcode_id = int(raw_id)
        cur.execute(
            "UPDATE problems SET leetcode_id = %s WHERE slug = %s AND leetcode_id IS NULL",
            (leetcode_id, slug),
        )
        if cur.rowcount > 0:
            updated += 1
        else:
            skipped += 1
    conn.commit()
    print(f"Updated: {updated}, Skipped: {skipped}")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
    raise
finally:
    cur.close()
    conn.close()
```

- [ ] **Step 3: Run backfill**

```bash
cd scripts
pip install datasets psycopg2-binary
DATABASE_URL="<your-supabase-connection-string>" python3 backfill_leetcode_id.py
```

Expected output: `Updated: ~2800, Skipped: ~X`

- [ ] **Step 4: Verify in Supabase SQL Editor**

```sql
SELECT COUNT(*) FROM problems WHERE leetcode_id IS NOT NULL;
SELECT leetcode_id, title FROM problems ORDER BY leetcode_id LIMIT 5;
```

Expected: `leetcode_id = 1` for Two Sum.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.py scripts/backfill_leetcode_id.py
git commit -m "feat: add backfill script for leetcode_id; update seed to include it"
```

---

### Task 3: Show `#N` in the UI

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/ProblemView.tsx`
- Modify: `frontend/src/components/SearchPage.tsx`

- [ ] **Step 1: Add `leetcode_id` to frontend Problem type**

In `frontend/src/types.ts`:

```typescript
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
  leetcode_id: number | null
}
```

- [ ] **Step 2: Show `#N` in ProblemView header**

In `frontend/src/components/ProblemView.tsx`, find the title heading (around line 116) and prepend the number. The heading currently looks like:

```tsx
<h2
  className={cn("text-lg font-semibold transition-all duration-300", titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]")}
  onClick={() => setTitleOpen(o => !o)}
  title={titleOpen ? '' : 'Click to reveal'}
>
  {problem.title}
</h2>
```

Change to:
```tsx
<h2
  className={cn("text-lg font-semibold transition-all duration-300", titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]")}
  onClick={() => setTitleOpen(o => !o)}
  title={titleOpen ? '' : 'Click to reveal'}
>
  {problem.leetcode_id != null && (
    <span className="text-muted-foreground font-normal mr-1">#{problem.leetcode_id}</span>
  )}
  {problem.title}
</h2>
```

- [ ] **Step 3: Show `#N` in SearchPage results**

In `frontend/src/components/SearchPage.tsx`, find the result card title (around line 272):

```tsx
<span className="font-semibold text-sm">{p.title}</span>
```

Change to:
```tsx
{p.leetcode_id != null && (
  <span className="text-xs text-muted-foreground font-normal">#{p.leetcode_id}</span>
)}
<span className="font-semibold text-sm">{p.title}</span>
```

- [ ] **Step 4: Build frontend**

```bash
cd frontend && npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/ProblemView.tsx frontend/src/components/SearchPage.tsx
git commit -m "feat: display #N leetcode number in problem header and search results"
```

---

### Task 4: Preserve search state across tab switches

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SearchPage.tsx`

The goal: lift the search state (q, difficulty, tags, tagMatch, results, page, total, hasSearched) out of `SearchPage` into `App.tsx`. `SearchPage` receives them as props and calls callback setters. `availableTags` stays inside `SearchPage` since it's fetched once independently.

- [ ] **Step 1: Define SearchState type and add to App.tsx**

In `frontend/src/App.tsx`, add after the imports:

```typescript
interface SearchState {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  results: Problem[]
  page: number
  total: number
  hasSearched: boolean
}

const defaultSearchState: SearchState = {
  q: '',
  difficulty: '',
  tags: [],
  tagMatch: 'and',
  results: [],
  page: 1,
  total: 0,
  hasSearched: false,
}
```

Then add state in the component body (after existing state declarations):

```typescript
const [searchState, setSearchState] = useState<SearchState>(defaultSearchState)
```

- [ ] **Step 2: Pass searchState and setter to SearchPage in App.tsx**

In the `practiceView`/render section of `App.tsx`, update the `SearchPage` usage:

```tsx
{view === 'search'
  ? <SearchPage
      onSelectProblem={selectProblem}
      searchState={searchState}
      onSearchStateChange={setSearchState}
    />
  : practiceView()
}
```

- [ ] **Step 3: Update SearchPage props interface**

In `frontend/src/components/SearchPage.tsx`, replace the component signature. Import `SearchState` from App is not possible (circular), so define it locally or re-export it. Simplest: define `SearchState` and `defaultSearchState` in `frontend/src/types.ts` and import from there.

Add to `frontend/src/types.ts`:

```typescript
export interface SearchState {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
  results: Problem[]
  page: number
  total: number
  hasSearched: boolean
}

export const defaultSearchState: SearchState = {
  q: '',
  difficulty: '',
  tags: [],
  tagMatch: 'and',
  results: [],
  page: 1,
  total: 0,
  hasSearched: false,
}
```

In `App.tsx`, import and use from `types.ts` (remove the local definition from Step 1).

- [ ] **Step 4: Refactor SearchPage to use props instead of local state**

In `frontend/src/components/SearchPage.tsx`, change the component to accept and use lifted state. The internal state that gets lifted: `q`, `difficulty`, `tags`, `tagMatch`, `results`, `page`, `total`, `hasSearched`. Keep local: `tagQuery`, `availableTags`, `loading`, `tagsLoading`, `error`, `tagsError`, `debounceRef`, `abortRef`.

New props interface:

```typescript
interface Props {
  onSelectProblem: (p: Problem, context: SearchSelectionContext) => void
  searchState: SearchState
  onSearchStateChange: (s: SearchState) => void
}

export function SearchPage({ onSelectProblem, searchState, onSearchStateChange }: Props) {
  const { q, difficulty, tags, tagMatch, results, page, total, hasSearched } = searchState

  const setQ = (v: string) => onSearchStateChange({ ...searchState, q: v, page: 1 })
  const setDifficulty = (v: string) => onSearchStateChange({ ...searchState, difficulty: v, page: 1 })
  const setTags = (v: string[]) => onSearchStateChange({ ...searchState, tags: v, page: 1 })
  const setTagMatch = (v: 'and' | 'or') => onSearchStateChange({ ...searchState, tagMatch: v, page: 1 })
  const setPage = (fn: (p: number) => number) => onSearchStateChange({ ...searchState, page: fn(page) })
  const setResults = (v: Problem[]) => onSearchStateChange({ ...searchState, results: v })
  const setTotal = (v: number) => onSearchStateChange({ ...searchState, total: v })
  const setHasSearched = (v: boolean) => onSearchStateChange({ ...searchState, hasSearched: v })
```

The search `useEffect` that fires on `[q, difficulty, tags, tagMatch, page]` stays as-is — it reads from the props-derived values. The results setter calls must update via `onSearchStateChange`. The cleanest way: in the search effect, call `onSearchStateChange({ ...searchState, results: data.problems, total: data.total, hasSearched: true })` in a single call.

Update the search effect (currently around line 80-115) to do a single state update:

```typescript
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await searchProblems(q, difficulty, tags, tagMatch, page, pageSize, controller.signal)
      onSearchStateChange({ ...searchState, results: res.problems, total: res.total, hasSearched: true })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Search failed. Is the backend running?')
      }
    } finally {
      setLoading(false)
    }
  }, q === '' && tags.length === 0 && !difficulty ? 0 : 300)
  return () => {
    debounceRef.current && clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }
}, [q, difficulty, tags, tagMatch, page])
```

Note: `onSearchStateChange` and `searchState` must NOT be in the dependency array (they change on every render). Use a ref for `searchState` in the effect to avoid stale closure:

```typescript
const searchStateRef = useRef(searchState)
searchStateRef.current = searchState
```

Then in the effect: `onSearchStateChange({ ...searchStateRef.current, results: res.problems, total: res.total, hasSearched: true })`

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

Expected: clean build.

- [ ] **Step 6: Manual test**

1. Go to Search tab, type a query, get results
2. Switch to Practice tab
3. Switch back to Search tab — query, filters, and results should still be there
4. Page through results — switch tabs — page should be preserved

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types.ts frontend/src/App.tsx frontend/src/components/SearchPage.tsx
git commit -m "feat: lift search state to App.tsx — preserve across tab switches"
```

---

## Self-Review

**Spec coverage:**
- ✅ `leetcode_id` column added to schema and model
- ✅ Backfill script to populate from dataset
- ✅ Sort by `leetcode_id ASC NULLS LAST` in `SearchProblems`
- ✅ `#N` shown in `ProblemView` header
- ✅ `#N` shown in `SearchPage` results
- ✅ Search state lifted to `App.tsx`, preserved across tab switches
- ✅ `seed.py` updated for future use

**Placeholder scan:** None found.

**Type consistency:**
- `SearchState` defined in `types.ts`, imported in both `App.tsx` and `SearchPage.tsx` — consistent.
- `Problem.leetcode_id: number | null` — used as `p.leetcode_id != null` checks throughout — consistent.
- `setPage` in SearchPage uses functional form `(fn: (p: number) => number)` — used as `setPage(p => Math.max(1, p - 1))` in pagination — consistent.
