# Mission Page

## Goal

A public-facing page explaining why leetgame exists, written in first person. Accessible via a "Mission" nav button. Aimed at visitors who want to understand the purpose of the app.

## Navigation

Add `'mission'` to the `View` union type. Add a "Mission" button to the navbar using the same ghost/secondary pattern as Practice, Search, and Stats. The button is always visible (not auth-gated).

## Content

Three sections, written as flowing prose in first person. No corporate headers, no bullet lists — plain paragraphs.

### Why verbal-only?

Writing code is a crutch. When you can jump straight to typing, you never have to fully articulate your thinking. Talking through an approach — out loud, in plain English — forces you to actually understand it. That's also what interviews test: not whether you can type, but whether you can think and communicate clearly.

### Why pattern recognition?

Most LeetCode problems aren't novel puzzles. They're applications of a small set of patterns — sliding window, BFS, dynamic programming, two pointers. The hard part isn't implementing them; it's recognizing which one applies. leetgame drills that recognition step in isolation, so when you see a problem you're identifying the pattern before you've even thought about code.

### Why mobile?

A coding environment needs a laptop, a quiet space, and a chunk of uninterrupted time. That's a high bar. leetgame works on your phone, takes a few minutes per problem, and fits into dead time — a commute, a lunch break, five minutes between meetings. Lower friction means you actually practice instead of waiting for the perfect conditions that never come.

## Page structure

```
<div> scrollable container, max-w-2xl centered, px-6 py-8
  <h1> "Why I built leetgame"
  <p class="text-muted-foreground"> one-line summary
  <section> × 3 — each with an <h2> and one or two <p> paragraphs
```

Styling follows the existing app design system (Tailwind, CSS variables). No new colors or components needed.

## Files

| File | Change |
|---|---|
| `frontend/src/types.ts` | Add `'mission'` to `View` type |
| `frontend/src/components/MissionPage.tsx` | New component with page content |
| `frontend/src/components/NavBar.tsx` | Add Mission nav button |
| `frontend/src/App.tsx` | Render `MissionPage` when `view === 'mission'` |

## Out of Scope

- Auth-gating (page is public)
- CMS or editable content
- Images or illustrations
- SEO meta tags
