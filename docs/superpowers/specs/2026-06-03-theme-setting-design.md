# Theme Setting Design

## Goal

Add a System / Light / Dark theme toggle to the settings panel so users can override the OS dark mode preference.

## Architecture

A `useTheme` hook manages theme state in localStorage and applies `.dark` or `.light` to `document.documentElement`. One CSS change scopes the existing `@media (prefers-color-scheme: dark)` block to `:not(.light)` so an explicit light override takes effect even on dark-OS devices. The toggle lives in the existing `StagesSettings` popover under the "Display" section. No backend changes.

## Tech Stack

React, TypeScript, Tailwind CSS, localStorage

---

## CSS Changes (`frontend/src/index.css`)

Add `:not(.light)` to the media query selector:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    /* existing dark vars unchanged */
  }
}
```

The existing `.dark { }` block stays as-is — it already sets dark CSS variables when `.dark` is present on `<html>`.

No other CSS changes. The `--prose-bold` and `--code-bg` dark overrides inside the media query block also get the `:not(.light)` guard automatically since they're in the same block.

## `useTheme` Hook (`frontend/src/hooks/useTheme.ts`)

```ts
type Theme = 'system' | 'light' | 'dark'
```

- Reads `localStorage.getItem('leetgame_theme')` on mount, defaulting to `'system'`
- On mount and on every change:
  - `'dark'`: add `.dark`, remove `.light` from `document.documentElement.classList`
  - `'light'`: add `.light`, remove `.dark`
  - `'system'`: remove both `.dark` and `.light`
- `setTheme(t: Theme)`: updates state, persists to localStorage, applies class immediately
- Returns `{ theme, setTheme }`

## `StagesSettings` Component (`frontend/src/components/StagesSettings.tsx`)

Add two new props:

```ts
theme: Theme
onThemeChange: (t: Theme) => void
```

Add a segmented control under the "Display" section header, above the "Hide problem title" row:

- Three buttons: System | Light | Dark
- Active button uses `bg-muted` + `text-foreground`; inactive buttons use `text-muted-foreground`
- Label row: `text-xs font-semibold uppercase tracking-wide text-muted-foreground` — same style as the "Display" and "Practice Stages" section headers (already used in the component)

## `NavBar` Component (`frontend/src/components/NavBar.tsx`)

Add to `Props`:

```ts
theme: Theme
onThemeChange: (t: Theme) => void
```

Pass both through to `StagesSettings`.

## `App` Component (`frontend/src/App.tsx`)

Call `useTheme()` at the top of the component. Pass `theme` and `onThemeChange` (= `setTheme`) to `NavBar`.

## Data Flow

```
useTheme (hook)
  → reads/writes localStorage('leetgame_theme')
  → mutates document.documentElement.classList
  → returns { theme, setTheme }

App
  → calls useTheme()
  → passes theme/setTheme to NavBar

NavBar
  → passes theme/onThemeChange to StagesSettings (via popover)

StagesSettings
  → renders segmented control
  → calls onThemeChange on click
```

## Error Handling

- If localStorage read throws (private browsing, quota): catch and default to `'system'`
- If localStorage write throws: silently ignore (preference just won't persist)

## Testing

Manual verification:
1. System: toggle OS dark mode → app follows
2. Dark: app is dark regardless of OS mode
3. Light: app is light regardless of OS mode (including on a dark-OS device)
4. Preference persists across page reload
5. Preference persists across sign-in / sign-out (localStorage is not cleared on auth events)
