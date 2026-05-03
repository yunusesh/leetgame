# leetgame MVP Design

## Overview

A web app where users practice LeetCode problems by describing their approach in natural language. Claude evaluates correctness and guides users with Socratic questioning when they're wrong, rather than revealing the answer. The goal is low-friction practice when a user doesn't want to fully code out a solution.

## Core User Flow

1. User lands on the app and is shown a random LeetCode problem.
2. User types their algorithm approach in a chat input.
3. Claude evaluates the approach:
   - **Wrong:** Claude asks one focused probing question. User responds. Loop continues until correct.
   - **Correct:** Claude transitions to complexity check.
4. Claude asks the user to state time and space complexity.
   - **Wrong:** Claude probes until correct.
   - **Correct:** Stage marked complete. User sees a "Next Problem" button.
5. New random problem is fetched. Chat resets. Repeat.

No auth, no scoring, no streaks for MVP.

## Problem Data

**Source:** [newfacade/LeetCodeDataset](https://huggingface.co/datasets/newfacade/LeetCodeDataset) — ~2,869 problems with full descriptions, difficulty, topic tags, and starter code. Free, no auth required.

**Seed script:** A one-time Python script (`scripts/seed.py`) that downloads the dataset and bulk-inserts into Postgres. Not part of the application runtime.

**Schema:**
```sql
CREATE TABLE problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty  TEXT NOT NULL,  -- 'Easy' | 'Medium' | 'Hard'
  topic_tags  TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## API

### `GET /api/problems/random`

Returns a random problem. No params, no auth.

**Response:**
```json
{
  "id": "uuid",
  "slug": "two-sum",
  "title": "Two Sum",
  "description": "...",
  "difficulty": "Easy",
  "topic_tags": ["array", "hash-table"]
}
```

### `POST /api/chat`

Stateless — the client sends the full conversation history each turn. The server looks up the problem, builds the Claude prompt, and returns the response.

**Request:**
```json
{
  "problem_id": "uuid",
  "stage": "algorithm",
  "history": [
    {"role": "user", "content": "I'd use a hash map..."},
    {"role": "assistant", "content": "Good start. What would you store as the key?"}
  ],
  "message": "I'd store each number and its index as the value"
}
```

**Response:**
```json
{
  "message": "Exactly. And what's the time complexity of this approach?",
  "stage": "complexity"
}
```

`stage` values: `"algorithm"` | `"complexity"` | `"complete"`

**Errors:**
- `400` — missing/invalid fields
- `404` — problem_id not found
- `500` — Claude API failure (generic message returned to client)

## AI Evaluation

Claude is the sole evaluator. No rule-based stage detection on the server — stage transitions come from Claude's structured JSON output.

**System prompt (injected per request):**
```
You are a technical interviewer helping a candidate practice LeetCode problems.

Problem:
<title and description injected here>

You evaluate the candidate's approach in two stages:

Stage 1 — Algorithm:
Assess whether the described algorithm is correct and reasonably optimal for this problem.
- If incorrect or incomplete: ask exactly one focused Socratic question to guide their thinking. Never reveal the answer directly.
- If correct: acknowledge it briefly and transition to Stage 2.

Stage 2 — Complexity:
Ask the candidate to state the time and space complexity of their solution.
- If incorrect: ask a focused question to guide them.
- If correct: confirm and signal completion.

Always respond in JSON with this exact shape:
{"message": "<your response to the candidate>", "stage": "<algorithm|complexity|complete>"}

Current stage: <"algorithm" on first turn; client passes current stage on subsequent turns so you maintain continuity>
```

The server appends the new user message to history, sends to Claude with the system prompt, parses the JSON response, and returns `message` + `stage` to the client.

## Frontend

**Stack:** React + Vite (plain, no meta-framework).

**Three UI states (no routing, conditional render):**

1. **Problem view** — title, difficulty badge, tags, description. "Start" button loads a random problem.
2. **Chat view** — split layout: problem on left, chat thread on right. Stage banner updates as stages progress ("Algorithm ✓ — Now describe the complexity"). Text area + submit button at bottom.
3. **Complete view** — brief success message, "Next Problem" button that fetches a new random problem and resets chat state.

Client state:
```ts
{
  problem: Problem | null
  history: {role: 'user' | 'assistant', content: string}[]
  stage: 'algorithm' | 'complexity' | 'complete'
  loading: boolean
}
```

## Project Structure Changes

```
leetgame/
├── scripts/
│   └── seed.py              # one-time data seed
├── frontend/                # React/Vite app
│   └── src/
├── backend/
│   └── internal/
│       ├── constants/
│       │   └── routes.go    # add chat + problems routes
│       ├── handlers/
│       │   ├── problems.go  # GET /api/problems/random
│       │   └── chat.go      # POST /api/chat
│       ├── models/
│       │   └── problem.go
│       ├── settings/
│       │   └── claude.go    # Claude API key + model config
│       ├── storage/
│       │   └── postgres/
│       │       └── problems.go
│       └── types/
│           ├── chat_request.go
│           └── chat_response.go
```

## Out of Scope for MVP

- Auth / user accounts
- Streaks, scoring, history
- Problem filtering by difficulty or topic
- Hints on demand
- Code submission / execution
- Premium LeetCode problems
