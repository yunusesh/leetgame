# Search Page Skeleton Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the spinner in the search results area with shadcn Skeleton rows that match the shape of real result cards.

**Architecture:** Add the shadcn Skeleton primitive (a single file, no deps beyond Tailwind), then replace the two loading states in SearchPage — the initial "Searching..." spinner and the inline spinner shown during pagination/filter changes — with a list of 8 skeleton cards. The skeleton card mirrors the real card's structure: a top row with a narrow id chip, a wider title block, and a small difficulty chip; a bottom row of tag pills.

**Tech Stack:** React 19, TypeScript, Tailwind v4, shadcn/ui (skeleton primitive)

---

### Task 1: Add the shadcn Skeleton component

**Files:**
- Create: `frontend/src/components/ui/skeleton.tsx`

The shadcn skeleton primitive is a single div with a pulse animation. No CLI needed — write it directly.

- [ ] **Step 1: Create `frontend/src/components/ui/skeleton.tsx`**

```tsx
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted-foreground/15', className)}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to `skeleton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/skeleton.tsx
git commit -m "feat: add shadcn Skeleton primitive"
```

---

### Task 2: Replace search result spinners with skeleton cards

**Files:**
- Modify: `frontend/src/components/SearchPage.tsx`

**Current loading states to replace (both use the inline spinner):**

1. Lines 252–257 — `loading && !hasSearched` block: shown on the very first search before any results exist.
2. Lines 244–250 — the `loading` branch inside the results count row: shown during pagination / filter changes when results are already visible.

**Target skeleton card shape** (mirrors the real result card at lines 261–291):

```
┌─────────────────────────────────────────────┐
│  [##]  [title__________________]  [diff]    │  ← row 1: id chip + title + difficulty
│  [tag]  [tag]  [tag]                        │  ← row 2: topic tags
└─────────────────────────────────────────────┘
```

- [ ] **Step 1: Import Skeleton in SearchPage**

At the top of `frontend/src/components/SearchPage.tsx`, add:

```tsx
import { Skeleton } from './ui/skeleton'
```

- [ ] **Step 2: Add a `SearchResultSkeleton` component inside the file (above `SearchPage`)**

```tsx
function SearchResultSkeleton() {
  return (
    <div className="p-4 rounded-md border border-border bg-muted mb-2">
      <div className="flex items-center gap-2.5 mb-3">
        <Skeleton className="h-3.5 w-8 rounded-sm" />
        <Skeleton className="h-3.5 w-48 rounded-sm" />
        <Skeleton className="h-3.5 w-12 rounded-sm" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-sm" />
        <Skeleton className="h-5 w-20 rounded-sm" />
        <Skeleton className="h-5 w-14 rounded-sm" />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace the initial-load spinner block**

Find the block (around line 252):

```tsx
{loading && !hasSearched && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />
    Searching...
  </div>
)}
```

Replace with:

```tsx
{loading && !hasSearched && (
  <div>
    {Array.from({ length: 8 }).map((_, i) => (
      <SearchResultSkeleton key={i} />
    ))}
  </div>
)}
```

- [ ] **Step 4: Replace the inline spinner in the results count row**

Find the block (around line 244):

```tsx
{!error && hasSearched && total > 0 && (
  <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
    {loading
      ? <span className="flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />Searching...</span>
      : <p>Showing {showingFrom}-{showingTo} of {total}</p>
    }
    <p>Page {page} of {totalPages}</p>
  </div>
)}
```

Replace with (keep the count row but overlay skeletons over the result list during pagination):

```tsx
{!error && hasSearched && total > 0 && (
  <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
    <p>{loading ? 'Searching...' : `Showing ${showingFrom}-${showingTo} of ${total}`}</p>
    <p>Page {page} of {totalPages}</p>
  </div>
)}
```

Then, in the results rendering block (around line 261), wrap the real cards so that when `loading && hasSearched` we show skeletons instead:

Find:

```tsx
{!error && results.map(p => (
```

Replace with:

```tsx
{!error && loading && hasSearched && (
  <div>
    {Array.from({ length: 8 }).map((_, i) => (
      <SearchResultSkeleton key={i} />
    ))}
  </div>
)}
{!error && !loading && results.map(p => (
```

- [ ] **Step 5: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start dev server and visually verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`, go to Search tab.

- On first load: 8 skeleton cards pulse while tags load and results arrive.
- After typing in the search box (triggering a new search): skeleton cards replace real cards during the 300ms debounce + fetch.
- After results arrive: real cards appear with no flash.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SearchPage.tsx
git commit -m "feat: replace search spinner with skeleton result cards"
```
