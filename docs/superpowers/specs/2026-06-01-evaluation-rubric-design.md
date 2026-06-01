# Evaluation Rubric & Hint/Answer Buttons Design

## Goal

Replace the vague 0.0–1.0 evaluation rubric (which causes LLM scores to cluster in 0.6–0.9) with stage-specific anchored rubrics, and add "Give me a hint" and "Give me the answer" buttons that provide explicit signals to the evaluator.

## Background

Scores feed a weighted ELO formula (`new = old + learning_rate * (session_score - old)`) and drive smart problem selection via `weight = 1 - avg_score`. Inflated scores corrupt both: the system thinks users are proficient when they aren't, and stops surfacing weak topics. Accurate scoring is critical.

The root cause of clustering: the current rubric has only two anchors (0.0 and 1.0) with nothing defined in between, so the LLM fills the gap generously.

Key constraint: the interviewer LLM always prompts for explanation via Socratic questions, so "no explanation" is never a reachable state in practice. Rubric anchors must reflect what actually happens in sessions.

## Rubric Design

Scores are per `(topic, stage)` pair. Stage-specific anchors replace the current single-sentence rubric.

### `pattern`, `algorithm`, `brute_force`

Score correctness and depth of explanation:

| Score | Meaning |
|---|---|
| 0.0 | Nothing correct, completely wrong, or did not engage |
| 0.2 | Vague/surface answer with no real substance (e.g. named a term, couldn't explain it) |
| 0.4 | Partial understanding — some correct ideas but significant gaps or wrong reasoning |
| 0.6 | Correct on the core idea but missed a key detail or nuance |
| 0.8 | Correct and well-reasoned, covered the key points |
| 1.0 | Thorough and accurate with clear reasoning, no meaningful gaps |

### `edge_cases`

Score coverage and specificity. First determine the key edge cases for this specific problem, then assess how well the user covered them:

| Score | Meaning |
|---|---|
| 0.0 | Identified no relevant edge cases |
| 0.2 | Only named generic cases not specific to this problem (e.g. "null input" where it's irrelevant) |
| 0.4 | Identified some cases but missed the most important one(s) for this problem |
| 0.6 | Identified the key cases but described them imprecisely or missed a minor one |
| 0.8 | Identified all key cases correctly, minor wording imprecision |
| 1.0 | Identified all key cases clearly and correctly |

### `tc_sc`

Score correctness of both time and space complexity, weighted by explanation quality:

| Score | Meaning |
|---|---|
| 0.0 | Both wrong |
| 0.5 | One correct, one wrong |
| 0.7 | Both correct, explanation vague or incomplete |
| 1.0 | Both correct with clear reasoning for each (e.g. "O(n) because we iterate once, O(1) because no extra space") |

### Universal Reveal Cap

If the interviewer stated an answer directly (as opposed to asking a Socratic question) — **without the user requesting it** — cap that stage's score at 0.2 regardless of the user's response. This is distinct from the answer button flow below.

## Hint / Answer Buttons

Two buttons appear in the chat UI alongside the message input.

### "Give me a hint"

- Frontend sends the user's turn with a `hint_requested: true` flag
- Backend injects `[USER REQUESTED HINT]` into the conversation history before the user's message
- System prompt for that turn adds: "The user has requested a hint. Give a targeted hint that moves them in the right direction without fully revealing the answer."
- Evaluator sees the `[USER REQUESTED HINT]` marker in history — applies a soft penalty: score cannot exceed 0.6 for that stage

### "Give me the answer"

- Frontend sends with `answer_requested: true` flag
- Backend injects `[USER REQUESTED ANSWER]` into the conversation history
- System prompt for that turn adds: "The user has requested the answer. Reveal the correct answer clearly and advance to the next stage."
- Stage advances immediately (same as a correct answer)
- Evaluator sees `[USER REQUESTED ANSWER]` — caps that stage's score at 0.2

## Architecture

### Changes to `internal/llm/evaluation.go`

`BuildEvaluationPrompt` is updated to include the stage-specific rubric sections above, replacing the current two-anchor description. The reveal cap instruction is added as a universal rule.

### Changes to `internal/llm/llm.go`

`BuildSystemPrompt` gains a `hintRequested bool` parameter. When true, appends the hint instruction to the system prompt for that turn.

### Changes to `internal/types/chat_request.go`

`ChatRequest` gains two fields:
```go
HintRequested   bool `json:"hint_requested"`
AnswerRequested bool `json:"answer_requested"`
```

### Changes to `internal/handlers/chat.go`

Before calling `llmClient.Evaluate`, if `req.HintRequested` or `req.AnswerRequested` is set:
- Inject the appropriate marker as a system message into the history
- Pass the flag through to `BuildSystemPrompt`

### Changes to frontend `Chat` component

Two buttons rendered below the message input:
- "Give me a hint" — sets `hint_requested: true` on the next message send
- "Give me the answer" — sets `answer_requested: true` on the next message send

Buttons are disabled when `stage === "complete"`.

## Scoring Impact

| Situation | Max score |
|---|---|
| Normal session, good answer | 1.0 |
| Hint requested | 0.6 |
| Answer requested (or unprompted reveal) | 0.2 |
| Wrong / no engagement | 0.0 |

## What Is Not Changing

- The `SessionEvaluation` and `TopicScore` types — no schema changes
- The ELO update formula in `chat.go`
- The `(topic, stage)` pair structure of scores
- The `complete` stage advancement logic — answer button uses the same path
