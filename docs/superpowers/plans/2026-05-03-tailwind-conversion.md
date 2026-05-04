# Tailwind CSS Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert leetgame frontend from inline styles to Tailwind CSS v4 with custom theme matching current design.

**Architecture:** Tailwind v4 via Vite plugin with custom theme configuration. Inline styles replaced with utility classes. Dark mode via Tailwind's `.dark` variant.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, clsx, tailwind-merge

---

## File Structure

| File | Purpose | Action |
|------|---------|--------|
| `frontend/package.json` | Dependencies | Modify - add Tailwind packages |
| `frontend/vite.config.ts` | Vite config | Modify - add Tailwind plugin |
| `frontend/src/index.css` | Global styles | Replace - Tailwind imports + theme |
| `frontend/src/lib/utils.ts` | Utility functions | Create - cn() helper |
| `frontend/src/App.tsx` | Main app | Modify - convert to Tailwind classes |
| `frontend/src/components/ProblemView.tsx` | Problem display | Modify - convert to Tailwind classes |
| `frontend/src/components/ChatView.tsx` | Chat interface | Modify - convert to Tailwind classes |
| `frontend/src/components/CompleteView.tsx` | Completion screen | Modify - convert to Tailwind classes |

---

### Task 1: Install Tailwind Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Tailwind packages**

```bash
cd frontend
npm install @tailwindcss/vite tailwindcss tw-animate-css clsx tailwind-merge
```

- [ ] **Step 2: Verify installation**

Run: `cat package.json | grep -A5 "dependencies"`

Expected: Shows `@tailwindcss/vite`, `tailwindcss`, `tw-animate-css`, `clsx`, `tailwind-merge` in dependencies

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "deps: add tailwind css v4 and utilities"
```

---

### Task 2: Configure Vite with Tailwind Plugin

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Add Tailwind plugin to Vite config**

```typescript
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Verify Vite config**

Run: `cd frontend && npx tsc --noEmit vite.config.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "config: add tailwind vite plugin"
```

---

### Task 3: Create Tailwind Theme Configuration

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace index.css with Tailwind theme**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: system-ui, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, Consolas, monospace;

  --color-background: #fff;
  --color-foreground: #08060d;
  --color-muted: #f4f3ec;
  --color-muted-foreground: #6b6375;
  --color-border: #e5e4e7;
  --color-primary: #aa3bff;
  --color-primary-foreground: #fff;
  --color-secondary: #f0f0f0;
  --color-secondary-foreground: #222;
  --color-accent: rgba(170, 59, 255, 0.1);
  --color-accent-foreground: #aa3bff;
  --color-destructive: #ff375f;
  --color-destructive-foreground: #fff;

  --color-easy: #00b8a9;
  --color-medium: #ffc01e;
  --color-hard: #ff375f;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    margin: 0;
  }
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```

- [ ] **Step 2: Verify CSS compiles**

Run: `cd frontend && npm run build 2>&1 | head -20`

Expected: Build succeeds without CSS errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "styles: add tailwind theme configuration"
```

---

### Task 4: Create Utility Functions

**Files:**
- Create: `frontend/src/lib/utils.ts`

- [ ] **Step 1: Create utils.ts with cn() helper**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit src/lib/utils.ts`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/utils.ts
git commit -m "feat: add cn() utility for tailwind class merging"
```

---

### Task 5: Convert App.tsx to Tailwind

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with Tailwind classes**

```tsx
import { useEffect, useState } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, sendChat } from './api'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'
import { cn } from './lib/utils'

export default function App() {
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

  if (error && !problem) return (
    <div className="p-10 text-center text-destructive">{error}</div>
  )

  if (!problem) return (
    <div className="p-10 text-center text-muted-foreground">Loading problem...</div>
  )

  if (stage === 'complete') return <CompleteView onNext={loadProblem} />

  return (
    <div className="flex h-screen font-sans">
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
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit src/App.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: convert App.tsx to tailwind classes"
```

---

### Task 6: Convert ProblemView.tsx to Tailwind

**Files:**
- Modify: `frontend/src/components/ProblemView.tsx`

- [ ] **Step 1: Replace ProblemView.tsx with Tailwind classes**

```tsx
import { useState } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'

const difficultyColor: Record<string, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

export function ProblemView({ problem, onSkip }: { problem: Problem, onSkip: () => void }) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)

  return (
    <div className="w-1/2 overflow-y-auto p-6 border-r border-border">
      <div className="flex items-start gap-3 mb-3">
        <h2
          onClick={() => setTitleOpen(o => !o)}
          className={cn(
            "m-0 flex-1 cursor-pointer select-none transition-all duration-200",
            titleOpen ? "opacity-100 blur-none" : "opacity-60 blur-[6px]"
          )}
          title={titleOpen ? '' : 'Click to reveal'}
        >
          {problem.title}
        </h2>
        <span className={cn(
          "font-semibold text-sm",
          difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
        )}>
          {problem.difficulty}
        </span>
        <button 
          onClick={onSkip} 
          className="ml-auto px-3 py-1 text-xs cursor-pointer border border-muted-foreground/50 rounded-md bg-transparent text-muted-foreground hover:bg-muted transition-colors"
        >
          Skip →
        </button>
      </div>

      <div className="mb-5">
        <button 
          onClick={() => setTagsOpen(o => !o)} 
          className="bg-transparent border-none cursor-pointer text-muted-foreground text-xs p-0 hover:text-foreground transition-colors"
        >
          {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
        </button>
        {tagsOpen && (
          <div className="flex gap-2 flex-wrap mt-2">
            {problem.topic_tags.map(tag => (
              <span 
                key={tag} 
                className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="leading-relaxed text-sm whitespace-pre-wrap">
        {problem.description}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit src/components/ProblemView.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProblemView.tsx
git commit -m "refactor: convert ProblemView to tailwind classes"
```

---

### Task 7: Convert ChatView.tsx to Tailwind

**Files:**
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Replace ChatView.tsx with Tailwind classes**

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage } from '../types'
import { cn } from '../lib/utils'

const stageBanner: Record<string, string> = {
  algorithm: 'Describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
}

export function ChatView({ history, stage, loading, error, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div className="w-1/2 flex flex-col h-screen">
      <div className="px-5 py-3 bg-muted border-b border-border text-sm font-semibold text-foreground">
        {stageBanner[stage]}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {history.map((msg, i) => (
          <div 
            key={`${i}-${msg.role}`} 
            className={cn(
              "max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap",
              msg.role === 'user' 
                ? "self-end bg-primary text-primary-foreground" 
                : "self-start bg-secondary text-secondary-foreground"
            )}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="self-start text-muted-foreground text-xs italic">
            Thinking...
          </div>
        )}
        {error && (
          <div className="self-start text-destructive text-xs">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form 
        onSubmit={e => { e.preventDefault(); handleSubmit() }} 
        className="p-4 border-t border-border flex gap-2"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder="Describe your approach..."
          disabled={loading}
          rows={3}
          className="flex-1 resize-none px-3 py-2.5 rounded-lg border border-border text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 rounded-lg bg-primary text-primary-foreground border-none font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit src/components/ChatView.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatView.tsx
git commit -m "refactor: convert ChatView to tailwind classes"
```

---

### Task 8: Convert CompleteView.tsx to Tailwind

**Files:**
- Modify: `frontend/src/components/CompleteView.tsx`

- [ ] **Step 1: Replace CompleteView.tsx with Tailwind classes**

```tsx
import { cn } from '../lib/utils'

interface Props {
  onNext: () => void
}

export function CompleteView({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="m-0 text-muted-foreground text-base">
        You nailed the algorithm and complexity.
      </p>
      <button
        onClick={onNext}
        className="px-8 py-3 rounded-lg bg-primary text-primary-foreground border-none text-base font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
      >
        Next Problem
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit src/components/CompleteView.tsx`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CompleteView.tsx
git commit -m "refactor: convert CompleteView to tailwind classes"
```

---

### Task 9: Verify Build and Test

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript check on all files**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Run production build**

```bash
cd frontend
npm run build
```

Expected: Build succeeds, `dist/` folder created with assets

- [ ] **Step 3: Verify dev server starts**

```bash
cd frontend
timeout 5s npm run dev 2>&1 || true
```

Expected: Vite dev server starts on port 5173 (or similar)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete tailwind css conversion"
```

---

## Self-Review Checklist

- [ ] All inline styles converted to Tailwind classes
- [ ] Theme colors match original design
- [ ] Dark mode support preserved
- [ ] TypeScript compiles without errors
- [ ] Build succeeds
- [ ] Dev server starts
- [ ] All commits are atomic and descriptive

## Notes for Implementer

1. **Testing visually**: Open `http://localhost:5173` after `npm run dev` and verify:
   - Problem view renders with correct layout
   - Chat messages appear with proper styling
   - Skip button is visible and styled
   - Difficulty colors display correctly (Easy=green, Medium=yellow, Hard=red)

2. **Dark mode**: The theme supports dark mode via `.dark` class on root element. Test by adding `class="dark"` to `<html>` tag.

3. **Common issues**:
   - If `cn()` import fails, check path is `../lib/utils` from components
   - If colors don't match, verify theme tokens in `index.css`
   - If build fails, ensure all dependencies installed with `npm install`