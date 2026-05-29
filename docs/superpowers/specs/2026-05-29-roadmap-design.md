# Leetgame Roadmap Design

**Date:** 2026-05-29

## Purpose

Leetgame is a personal practice tool for improving algorithm pattern recognition through plain-English verbal explanation — no code writing. The goal is low-friction, mobile-accessible practice you can do anywhere in short bursts. Future direction includes sharing the tool with other users.

## Phase 1 — Deploy + Mobile

### Responsive UI

Rework the current side-by-side desktop layout into a single-column mobile-first layout.

- On mobile: problem panel is collapsed by default with an expand toggle; chat takes full width below it
- On desktop: preserve the current side-by-side layout
- Input textarea stays above the keyboard on iOS/Android (avoid the keyboard-covering-input bug)
- Breakpoint: treat anything under 768px as mobile

### Render Deployment

- **Frontend**: deploy as a Render static site (npm build output)
- **Backend**: deploy as a Render web service (Go, native build — no Docker needed)
- Environment vars on Render: `STORAGE_DB_URL`, `OLLAMA_API_KEY`, `LLM_MODEL`, `SERVER_PORT`, `LOG_LEVEL`

### Supabase Hosted DB

- Migrate from local Supabase to the hosted Supabase project
- Same schema, same seed data — just update `STORAGE_DB_URL` to point at the hosted project
- No schema changes required for Phase 1

### Ollama Cloud

- Existing Ollama client code works unchanged
- Add `OLLAMA_API_KEY` env var; pass it as a Bearer token in the `Authorization` header on all Ollama API requests
- No hardware required; cloud models are free via `ollama login`

### Auth — Supabase Auth + Google OAuth

- Use Supabase Auth with Google OAuth provider
- Frontend: Supabase JS client handles the OAuth redirect flow
- Backend: validate Supabase JWT on every request via middleware; extract `user_id` from the token and store in xcontext
- For now, whitelist a single email (yours) in Supabase Auth settings — flip to open when sharing with others
- Unauthenticated requests return 401; frontend redirects to login screen

## Phase 2 — Daily Streak

A streak counter that resets if you skip a day. Visible on the home screen.

### Data

New `streaks` table (or a `user_stats` table):

```sql
create table user_stats (
  user_id uuid primary key references auth.users(id),
  current_streak int not null default 0,
  last_practiced_at date
);
```

### Logic

- When a user completes any problem (stage reaches `complete`), record today's date as `last_practiced_at` and increment `current_streak` if `last_practiced_at` was yesterday, set it to 1 if it was before yesterday, or leave it unchanged if already today
- Streak is read on app load and displayed in the NavBar

### UI

- NavBar shows a flame icon + streak count (e.g., "🔥 5")
- First visit of the day that completes a problem animates the counter incrementing

## Phase 3 — Pattern Warmup

Before describing the algorithm, the user guesses the pattern category. Builds recognition speed separately from explanation ability.

### Flow

New stage inserted before `algorithm`: `pattern`

1. Problem loads → user sees the problem statement
2. User selects or types a pattern guess (e.g., "sliding window", "BFS", "dynamic programming")
3. AI evaluates whether the guess is correct:
   - Correct: brief confirmation, advance to `algorithm` stage
   - Incorrect: one Socratic nudge, stay on `pattern` stage
4. Once pattern is confirmed, proceed to existing algorithm → complexity → complete flow

### UI

- Pattern stage shows a prompt: "What pattern does this problem use?"
- Could be a free-text input (same chat interface) or a tag-picker for the known tags already in the DB
- Start with free-text (reuses existing chat UI); add tag-picker later if useful

### Backend

- Add `pattern` as a valid stage value in the LLM prompt and stage machine
- System prompt gains a Stage 0 section explaining pattern evaluation rules
- `EvaluateResponse.Stage` can now return `"pattern"` in addition to existing values

## Backlog (build later)

- **Problem history** — store each attempt (problem, pass/fail at algorithm + complexity, timestamp, user_id)
- **Pattern weakness view** — aggregate history by tag, surface patterns the user misses most
- **Session mode** — "give me N problems", summary card at the end
- **Pattern reveal** — after completing, AI names the pattern and explains why it fits
- **Hint tiers** — escalating hints (nudge → stronger hint → near-answer) instead of one Socratic question
- **Cross-problem connections** — "you solved a similar problem last week"
