# Configurable Stages — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable practice stages to the frontend — expanded Stage type, active stages state loaded from API/localStorage, settings panel UI, and all stage banners updated to cover all 5 stages.

**Architecture:** `activeStages` lives in `App.tsx` state. On mount it's loaded from `GET /api/settings` (logged in) or `localStorage` (logged out). It's passed into `streamChat` with every request and into `ChatView` for banner text. A `StagesSettings` popover in the NavBar lets users toggle stages on/off with immediate persistence.

**Tech Stack:** React 19, TypeScript, Tailwind v4

**Prerequisite:** Backend plan must be complete and deployed before this plan is implemented.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/types.ts` | Modify | Expand `Stage` type; add `CANONICAL_STAGES`, `DEFAULT_STAGES` constants |
| `frontend/src/api.ts` | Modify | Add `getSettings`, `updateSettings`; update `streamChat` signature |
| `frontend/src/App.tsx` | Modify | Add `activeStages` state; load on auth; pass to `streamChat` and `ChatView`; fix `resetPracticeState` |
| `frontend/src/components/ChatView.tsx` | Modify | Update stage banner/placeholder maps to cover all 5 stages; accept `activeStages` prop |
| `frontend/src/components/StagesSettings.tsx` | Create | Toggle panel for 5 stages |
| `frontend/src/components/NavBar.tsx` | Modify | Add gear icon that opens `StagesSettings` |

---

### Task 1: Expand Stage Types and Constants

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Update `frontend/src/types.ts`**

Replace the `Stage` type and add constants. The full updated file:

```typescript
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
}

export interface ProblemSearchResponse {
  problems: Problem[]
  page: number
  page_size: number
  total: number
}

export interface ProblemTag {
  name: string
  count: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ActiveStage = 'edge_cases' | 'brute_force' | 'pattern' | 'algorithm' | 'tc_sc'

export type Stage = ActiveStage | 'complete'

export const CANONICAL_STAGES: ActiveStage[] = [
  'edge_cases', 'brute_force', 'pattern', 'algorithm', 'tc_sc',
]

export const DEFAULT_STAGES: ActiveStage[] = ['pattern', 'algorithm', 'tc_sc']

export interface ChatResponse {
  message: string
  stage: Stage
}
```

- [ ] **Step 2: Build to check for type errors**

```bash
cd frontend && npm run build 2>&1 | grep -E "error TS|✓"
```

Expected: type errors about `Stage` usages with old values like `'complexity'` — note them, they'll be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: expand Stage type to all 5 stages + complete"
```

---

### Task 2: Settings API Functions + Update streamChat

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add `getSettings` and `updateSettings` to `frontend/src/api.ts`**

Add after the `recordStreak` function:

```typescript
export async function getSettings(): Promise<{ active_stages: ActiveStage[] }> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}

export async function updateSettings(activeStages: ActiveStage[]): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ active_stages: activeStages }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
```

Also add `ActiveStage` to the import from `./types`:

```typescript
import type { Problem, ChatMessage, Stage, ActiveStage, ProblemSearchResponse, ProblemTag } from './types'
```

- [ ] **Step 2: Update `streamChat` signature to include `activeStages`**

Change the `streamChat` function signature from:

```typescript
export async function* streamChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
  signal?: AbortSignal,
)
```

To:

```typescript
export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  signal?: AbortSignal,
)
```

And update the request body to include `active_stages`:

```typescript
body: JSON.stringify({ problem_id: problemId, stage, active_stages: activeStages, history, message }),
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build 2>&1 | grep "error TS"
```

Expected: error about `streamChat` call in `App.tsx` not passing `activeStages` — that's expected, fix in Task 3.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat: add getSettings/updateSettings API; add activeStages to streamChat"
```

---

### Task 3: Active Stages State in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports and `activeStages` state**

Add `ActiveStage` and `DEFAULT_STAGES` to the types import:

```typescript
import type { Problem, ChatMessage, Stage, ActiveStage } from './types'
import { DEFAULT_STAGES } from './types'
```

Add `getSettings`, `updateSettings` to the api import:

```typescript
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getStreak, recordStreak, getSettings } from './api'
```

Add state after the `streak` state:

```typescript
const [activeStages, setActiveStages] = useState<ActiveStage[]>(DEFAULT_STAGES)
```

- [ ] **Step 2: Load active stages on auth state change**

In the `onAuthStateChange` handler, add settings loading alongside streak loading. Update the `SIGNED_IN | INITIAL_SESSION` block:

```typescript
if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
  if (session) {
    getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
    getSettings().then(({ active_stages }) => setActiveStages(active_stages)).catch(() => {})
  } else {
    setStreak(null)
    const stored = localStorage.getItem('leetgame_active_stages')
    if (stored) {
      try {
        setActiveStages(JSON.parse(stored) as ActiveStage[])
      } catch {
        // fall back to default
      }
    }
  }
} else if (event === 'SIGNED_OUT') {
  setStreak(null)
  const stored = localStorage.getItem('leetgame_active_stages')
  if (stored) {
    try {
      setActiveStages(JSON.parse(stored) as ActiveStage[])
    } catch {
      setActiveStages(DEFAULT_STAGES)
    }
  } else {
    setActiveStages(DEFAULT_STAGES)
  }
}
```

- [ ] **Step 3: Fix `resetPracticeState` to use `activeStages[0]` as initial stage**

Change:

```typescript
const resetPracticeState = () => {
  setHistory([])
  setStage('pattern')
  setStreamingMessage('')
}
```

To:

```typescript
const resetPracticeState = () => {
  setHistory([])
  setStage(activeStages[0])
  setStreamingMessage('')
}
```

- [ ] **Step 4: Pass `activeStages` to `streamChat`**

In the `handleSubmit` function, change:

```typescript
for await (const event of streamChat(problem.id, stage, history, message, controller.signal)) {
```

To:

```typescript
for await (const event of streamChat(problem.id, stage, activeStages, history, message, controller.signal)) {
```

- [ ] **Step 5: Pass `activeStages` to `ChatView`**

In `practiceView()`, update the `ChatView` JSX to include `activeStages`:

```tsx
<ChatView
  history={history}
  stage={stage}
  activeStages={activeStages}
  loading={loading}
  error={error}
  onSubmit={handleSubmit}
  streamingMessage={streamingMessage}
  onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
  onRandom={stage === 'complete' && problemSource === 'search' ? () => void loadRandomNextProblem() : undefined}
  onBack={stage === 'complete' && canGoBack ? goBack : undefined}
/>
```

- [ ] **Step 6: Build**

```bash
cd frontend && npm run build 2>&1 | grep "error TS"
```

Expected: error about `ChatView` not accepting `activeStages` prop — fix in Task 4.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add activeStages state, load from API/localStorage, pass to ChatView"
```

---

### Task 4: Update ChatView Stage Banners

**Files:**
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Update stage banner and placeholder maps**

In `frontend/src/components/ChatView.tsx`, replace the `stageBanner` and `stagePlaceholder` maps and add `activeStages` prop:

Change the maps from partial `Stage` records covering only 3 stages to full `ActiveStage` records:

```typescript
import type { ChatMessage, Stage, ActiveStage } from '../types'
```

```typescript
const stageBanner: Record<ActiveStage, string> = {
  edge_cases: 'What edge cases does this problem have?',
  brute_force: 'What is the brute force approach?',
  pattern: 'What pattern does this problem use?',
  algorithm: 'Pattern ✓ — Now describe your algorithm',
  tc_sc: 'Algorithm ✓ — Now describe the time and space complexity',
}

const stagePlaceholder: Record<ActiveStage, string> = {
  edge_cases: 'e.g. empty input, single element, negative numbers, overflow…',
  brute_force: 'Describe the naive solution…',
  pattern: 'e.g. sliding window, BFS/DFS, dynamic programming…',
  algorithm: 'Describe your algorithm…',
  tc_sc: 'State your time and space complexity…',
}
```

- [ ] **Step 2: Add `activeStages` to `Props` interface**

```typescript
interface Props {
  history: ChatMessage[]
  stage: Stage
  activeStages: ActiveStage[]
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
  streamingMessage: string
  onNext?: () => void
  onRandom?: () => void
  onBack?: () => void
}
```

Update the function signature to destructure `activeStages`:

```typescript
export function ChatView({ history, stage, activeStages, loading, error, onSubmit, streamingMessage, onNext, onRandom, onBack }: Props) {
```

- [ ] **Step 3: Fix banner and placeholder usage**

The banner is currently:
```tsx
{stage === 'complete' ? 'Nice work! Review your session below.' : stageBanner[stage]}
```

Since `stage` can now be `ActiveStage | 'complete'`, and `stageBanner` only covers `ActiveStage`, this is already correct — just ensure TypeScript is happy by checking `stage !== 'complete'` before indexing:

```tsx
{stage === 'complete' ? 'Nice work! Review your session below.' : stageBanner[stage as ActiveStage]}
```

Same for the placeholder:
```tsx
placeholder={stage !== 'complete' ? (stagePlaceholder[stage as ActiveStage] ?? 'Describe your approach…') : ''}
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error TS|✓"
```

Expected: `✓ built` — clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatView.tsx
git commit -m "feat: update ChatView stage banners for all 5 stages"
```

---

### Task 5: StagesSettings Component

**Files:**
- Create: `frontend/src/components/StagesSettings.tsx`

- [ ] **Step 1: Create `frontend/src/components/StagesSettings.tsx`**

```typescript
import { useRef, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { CANONICAL_STAGES } from '../types'
import { cn } from '../lib/utils'

const STAGE_META: Record<ActiveStage, { label: string; description: string }> = {
  edge_cases:  { label: 'Edge Cases',           description: 'Identify boundary conditions and gotchas' },
  brute_force: { label: 'Brute Force',           description: 'Describe the naive solution' },
  pattern:     { label: 'Optimal Pattern',       description: 'Identify the algorithm pattern' },
  algorithm:   { label: 'Optimal Algorithm',     description: 'Describe the optimal algorithm' },
  tc_sc:       { label: 'Time & Space',          description: 'State time and space complexity' },
}

interface Props {
  activeStages: ActiveStage[]
  onChange: (stages: ActiveStage[]) => void
  onClose: () => void
}

export function StagesSettings({ activeStages, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  const toggle = (stage: ActiveStage) => {
    const isActive = activeStages.includes(stage)
    if (isActive && activeStages.length === 1) return // can't remove last
    const next = isActive
      ? activeStages.filter(s => s !== stage)
      : CANONICAL_STAGES.filter(s => activeStages.includes(s) || s === stage)
    onChange(next)
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-30 w-72 rounded-md border border-border bg-background shadow-lg py-2"
    >
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Practice Stages
      </p>
      {CANONICAL_STAGES.map(stage => {
        const active = activeStages.includes(stage)
        const isLast = active && activeStages.length === 1
        const meta = STAGE_META[stage]
        return (
          <button
            key={stage}
            onClick={() => toggle(stage)}
            disabled={isLast}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
              isLast ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
            )}
          >
            <div className={cn(
              "h-4 w-4 rounded border shrink-0 flex items-center justify-center",
              active ? "bg-primary border-primary" : "border-border"
            )}>
              {active && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error TS|✓"
```

Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StagesSettings.tsx
git commit -m "feat: add StagesSettings toggle panel component"
```

---

### Task 6: Wire StagesSettings into NavBar

**Files:**
- Modify: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update `NavBar.tsx` to accept and show settings**

The NavBar needs `activeStages`, `onStagesChange`, and to manage the open/close state of the panel.

Replace `frontend/src/components/NavBar.tsx` with:

```typescript
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { ActiveStage } from '../types'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { StagesSettings } from './StagesSettings'

type View = 'practice' | 'search'

interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
  activeStages: ActiveStage[]
  onStagesChange: (stages: ActiveStage[]) => void
}

export function NavBar({ view, onNavigate, session, authLoading, streak, activeStages, onStagesChange }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
      {(['practice', 'search'] as View[]).map(v => (
        <Button
          key={v}
          variant={view === v ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </Button>
      ))}

      <div className="ml-auto flex items-center gap-2">
        {!authLoading && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(o => !o)}
              className="text-muted-foreground px-2"
              title="Practice stages"
            >
              ⚙
            </Button>
            {settingsOpen && (
              <StagesSettings
                activeStages={activeStages}
                onChange={stages => { onStagesChange(stages); }}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </div>
        )}
        {authLoading ? null : session ? (
          <>
            {streak !== null && streak >= 1 && (
              <span className="text-sm font-medium">🔥 {streak}</span>
            )}
            {session.user.user_metadata?.avatar_url && (
              <img
                src={session.user.user_metadata.avatar_url as string}
                alt="avatar"
                className="h-6 w-6 rounded-full"
              />
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {session.user.user_metadata?.name as string ?? session.user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void handleSignIn()}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `App.tsx` to handle stage changes with persistence**

Add `updateSettings` to the api import in `App.tsx`:

```typescript
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getStreak, recordStreak, getSettings, updateSettings } from './api'
```

Add a `handleStagesChange` function in `App.tsx` (after the `goBack` function):

```typescript
const handleStagesChange = (stages: ActiveStage[]) => {
  setActiveStages(stages)
  if (session) {
    updateSettings(stages).catch(() => {})
  } else {
    try {
      localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
    } catch {
      // ignore storage errors
    }
  }
}
```

Update the `NavBar` JSX to pass the new props:

```tsx
<NavBar
  view={view}
  onNavigate={setView}
  session={session}
  authLoading={authLoading}
  streak={streak}
  activeStages={activeStages}
  onStagesChange={handleStagesChange}
/>
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build 2>&1 | grep -E "error TS|✓"
```

Expected: `✓ built` — clean build.

- [ ] **Step 4: Manual test**

Start the frontend dev server:

```bash
cd frontend && npm run dev
```

1. Open the app — gear icon ⚙ appears in the NavBar
2. Click ⚙ — settings panel opens with 5 stages, 3 checked by default
3. Toggle a stage on/off — check updates
4. Try to uncheck the last remaining stage — it should be disabled (no action)
5. Click outside the panel — it closes
6. Start a chat — the new stages are used (first stage banner changes if you toggled)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/App.tsx
git commit -m "feat: wire StagesSettings into NavBar with persistence"
```

---

### Task 7: Final Build + Push

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build 2>&1 | tail -6
```

Expected:
```
dist/index.html           0.45 kB │ gzip: ...
dist/assets/index-*.css  ...
dist/assets/index-*.js   ...
✓ built in ...ms
```

- [ ] **Step 2: Push**

```bash
git push
```

