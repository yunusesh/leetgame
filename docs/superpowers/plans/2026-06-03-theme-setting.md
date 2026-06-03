# Theme Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a System / Light / Dark theme toggle to the settings popover that overrides the OS dark mode preference and persists to localStorage.

**Architecture:** A `useTheme` hook applies `.dark` or `.light` to `document.documentElement` and reads/writes `localStorage('leetgame_theme')`. The CSS media query gains a `:not(.light)` guard so forcing light mode works on dark-OS devices. The toggle is a segmented control in `StagesSettings` under the existing "Display" section.

**Tech Stack:** React, TypeScript, Tailwind CSS, localStorage

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/index.css` | Add `:not(.light)` to `@media` selector |
| `frontend/src/hooks/useTheme.ts` | New hook — manages theme state + class on `<html>` |
| `frontend/src/components/StagesSettings.tsx` | Add `theme`/`onThemeChange` props + segmented control |
| `frontend/src/components/NavBar.tsx` | Add `theme`/`onThemeChange` props, pass to `StagesSettings` |
| `frontend/src/App.tsx` | Call `useTheme()`, pass values to `NavBar` |

---

### Task 1: Guard the CSS media query

**Files:**
- Modify: `frontend/src/index.css:53`

- [ ] **Step 1: Open `frontend/src/index.css` and locate the `@media (prefers-color-scheme: dark)` block (around line 53). Change `:root` to `:root:not(.light)`**

Replace:
```css
@media (prefers-color-scheme: dark) {
  :root {
```
With:
```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
```

The rest of the block is unchanged. The full block after edit:
```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: #16171d;
    --foreground: #f3f4f6;
    --card: #16171d;
    --card-foreground: #f3f4f6;
    --popover: #16171d;
    --popover-foreground: #f3f4f6;
    --primary: #c084fc;
    --primary-foreground: #fff;
    --secondary: #2e303a;
    --secondary-foreground: #f3f4f6;
    --muted: #1f2028;
    --muted-foreground: #9ca3af;
    --accent: rgba(192, 132, 252, 0.15);
    --accent-foreground: #c084fc;
    --destructive: #ff375f;
    --destructive-foreground: #fff;
    --border: #2e303a;
    --input: #2e303a;
    --ring: #c084fc;
    --prose-bold: #ffffff;
    --code-bg: #2a2d3e;
  }
}
```

- [ ] **Step 2: Verify the dev server compiles without errors**

```bash
cd frontend && npm run dev
```
Expected: no CSS errors in terminal output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: guard dark media query with :not(.light) for theme override"
```

---

### Task 2: `useTheme` hook

**Files:**
- Create: `frontend/src/hooks/useTheme.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useTheme.ts` with the full implementation**

```ts
export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'leetgame_theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList
  if (theme === 'dark') {
    cl.add('dark')
    cl.remove('light')
  } else if (theme === 'light') {
    cl.add('light')
    cl.remove('dark')
  } else {
    cl.remove('dark')
    cl.remove('light')
  }
}

import { useState, useEffect } from 'react'

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStored)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch { /* ignore */ }
  }

  return { theme, setTheme }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

With the dev server running, open the browser console and run:
```js
document.documentElement.classList.add('dark')
```
Expected: page switches to dark theme. Then:
```js
document.documentElement.classList.remove('dark')
document.documentElement.classList.add('light')
```
Expected: page switches to light theme even if OS is dark.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useTheme.ts
git commit -m "feat: add useTheme hook for system/light/dark preference"
```

---

### Task 3: Theme segmented control in `StagesSettings`

**Files:**
- Modify: `frontend/src/components/StagesSettings.tsx`

Context: `StagesSettings` renders a popover panel with a "Display" section (containing "Hide problem title") and a "Practice Stages" section. We're adding a theme row as the first item under "Display".

- [ ] **Step 1: Add the `Theme` import and new props to `StagesSettings`**

At the top of `frontend/src/components/StagesSettings.tsx`, add the import:
```ts
import type { Theme } from '../hooks/useTheme'
```

Add `theme` and `onThemeChange` to the `Props` interface:
```ts
interface Props {
  activeStages: ActiveStage[]
  onChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}
```

Update the function signature to destructure the new props:
```ts
export function StagesSettings({ activeStages, onChange, hideTitle, onHideTitleChange, onTakeTour, theme, onThemeChange }: Props) {
```

- [ ] **Step 2: Add the segmented control inside the "Display" section, before the "Hide problem title" row**

The current "Display" section starts at the `<p>` with text "Display". Insert the segmented control between that `<p>` and the `hideTitle` button. The full updated component body:

```tsx
  return (
    <div className="py-2">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Display
      </p>
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-medium">Theme</span>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(['system', 'light', 'dark'] as const).map(t => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`px-2.5 py-1 capitalize transition-colors ${
                theme === t
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={() => onHideTitleChange(!hideTitle)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted cursor-pointer transition-colors"
      >
        <Checkbox checked={hideTitle} onCheckedChange={v => onHideTitleChange(v === true)} />
        <div>
          <p className="text-sm font-medium">Hide problem title</p>
          <p className="text-xs text-muted-foreground">Reveal on click to test recall</p>
        </div>
      </button>
      <div className="mx-3 my-2 border-t border-border" />
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
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${isLast ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}
          >
            <Checkbox checked={active} disabled={isLast} onCheckedChange={() => toggle(stage)} />
            <div>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </button>
        )
      })}
      {onTakeTour && (
        <>
          <div className="mx-3 my-2 border-t border-border" />
          <button
            onClick={onTakeTour}
            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Take a tour
          </button>
        </>
      )}
    </div>
  )
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: errors about missing `theme`/`onThemeChange` props in `NavBar.tsx` (caller not yet updated). That's expected at this point — proceed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StagesSettings.tsx
git commit -m "feat: add theme segmented control to StagesSettings"
```

---

### Task 4: Thread theme props through `NavBar`

**Files:**
- Modify: `frontend/src/components/NavBar.tsx`

- [ ] **Step 1: Add the `Theme` import and new props to `NavBar`**

Add import at top of `frontend/src/components/NavBar.tsx`:
```ts
import type { Theme } from '../hooks/useTheme'
```

Add to the `Props` interface:
```ts
interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
  streakStatus: 'solid' | 'hollow' | 'none' | null
  activeStages: ActiveStage[]
  onStagesChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}
```

Update the function signature:
```ts
export function NavBar({ view, onNavigate, session, authLoading, streak, streakStatus, activeStages, onStagesChange, hideTitle, onHideTitleChange, onTakeTour, theme, onThemeChange }: Props) {
```

- [ ] **Step 2: Pass `theme` and `onThemeChange` to `StagesSettings`**

Find the `<StagesSettings` usage in the JSX and add the two new props:
```tsx
<StagesSettings
  activeStages={activeStages}
  onChange={onStagesChange}
  hideTitle={hideTitle}
  onHideTitleChange={onHideTitleChange}
  onTakeTour={onTakeTour}
  theme={theme}
  onThemeChange={onThemeChange}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: error about missing `theme`/`onThemeChange` in `App.tsx` (not yet updated). Proceed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NavBar.tsx
git commit -m "feat: thread theme props through NavBar to StagesSettings"
```

---

### Task 5: Wire `useTheme` in `App`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import `useTheme` in `App.tsx`**

Add to the imports at the top of `frontend/src/App.tsx`:
```ts
import { useTheme } from './hooks/useTheme'
```

- [ ] **Step 2: Call `useTheme()` at the top of the `App` component**

Inside `export default function App()`, after the existing `useAuth` and `useTour` calls, add:
```ts
const { theme, setTheme } = useTheme()
```

- [ ] **Step 3: Pass `theme` and `onThemeChange` to `NavBar`**

Find the `<NavBar` usage in the JSX and add:
```tsx
<NavBar
  view={view}
  onNavigate={setView}
  session={session}
  authLoading={authLoading}
  streak={streak}
  streakStatus={streakStatus}
  activeStages={activeStages}
  onStagesChange={handleStagesChange}
  hideTitle={hideTitle}
  onHideTitleChange={handleHideTitleChange}
  onTakeTour={handleStartTour}
  theme={theme}
  onThemeChange={setTheme}
/>
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification**

With the dev server running (`npm run dev`):
1. Open the settings popover (⚙ gear icon). Confirm "Theme" row appears with System / Light / Dark buttons.
2. Click **Dark** — app goes dark regardless of OS mode. Reload page — still dark.
3. Click **Light** — app goes light regardless of OS mode. Reload page — still light.
4. Click **System** — app follows OS. Toggle OS dark mode — app follows. Reload — still follows OS.
5. Open browser DevTools → Application → Local Storage → confirm `leetgame_theme` key updates on each click.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire useTheme into App and connect to NavBar"
```
