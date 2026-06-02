# Hint/Answer Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two design workarounds in the hint/answer feature: (1) server-side stage advancement when "Give me the answer" is clicked instead of relying on the LLM to return the right stage, and (2) replace inline text markers in message content with a typed `Marker` field on `ChatMessage` to keep content clean.

**Architecture:** Task 1 is backend-only: add a `nextStage` helper to the chat handler and override `result.Stage` when `answer_requested=true`. Task 2 is full-stack: add `Marker string` to the backend `ChatMessage` type and `marker?: 'hint' | 'answer'` to the frontend type, thread it through history serialization, update `BuildEvaluationPrompt` to inject marker context when rendering history, and remove the inline text prefix and regex strip.

**Tech Stack:** Go (`internal/llm`, `internal/types`, `internal/handlers`), TypeScript/React (`frontend/src`).

---

## File Map

**Task 1:**
- Modify: `backend/internal/handlers/chat.go` — add `nextStage` helper; override `result.Stage` when `answer_requested`
- Create: `backend/internal/handlers/chat_test.go` — unit tests for `nextStage`
- Modify: `backend/internal/llm/llm.go` — remove the now-dead "set stage to next stage" clause from the `answerRequested` system prompt instruction

**Task 2:**
- Modify: `backend/internal/llm/llm.go` — add `Marker string` field to `ChatMessage`
- Modify: `backend/internal/llm/evaluation.go` — inject marker text when rendering history in `BuildEvaluationPrompt`
- Modify: `backend/internal/llm/evaluation_test.go` — add test for marker rendering in prompt
- Modify: `backend/internal/types/chat_request.go` — add `Marker string` to `HistoryMessage`
- Modify: `backend/internal/handlers/chat.go` — replace inline content prefix with `Marker` field; preserve markers in `baseHistory`
- Modify: `frontend/src/types.ts` — add `marker?: 'hint' | 'answer'` to `ChatMessage`
- Modify: `frontend/src/App.tsx` — set `marker` field instead of prefixing content
- Modify: `frontend/src/components/ChatView.tsx` — remove regex strip, render `msg.content` directly
- No change to `frontend/src/api.ts` — `history` already serializes all fields via `JSON.stringify`

---

## Task 1: Server-side stage advancement for "Give me the answer"

**Files:**
- Modify: `backend/internal/handlers/chat.go`
- Create: `backend/internal/handlers/chat_test.go`

**Context:** Currently when `answer_requested=true`, the LLM is told in its system prompt to "set stage to the next stage." This is unreliable — if the LLM returns the wrong stage, the user gets stuck. Fix: compute the next stage server-side and override `result.Stage`.

The `nextStage` logic: find `current` in `activeStages`, return the following element, or `"complete"` if it's the last or not found.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/handlers/chat_test.go`:

```go
package handlers

import (
    "testing"
)

func TestNextStage_MiddleStage(t *testing.T) {
    got := nextStage("pattern", []string{"pattern", "algorithm", "tc_sc"})
    if got != "algorithm" {
        t.Errorf("want 'algorithm', got %q", got)
    }
}

func TestNextStage_LastStage(t *testing.T) {
    got := nextStage("tc_sc", []string{"pattern", "algorithm", "tc_sc"})
    if got != "complete" {
        t.Errorf("want 'complete', got %q", got)
    }
}

func TestNextStage_SingleStage(t *testing.T) {
    got := nextStage("pattern", []string{"pattern"})
    if got != "complete" {
        t.Errorf("want 'complete', got %q", got)
    }
}

func TestNextStage_NotFound(t *testing.T) {
    got := nextStage("edge_cases", []string{"pattern", "tc_sc"})
    if got != "complete" {
        t.Errorf("want 'complete', got %q", got)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/handlers/... -run TestNextStage -v
```

Expected: FAIL — `nextStage` undefined.

- [ ] **Step 3: Add `nextStage` helper to `chat.go`**

At the bottom of `backend/internal/handlers/chat.go`, after `runSessionEvaluation`, add:

```go
func nextStage(current string, activeStages []string) string {
    for i, s := range activeStages {
        if s == current && i+1 < len(activeStages) {
            return activeStages[i+1]
        }
    }
    return "complete"
}
```

- [ ] **Step 4: Override `result.Stage` in the stream writer when `answer_requested`**

In `backend/internal/handlers/chat.go`, inside the `SetBodyStreamWriter` callback, find the block after `llmClient.Evaluate` succeeds (around line 86):

```go
done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
```

Add an override immediately after the `Evaluate` call and before that `json.Marshal` line:

```go
if req.AnswerRequested {
    result.Stage = nextStage(req.Stage, req.ActiveStages)
}
```

The final block should look like:

```go
result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, req.HintRequested, req.AnswerRequested, onToken)
if err != nil {
    hs.logger.Error("llm evaluate failed", "error", err)
    fmt.Fprintf(w, "event: error\ndata: {}\n\n") //nolint:errcheck
    w.Flush()                                     //nolint:errcheck
    return
}

if req.AnswerRequested {
    result.Stage = nextStage(req.Stage, req.ActiveStages)
}

done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
```

Note: `req.Stage` and `req.ActiveStages` are captured before the stream writer, so they're safe to use inside the goroutine. Verify they are in the extraction block at the top of `Chat` — they're part of `req` which is captured by value via the closure. This is safe.

- [ ] **Step 5: Run tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/handlers/... -v
```

Expected: all PASS including the 4 new `TestNextStage_*` tests.

- [ ] **Step 6: Build**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no output.

- [ ] **Step 7: Remove the dead stage-advancement clause from `BuildSystemPrompt`**

In `backend/internal/llm/llm.go`, the `answerRequested` branch currently reads:

```go
} else if answerRequested {
    sb.WriteString("\n\nThe user has clicked 'Give me the answer'. Reveal the correct answer for the current stage clearly and completely. Then set stage to the next stage (or \"complete\" if this is the last stage) in your JSON response.")
}
```

The server now overrides `result.Stage` after `Evaluate` returns, so the "Then set stage to..." clause is dead — the LLM's returned stage is ignored for `answer_requested` turns. Remove it to prevent confusion:

```go
} else if answerRequested {
    sb.WriteString("\n\nThe user has clicked 'Give me the answer'. Reveal the correct answer for the current stage clearly and completely.")
}
```

- [ ] **Step 8: Build and run tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... && go test ./... 2>&1 | tail -20
```

Expected: clean build, all tests PASS. The existing `TestBuildSystemPrompt_answer_requested` checks for `"Reveal the correct answer"` which is still present — it should still pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/handlers/chat.go internal/handlers/chat_test.go internal/llm/llm.go
git commit -m "feat: server-side stage advancement for give-me-the-answer button"
```

---

## Task 2: Replace inline markers with typed `Marker` field on `ChatMessage`

**Files:**
- Modify: `backend/internal/llm/llm.go`
- Modify: `backend/internal/llm/evaluation.go`
- Modify: `backend/internal/llm/evaluation_test.go`
- Modify: `backend/internal/types/chat_request.go`
- Modify: `backend/internal/handlers/chat.go`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ChatView.tsx`

**Context:** Currently `[USER REQUESTED HINT]\n` is prepended to message content in `App.tsx` and stripped with a regex in `ChatView.tsx`. The backend stores it in `baseHistory` content. This mixes data and display. The fix: add a `Marker` field to `ChatMessage` on both sides. The evaluator reads it to generate the cap context when building the prompt. Note: the `history` array sent to the LLM interviewer does NOT change — it always uses clean content only. Only `baseHistory` (used by the evaluator) carries markers.

- [ ] **Step 1: Add `Marker string` to `ChatMessage` in `llm.go`**

In `backend/internal/llm/llm.go`, update the `ChatMessage` struct from:

```go
type ChatMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}
```

to:

```go
type ChatMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
    Marker  string `json:"marker,omitempty"` // "hint" | "answer" | ""
}
```

- [ ] **Step 2: Update `BuildEvaluationPrompt` to inject marker context when rendering history**

In `backend/internal/llm/evaluation.go`, find the history rendering loop:

```go
sb.WriteString("Full conversation (note: 'assistant' turns are interviewer coaching prompts, not candidate answers — only score the candidate's own words in 'user' turns):\n")
for _, msg := range history {
    fmt.Fprintf(&sb, "%s: %s\n", msg.Role, msg.Content)
}
```

Replace it with:

```go
sb.WriteString("Full conversation (note: 'assistant' turns are interviewer coaching prompts, not candidate answers — only score the candidate's own words in 'user' turns):\n")
for _, msg := range history {
    content := msg.Content
    if msg.Marker == "hint" {
        content = "[USER REQUESTED HINT]\n" + content
    } else if msg.Marker == "answer" {
        content = "[USER REQUESTED ANSWER]\n" + content
    }
    fmt.Fprintf(&sb, "%s: %s\n", msg.Role, content)
}
```

- [ ] **Step 3: Add test for marker rendering in evaluation prompt**

In `backend/internal/llm/evaluation_test.go`, add a new test after `TestBuildEvaluationPrompt_EmptyHistory`:

```go
func TestBuildEvaluationPrompt_MarkerInjectedIntoHistory(t *testing.T) {
    problem := models.Problem{
        Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
        Title:     "Two Sum",
        TopicTags: []string{"Array"},
    }
    history := []ChatMessage{
        {Role: "user", Content: "I think hash map", Marker: "hint"},
        {Role: "assistant", Content: "Good, explain why"},
        {Role: "user", Content: "To get O(n)", Marker: "answer"},
    }
    prompt := BuildEvaluationPrompt(problem, []string{"pattern"}, history)

    if !strings.Contains(prompt, "[USER REQUESTED HINT]\nI think hash map") {
        t.Error("expected hint marker injected before hint message content")
    }
    if !strings.Contains(prompt, "[USER REQUESTED ANSWER]\nTo get O(n)") {
        t.Error("expected answer marker injected before answer message content")
    }
    if !strings.Contains(prompt, "assistant: Good, explain why") {
        t.Error("expected assistant message without marker")
    }
}
```

- [ ] **Step 4: Run llm tests to verify Step 2 and 3**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/llm/... -v
```

Expected: all PASS including `TestBuildEvaluationPrompt_MarkerInjectedIntoHistory`.

- [ ] **Step 5: Add `Marker string` to `HistoryMessage` in `chat_request.go`**

In `backend/internal/types/chat_request.go`, update `HistoryMessage` from:

```go
type HistoryMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}
```

to:

```go
type HistoryMessage struct {
    Role    string `json:"role"`
    Content string `json:"content"`
    Marker  string `json:"marker,omitempty"`
}
```

- [ ] **Step 6: Add `Marker` validation to `ChatRequest.Validate()` and `HistoryMessage`**

In `backend/internal/types/chat_request.go`, add a whitelist check to `Validate()`. The valid marker values are `""`, `"hint"`, and `"answer"`. Add this block just before the stage validation section:

```go
validMarkers := map[string]bool{"": true, "hint": true, "answer": true}
for i, msg := range r.History {
    if !validMarkers[msg.Marker] {
        errs[fmt.Sprintf("history[%d].marker", i)] = "must be 'hint', 'answer', or omitted"
    }
}
```

- [ ] **Step 7: Update `chat.go` — use `Marker` field, preserve markers in `baseHistory`**

In `backend/internal/handlers/chat.go`, replace the entire `history` and `baseHistory` construction block. Find this section (around lines 34–58):

```go
history := make([]llm.ChatMessage, len(req.History))
for i, h := range req.History {
    history[i] = llm.ChatMessage{Role: h.Role, Content: h.Content}
}

// ... (streamCtx, evalUID setup) ...

baseHistory := make([]llm.ChatMessage, 0, len(history)+1)
baseHistory = append(baseHistory, history...)
userContent := req.Message
if req.HintRequested {
    userContent = "[USER REQUESTED HINT]\n" + userContent
} else if req.AnswerRequested {
    userContent = "[USER REQUESTED ANSWER]\n" + userContent
}
baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: userContent})
```

Replace with:

```go
// history for the LLM interviewer — clean content only, no markers
history := make([]llm.ChatMessage, len(req.History))
for i, h := range req.History {
    history[i] = llm.ChatMessage{Role: h.Role, Content: h.Content}
}

// ... (streamCtx, evalUID setup — leave unchanged) ...

// baseHistory for the evaluator — preserves Marker fields from prior turns
var currentMarker string
if req.HintRequested {
    currentMarker = "hint"
} else if req.AnswerRequested {
    currentMarker = "answer"
}
baseHistory := make([]llm.ChatMessage, 0, len(req.History)+1)
for _, h := range req.History {
    baseHistory = append(baseHistory, llm.ChatMessage{Role: h.Role, Content: h.Content, Marker: h.Marker})
}
baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: req.Message, Marker: currentMarker})
```

The key difference: `baseHistory` is now built from `req.History` (not `history`) so it preserves each message's `Marker`. The current turn's marker is set from the request flags. Content is always clean — no more inline prefix.

- [ ] **Step 8: Build and run all backend tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... && go test ./... 2>&1 | tail -20
```

Expected: clean build, all tests PASS.

- [ ] **Step 9: Add `marker` to `ChatMessage` in `frontend/src/types.ts`**

Update `ChatMessage` from:

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
```

to:

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  marker?: 'hint' | 'answer'
}
```

- [ ] **Step 10: Update `App.tsx` — set `marker` field instead of content prefix**

In `frontend/src/App.tsx`, find `handleSubmit` and replace the `markedContent` / `userMsg` construction:

```typescript
// Remove this:
const markedContent = hintRequested ? `[USER REQUESTED HINT]\n${message}`
  : answerRequested ? `[USER REQUESTED ANSWER]\n${message}`
  : message
const userMsg: ChatMessage = { role: 'user', content: markedContent }
```

Replace with:

```typescript
const userMsg: ChatMessage = {
  role: 'user',
  content: message,
  marker: hintRequested ? 'hint' : answerRequested ? 'answer' : undefined,
}
```

- [ ] **Step 11: Update `ChatView.tsx` — remove regex strip**

In `frontend/src/components/ChatView.tsx`, find the message render line:

```tsx
{msg.role === 'user' ? msg.content.replace(/^\[USER REQUESTED (?:HINT|ANSWER)\]\n/, '') : msg.content}
```

Replace with:

```tsx
{msg.content}
```

- [ ] **Step 12: Frontend type-check**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 13: Commit backend and frontend**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/llm/llm.go internal/llm/evaluation.go internal/llm/evaluation_test.go internal/types/chat_request.go internal/handlers/chat.go
git commit -m "refactor: ChatMessage Marker field replaces inline hint/answer content prefix"

cd /Users/aaronkim/projects/leetgame/frontend
git add src/types.ts src/App.tsx src/components/ChatView.tsx
git commit -m "refactor: ChatMessage marker field replaces inline content prefix and regex strip"
```
