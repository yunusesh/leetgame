# Problem Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search page where users can filter problems by title, difficulty, and topic tags, then jump into the practice view for any result.

**Architecture:** State-based navigation in `App.tsx` (`view: 'practice' | 'search'`) with a nav bar at the top. A new `GET /api/problems` endpoint handles search with optional `q`, `difficulty`, and `tags` query params. The frontend `SearchPage` component calls this endpoint with 300ms debounce and renders results as a clickable list.

**Tech Stack:** Go/Fiber v2, pgx v5, squirrel (dynamic SQL), React, TypeScript

---

## File Structure

**Backend — new/modified:**
- `backend/internal/storage/storage.go` — add `SearchProblems` to interface
- `backend/internal/storage/postgres/problems.go` — implement `SearchProblems` with squirrel
- `backend/internal/types/search_query.go` — create `SearchQuery` struct with `query` tags
- `backend/internal/handlers/problems.go` — add `GetProblems` handler
- `backend/internal/handlers/routes.go` — register `GET /api/problems`

**Frontend — new/modified:**
- `frontend/src/api.ts` — add `searchProblems`
- `frontend/src/components/NavBar.tsx` — create nav bar
- `frontend/src/components/SearchPage.tsx` — create search page
- `frontend/src/App.tsx` — add `view` + `selectedProblem` state, render nav bar

---

### Task 1: SearchProblems storage method

**Context:** `squirrel` is not yet in `go.mod`. The `Storage` interface lives in `backend/internal/storage/storage.go`. The postgres implementation is in `backend/internal/storage/postgres/problems.go`. Follow the existing pattern: `utils.Retry` wrapping `Pool.Query` + `pgx.CollectRows` + `pgx.RowToStructByName`.

**Files:**
- Modify: `backend/internal/storage/storage.go`
- Modify: `backend/internal/storage/postgres/problems.go`

- [ ] **Step 1: Add squirrel dependency**

```bash
cd backend
go get github.com/Masterminds/squirrel
```

Expected: `go.mod` and `go.sum` updated with `github.com/Masterminds/squirrel`.

- [ ] **Step 2: Add `SearchProblems` to the Storage interface**

Full file `backend/internal/storage/storage.go`:

```go
package storage

import (
	"context"

	"leetgame/internal/models"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
	SearchProblems(ctx context.Context, q, difficulty string, tags []string) ([]models.Problem, error)
}
```

- [ ] **Step 3: Implement `SearchProblems` in postgres**

Add this function to `backend/internal/storage/postgres/problems.go`. Keep all existing functions — append this at the bottom:

```go
func (p *Postgres) SearchProblems(ctx context.Context, q, difficulty string, tags []string) ([]models.Problem, error) {
	return utils.Retry(ctx, func(ctx context.Context) ([]models.Problem, error) {
		sb := squirrel.
			Select("id, slug, title, description, difficulty, topic_tags, created_at").
			From("problems").
			PlaceholderFormat(squirrel.Dollar).
			Limit(50)

		if q != "" {
			sb = sb.Where(squirrel.ILike{"title": "%" + q + "%"})
		}
		if difficulty != "" {
			sb = sb.Where(squirrel.Eq{"difficulty": difficulty})
		}
		for _, tag := range tags {
			sb = sb.Where("? = ANY(topic_tags)", tag)
		}

		sql, args, err := sb.ToSql()
		if err != nil {
			return nil, utils.CreateNonRetryableError(fmt.Errorf("failed to build query: %w", err))
		}

		rows, err := p.Pool.Query(ctx, sql, args...)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
	})
}
```

Add the required imports to `backend/internal/storage/postgres/problems.go`. The full import block:

```go
import (
	"context"
	"errors"
	"fmt"

	"leetgame/internal/models"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	squirrel "github.com/Masterminds/squirrel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend
go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/storage/storage.go backend/internal/storage/postgres/problems.go
git commit -m "feat: add SearchProblems storage method"
```

---

### Task 2: GetProblems handler and route

**Context:** `HandlerService` methods live in `backend/internal/handlers/`. Query params are parsed with Fiber's `c.QueryParser` using a struct with `query` tags — put this struct in `backend/internal/types/`. The handler parses `tags` as a comma-separated string and splits it. Route is registered inside the existing `/api/problems` route group in `routes.go`.

**Files:**
- Create: `backend/internal/types/search_query.go`
- Modify: `backend/internal/handlers/problems.go`
- Modify: `backend/internal/handlers/routes.go`

- [ ] **Step 1: Create `SearchQuery` type**

Create `backend/internal/types/search_query.go`:

```go
package types

type SearchQuery struct {
	Q          string `query:"q"`
	Difficulty string `query:"difficulty"`
	Tags       string `query:"tags"`
}
```

- [ ] **Step 2: Add `GetProblems` handler to `backend/internal/handlers/problems.go`**

Full file (keep existing `GetRandomProblem`, add below it):

```go
package handlers

import (
	"net/http"
	"strings"

	"leetgame/internal/types"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetRandomProblem(c *fiber.Ctx) error {
	problem, err := hs.storage.GetRandomProblem(c.Context())
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProblems(c *fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.QueryParser(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	tags := []string{}
	if q.Tags != "" {
		for _, t := range strings.Split(q.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
	}

	problems, err := hs.storage.SearchProblems(c.Context(), q.Q, q.Difficulty, tags)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}
```

- [ ] **Step 3: Register the route in `backend/internal/handlers/routes.go`**

Full file:

```go
package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RegisterRoutes(app *fiber.App) {
	app.Route("/api", func(api fiber.Router) {
		api.Get("/healthcheck", func(c *fiber.Ctx) error {
			if err := hs.storage.Ping(c.Context()); err != nil {
				return c.Status(http.StatusInternalServerError).SendString("failed to ping database")
			}
			return c.SendStatus(http.StatusOK)
		})

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
			problems.Get("/", hs.GetProblems)
		})

		api.Post("/chat", hs.Chat)
	})
}
```

- [ ] **Step 4: Build and verify**

```bash
cd backend
go build ./...
go test ./...
```

Expected: compiles cleanly, `ok leetgame/internal/types`.

- [ ] **Step 5: Smoke test the endpoint**

Make sure the backend is running (`go run ./cmd/server`), then:

```bash
curl "http://localhost:42069/api/problems?q=two+sum&difficulty=Easy" | head -c 200
```

Expected: JSON array with at least one problem whose title contains "Two Sum".

```bash
curl "http://localhost:42069/api/problems?tags=Array,Hash+Table" | head -c 200
```

Expected: JSON array of problems tagged with both Array and Hash Table.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/types/search_query.go backend/internal/handlers/problems.go backend/internal/handlers/routes.go
git commit -m "feat: add GET /api/problems search endpoint"
```

---

### Task 3: Frontend — api + SearchPage

**Context:** `frontend/src/api.ts` contains fetch wrappers. `SearchPage` needs a text input, difficulty toggle (All/Easy/Medium/Hard), tag chips input, and results list. Tags are sent as a comma-separated `tags` query param. Debounce with `useEffect` + `setTimeout`/`clearTimeout` — no extra library needed.

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/components/SearchPage.tsx`

- [ ] **Step 1: Add `searchProblems` to `frontend/src/api.ts`**

Full file:

```ts
import type { Problem, ChatMessage, Stage, ChatResponse } from './types'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch('/api/problems/random')
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function searchProblems(q: string, difficulty: string, tags: string[]): Promise<Problem[]> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  const res = await fetch(`/api/problems?${params.toString()}`)
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function sendChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_id: problemId, stage, history, message }),
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Create `frontend/src/components/SearchPage.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react'
import type { Problem } from '../types'
import { searchProblems } from '../api'

const difficultyColor: Record<string, string> = {
  Easy: '#00b8a9',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

const difficulties = ['Easy', 'Medium', 'Hard']

export function SearchPage({ onSelectProblem }: { onSelectProblem: (p: Problem) => void }) {
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [results, setResults] = useState<Problem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await searchProblems(q, difficulty, tags)
        setResults(res)
      } catch {
        setError('Search failed. Is the backend running?')
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, difficulty, tags])

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const t = tagInput.trim()
      if (!tags.includes(t)) setTags([...tags, t])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginTop: 0, marginBottom: '24px' }}>Search Problems</h2>

      {/* text search */}
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by title..."
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: '15px',
          borderRadius: '8px',
          border: '1px solid #444',
          background: '#1a1a1a',
          color: '#fff',
          boxSizing: 'border-box',
          marginBottom: '16px',
        }}
      />

      {/* difficulty filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setDifficulty('')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #555',
            background: difficulty === '' ? '#fff' : 'transparent',
            color: difficulty === '' ? '#000' : '#aaa',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          All
        </button>
        {difficulties.map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(difficulty === d ? '' : d)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: `1px solid ${difficulty === d ? difficultyColor[d] : '#555'}`,
              background: difficulty === d ? difficultyColor[d] + '22' : 'transparent',
              color: difficulty === d ? difficultyColor[d] : '#aaa',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* tag filter */}
      <div style={{ marginBottom: '24px' }}>
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={addTag}
          placeholder="Filter by tag (press Enter to add)..."
          style={{
            width: '100%',
            padding: '8px 14px',
            fontSize: '14px',
            borderRadius: '8px',
            border: '1px solid #444',
            background: '#1a1a1a',
            color: '#fff',
            boxSizing: 'border-box',
            marginBottom: tags.length ? '8px' : '0',
          }}
        />
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {tags.map(tag => (
              <span key={tag} style={{
                background: '#2a2a2a',
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
                color: '#ccc',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                {tag}
                <span
                  onClick={() => removeTag(tag)}
                  style={{ cursor: 'pointer', color: '#888', fontSize: '14px', lineHeight: 1 }}
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* results */}
      {loading && <div style={{ color: '#888', fontSize: '14px' }}>Searching...</div>}
      {error && <div style={{ color: '#ff375f', fontSize: '14px' }}>{error}</div>}
      {!loading && !error && results.length === 0 && (
        <div style={{ color: '#888', fontSize: '14px' }}>No problems found.</div>
      )}
      {!loading && !error && results.map(p => (
        <div
          key={p.id}
          onClick={() => onSelectProblem(p)}
          style={{
            padding: '14px 16px',
            borderRadius: '8px',
            border: '1px solid #2a2a2a',
            marginBottom: '8px',
            cursor: 'pointer',
            background: '#111',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1e1e1e')}
          onMouseLeave={e => (e.currentTarget.style.background = '#111')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#fff' }}>{p.title}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: difficultyColor[p.difficulty] ?? '#666' }}>
              {p.difficulty}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {p.topic_tags.map(tag => (
              <span key={tag} style={{
                background: '#2a2a2a',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '11px',
                color: '#999',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify the frontend builds**

```bash
cd frontend
npm run build
```

Expected: `✓ built in <Xms>` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/SearchPage.tsx
git commit -m "feat: add SearchPage component and searchProblems api call"
```

---

### Task 4: App.tsx — nav bar and view switching

**Context:** `App.tsx` currently uses conditional rendering for the complete view. Extend this with a `view` state and a `NavBar`. When `onSelectProblem` is called, set `problem` directly (skip the random fetch), reset `history`/`stage`, and switch `view` to `'practice'`. The nav bar sits outside all conditional views so it's always visible.

**Files:**
- Create: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/NavBar.tsx`**

```tsx
type View = 'practice' | 'search'

export function NavBar({ view, onNavigate }: { view: View, onNavigate: (v: View) => void }) {
  const btnStyle = (active: boolean) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    border: 'none',
    background: active ? '#fff' : 'transparent',
    color: active ? '#000' : '#aaa',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 16px',
      borderBottom: '1px solid #2a2a2a',
      background: '#111',
    }}>
      <button style={btnStyle(view === 'practice')} onClick={() => onNavigate('practice')}>
        Practice
      </button>
      <button style={btnStyle(view === 'search')} onClick={() => onNavigate('search')}>
        Search
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update `frontend/src/App.tsx`**

Full file:

```tsx
import { useEffect, useState } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, sendChat } from './api'
import { NavBar } from './components/NavBar'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'
import { SearchPage } from './components/SearchPage'

type View = 'practice' | 'search'

export default function App() {
  const [view, setView] = useState<View>('practice')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('algorithm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProblem = async () => {
    try {
      setError(null)
      const p = await getRandomProblem()
      setProblem(p)
      setHistory([])
      setStage('algorithm')
    } catch (e) {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  const selectProblem = (p: Problem) => {
    setProblem(p)
    setHistory([])
    setStage('algorithm')
    setError(null)
    setView('practice')
  }

  useEffect(() => { loadProblem() }, [])

  const handleSubmit = async (message: string) => {
    if (!problem) return
    setLoading(true)
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: message }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)
    try {
      const resp = await sendChat(problem.id, stage, history, message)
      setHistory([...nextHistory, { role: 'assistant', content: resp.message }])
      setStage(resp.stage)
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const practiceView = () => {
    if (error && !problem) return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ff375f' }}>{error}</div>
    )
    if (!problem) return (
      <div style={{ padding: '40px', textAlign: 'center' }}>Loading problem...</div>
    )
    if (stage === 'complete') return <CompleteView onNext={loadProblem} />
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ProblemView key={problem.id} problem={problem} onSkip={loadProblem} />
        <ChatView
          history={history}
          stage={stage}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <NavBar view={view} onNavigate={setView} />
      {view === 'search'
        ? <SearchPage onSelectProblem={selectProblem} />
        : practiceView()
      }
    </div>
  )
}
```

- [ ] **Step 3: Verify the frontend builds**

```bash
cd frontend
npm run build
```

Expected: `✓ built in <Xms>` with no errors.

- [ ] **Step 4: Test the full flow manually**

1. Open `http://localhost:5173`
2. Verify nav bar shows "Practice" and "Search" tabs
3. Click "Search" — search page appears
4. Type "two sum" in the title input — results update after 300ms
5. Click difficulty "Easy" — results filter
6. Type "Array" in tag input, press Enter — tag chip appears, results filter
7. Click a result — switches to practice view with that problem pre-loaded
8. Chat works, skip loads a random problem
9. Click "Search" in nav — returns to search page

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/App.tsx
git commit -m "feat: add nav bar and search page view switching"
```
