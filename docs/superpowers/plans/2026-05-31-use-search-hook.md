# useSearch Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the debounced search effect from SearchPage into a `useSearch` hook called at the App level, so it never unmounts and never re-fetches on tab switch.

**Architecture:** The root cause is that `SearchPage` is conditionally rendered — it unmounts/remounts on every tab switch, which re-fires its `useEffect` even when search params haven't changed. The fix is to move the effect to a stable scope. We create `frontend/src/hooks/useSearch.ts` which owns the debounce timer, AbortController, `loading` state, and `error` state. App.tsx calls the hook at render time (never unmounts), then passes `loading` and `error` down as props. SearchPage becomes a pure display component: it receives state and setters as props, renders results, and handles tag-picker UI — no fetch logic.

**Tech Stack:** React 19, TypeScript, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `frontend/src/hooks/useSearch.ts` | **Create** — owns debounce, AbortController, loading, error, search effect |
| `frontend/src/App.tsx` | **Modify** — call `useSearch`, pass `loading`/`error` to SearchPage |
| `frontend/src/components/SearchPage.tsx` | **Modify** — remove search effect + local state, accept `loading`/`error` as props |

---

### Task 1: Create the `useSearch` hook

**Files:**
- Create: `frontend/src/hooks/useSearch.ts`

The hook extracts exactly the debounced search effect and its supporting state from `SearchPage`. It owns nothing else.

- [ ] **Step 1: Create `frontend/src/hooks/useSearch.ts`**

```ts
import { useState, useEffect, useRef } from 'react'
import type { SearchState } from '../types'
import { searchProblems } from '../api'

export const SEARCH_PAGE_SIZE = 12

export function useSearch(
  searchState: SearchState,
  onSearchStateChange: (s: SearchState) => void,
): { loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchStateRef = useRef(searchState)
  searchStateRef.current = searchState

  const { q, difficulty, tags, tagMatch, page } = searchState

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const { q: sq, difficulty: sd, tags: st, tagMatch: sm, page: sp } = searchStateRef.current
        const res = await searchProblems(sq, sd, st, sm, sp, SEARCH_PAGE_SIZE, controller.signal)
        onSearchStateChange({ ...searchStateRef.current, results: res.problems, total: res.total, hasSearched: true })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [q, difficulty, tags, tagMatch, page]) // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, error }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSearch.ts
git commit -m "feat: extract useSearch hook with debounced fetch at stable scope"
```

---

### Task 2: Wire `useSearch` into App.tsx and update SearchPage

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SearchPage.tsx`

These two files must be updated together — SearchPage gains required props that App.tsx must provide.

#### App.tsx changes

- [ ] **Step 1: Add `useSearch` import to App.tsx**

In `frontend/src/App.tsx`, the existing import line is:

```tsx
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getStreak, recordStreak, getSettings, updateSettings } from './api'
```

Add a new import after the existing imports:

```tsx
import { useSearch } from './hooks/useSearch'
```

- [ ] **Step 2: Call `useSearch` in App.tsx**

In `App.tsx`, find:

```tsx
  const [searchState, setSearchState] = useState<SearchState>(defaultSearchState)
```

Add immediately after it:

```tsx
  const { loading: searchLoading, error: searchError } = useSearch(searchState, setSearchState)
```

- [ ] **Step 3: Pass `loading` and `error` to SearchPage in App.tsx**

Find the SearchPage render:

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

Replace with:

```tsx
      {view === 'search'
        ? <SearchPage
            onSelectProblem={selectProblem}
            searchState={searchState}
            onSearchStateChange={setSearchState}
            loading={searchLoading}
            error={searchError}
          />
        : practiceView()
      }
```

#### SearchPage.tsx changes

- [ ] **Step 4: Update SearchPage imports**

In `frontend/src/components/SearchPage.tsx`, the current imports are:

```tsx
import { useState, useEffect, useRef } from 'react'
import type { Problem, ProblemTag, SearchState } from '../types'
import { getProblemTags, searchProblems } from '../api'
```

Replace with:

```tsx
import { useState, useEffect, useRef } from 'react'
import type { Problem, ProblemTag, SearchState } from '../types'
import { getProblemTags } from '../api'
import { SEARCH_PAGE_SIZE } from '../hooks/useSearch'
```

(`searchProblems` is no longer called in SearchPage; `useRef` is still needed for tags AbortController.)

- [ ] **Step 5: Update SearchPage Props interface**

Find:

```tsx
interface Props {
  onSelectProblem: (p: Problem, context: SearchSelectionContext) => void
  searchState: SearchState
  onSearchStateChange: (s: SearchState) => void
}
```

Replace with:

```tsx
interface Props {
  onSelectProblem: (p: Problem, context: SearchSelectionContext) => void
  searchState: SearchState
  onSearchStateChange: (s: SearchState) => void
  loading: boolean
  error: string | null
}
```

- [ ] **Step 6: Update SearchPage function signature and remove local search state**

Find:

```tsx
export function SearchPage({ onSelectProblem, searchState, onSearchStateChange }: Props) {
  const [tagQuery, setTagQuery] = useState('')
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { q, difficulty, tags, tagMatch, results, page, total, hasSearched } = searchState

  // Use a ref to access current searchState inside effects without stale closure
  const searchStateRef = useRef(searchState)
  searchStateRef.current = searchState

  const setQ = (v: string) => onSearchStateChange({ ...searchState, q: v, page: 1 })
```

Replace with:

```tsx
export function SearchPage({ onSelectProblem, searchState, onSearchStateChange, loading, error }: Props) {
  const [tagQuery, setTagQuery] = useState('')
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)

  const { q, difficulty, tags, tagMatch, results, page, total, hasSearched } = searchState

  const setQ = (v: string) => onSearchStateChange({ ...searchState, q: v, page: 1 })
```

- [ ] **Step 7: Remove the debounced search useEffect from SearchPage**

Find and delete this entire block (lines ~111–135 in the current file):

```tsx
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const { q: sq, difficulty: sd, tags: st, tagMatch: sm, page: sp } = searchStateRef.current
        const res = await searchProblems(sq, sd, st, sm, sp, pageSize, controller.signal)
        onSearchStateChange({ ...searchStateRef.current, results: res.problems, total: res.total, hasSearched: true })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [q, difficulty, tags, tagMatch, page]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 8: Replace `pageSize` references with `SEARCH_PAGE_SIZE`**

Find:

```tsx
const pageSize = 12
```

Delete this line (it's now defined in the hook).

Then find `export const problemSearchPageSize = pageSize` and delete it (no longer needed; App.tsx doesn't import it).

Then find `pageSize` used in the `totalPages` calculation and the `SearchSelectionContext`:

```tsx
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, total)
```

Replace with:

```tsx
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * SEARCH_PAGE_SIZE + 1
  const showingTo = Math.min(page * SEARCH_PAGE_SIZE, total)
```

And in the `onSelectProblem` call inside the result card click handler:

```tsx
            pageSize,
```

Replace with:

```tsx
            pageSize: SEARCH_PAGE_SIZE,
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/SearchPage.tsx
git commit -m "refactor: wire useSearch hook into App, make SearchPage a pure display component"
```
