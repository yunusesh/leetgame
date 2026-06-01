# Pattern Warmup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pattern` stage before `algorithm` where the user guesses the algorithm pattern before describing their approach.

**Architecture:** A new `pattern` stage is inserted at the start of every practice session. The existing three-stage flow (algorithm → complexity → complete) is unchanged; pattern simply precedes it. The backend validates `pattern` as a new legal stage value, the LLM system prompt gains a Stage 0 section describing pattern evaluation rules, and the frontend starts each problem at the pattern stage instead of algorithm.

**Tech Stack:** Go + Fiber v2 (backend), React 19 + TypeScript (frontend), Ollama LLM

---

## File Map

**Modified:**
- `backend/internal/types/chat_request.go` — add `"pattern"` to valid stages set
- `backend/internal/types/chat_request_test.go` — add test for pattern stage validity
- `backend/internal/llm/llm.go` — add Stage 0 block to system prompt, add `pattern` to the stage constraint in JSON instruction
- `backend/internal/ollama/ollama.go` — add `"pattern"` to the valid-stage switch; also fix pre-existing compile error (tests call `New` with 2 args, constructor takes 3)
- `backend/internal/ollama/ollama_test.go` — fix 2-arg `ollama.New()` calls to pass empty string for `apiKey` (pre-existing compile error); add a test for pattern stage pass-through
- `frontend/src/types.ts` — add `'pattern'` to `Stage` union type
- `frontend/src/components/ChatView.tsx` — add `pattern` entry to `stageBanner`
- `frontend/src/App.tsx` — change initial stage and reset stage to `'pattern'`

---

## Task 1: Backend — add `pattern` to validation and stage switch

**Files:**
- Modify: `backend/internal/types/chat_request.go`
- Modify: `backend/internal/types/chat_request_test.go`
- Modify: `backend/internal/ollama/ollama.go`
- Modify: `backend/internal/ollama/ollama_test.go`

Context: `chat_request.go` validates incoming stages. `ollama.go` validates the stage value returned by the LLM. Both need to accept `"pattern"`. There is also a pre-existing compile error in `ollama_test.go`: `ollama.New` was called with 2 arguments (baseURL, model) but the constructor signature requires 3 (baseURL, model, apiKey). This means `go test ./internal/ollama/...` currently fails to compile. Fix it as part of this task.

- [ ] **Step 1: Verify the pre-existing compile error**

```bash
cd backend && go test ./internal/ollama/... 2>&1
```

Expected: compile error mentioning "too few arguments in call to ollama.New".

- [ ] **Step 2: Write failing test for pattern stage validation**

In `backend/internal/types/chat_request_test.go`, add after the last test:

```go
func TestChatRequest_Validate_pattern_stage_valid(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.New(),
		Stage:     "pattern",
		History:   []types.HistoryMessage{},
		Message:   "sliding window",
	}
	assert.Empty(t, req.Validate())
}
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd backend && go test ./internal/types/... -run TestChatRequest_Validate_pattern_stage_valid -v 2>&1
```

Expected: FAIL — `stage` error present.

- [ ] **Step 4: Add `pattern` to valid stages in `chat_request.go`**

In `backend/internal/types/chat_request.go`, change line 30:

```go
validStages := map[string]bool{"algorithm": true, "complexity": true}
```

To:

```go
validStages := map[string]bool{"pattern": true, "algorithm": true, "complexity": true}
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd backend && go test ./internal/types/... -v 2>&1
```

Expected: all tests PASS including the new one.

- [ ] **Step 6: Fix the ollama_test.go compile error**

In `backend/internal/ollama/ollama_test.go`, all calls to `ollama.New` pass only 2 arguments. The constructor requires 3 (`baseURL, model, apiKey`). Replace every occurrence of `ollama.New(srv.URL, "test-model")` with `ollama.New(srv.URL, "test-model", "")`.

After the fix, the file should have no 2-argument calls to `ollama.New`.

Verify with:

```bash
grep -n 'ollama.New' backend/internal/ollama/ollama_test.go
```

Expected: every line shows 3 arguments.

- [ ] **Step 7: Add pattern stage test to ollama_test.go**

In `backend/internal/ollama/ollama_test.go`, add after the last test:

```go
func TestEvaluate_pattern_stage_returned(t *testing.T) {
	// LLM returns pattern stage (staying on pattern after incorrect guess)
	tokens := []string{`{"message": "Think about a subarray technique", "stage": "pattern"}`}
	srv := makeOllamaServer(tokens)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Max Subarray", Description: "find the contiguous subarray"}

	result, err := client.Evaluate(context.Background(), problem, "pattern", nil, "binary search maybe?", nil)

	require.NoError(t, err)
	assert.Equal(t, "Think about a subarray technique", result.Message)
	assert.Equal(t, "pattern", result.Stage)
}
```

- [ ] **Step 8: Add `pattern` to the valid-stage switch in `ollama.go`**

In `backend/internal/ollama/ollama.go`, change line 123:

```go
case "algorithm", "complexity", "complete":
```

To:

```go
case "pattern", "algorithm", "complexity", "complete":
```

- [ ] **Step 9: Run all ollama tests**

```bash
cd backend && go test ./internal/ollama/... -v 2>&1
```

Expected: all tests PASS, including `TestEvaluate_pattern_stage_returned`.

- [ ] **Step 10: Run all backend tests**

```bash
cd backend && go test ./... 2>&1
```

Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/internal/types/chat_request.go backend/internal/types/chat_request_test.go backend/internal/ollama/ollama.go backend/internal/ollama/ollama_test.go
git commit -m "feat: add pattern stage to backend validation and ollama stage switch"
```

---

## Task 2: Backend — update LLM system prompt for pattern stage

**Files:**
- Modify: `backend/internal/llm/llm.go`

Context: The system prompt is a `const` string with `%s` format directives for title, description, and current stage. It currently describes Stage 1 (algorithm) and Stage 2 (complexity). We need to add Stage 0 (pattern) before the existing stages and update the valid stage values in the JSON constraint line.

- [ ] **Step 1: Write a failing test for the updated system prompt**

In `backend/internal/llm/llm.go`'s package, there are no existing tests. Create `backend/internal/llm/llm_test.go`:

```go
package llm_test

import (
	"fmt"
	"testing"

	"leetgame/internal/llm"

	"github.com/stretchr/testify/assert"
)

func TestSystemPromptTemplate_contains_pattern_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "pattern")
	assert.Contains(t, formatted, "Stage 0")
	assert.Contains(t, formatted, `"pattern"`)
	assert.Contains(t, formatted, "pattern|algorithm|complexity|complete")
}

func TestSystemPromptTemplate_contains_algorithm_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "algorithm")
	assert.Contains(t, formatted, "Stage 1")
	assert.Contains(t, formatted, "algorithm")
}

func TestSystemPromptTemplate_contains_complexity_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "complexity")
	assert.Contains(t, formatted, "Stage 2")
	assert.Contains(t, formatted, "complexity")
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/llm/... -v 2>&1
```

Expected: `TestSystemPromptTemplate_contains_pattern_stage` FAILS (no "Stage 0" or "pattern|algorithm|complexity|complete" in prompt). The other two may pass already.

- [ ] **Step 3: Replace `SystemPromptTemplate` in `backend/internal/llm/llm.go`**

Replace the entire `SystemPromptTemplate` constant:

```go
const SystemPromptTemplate = `You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.

Problem Title: %s
Problem Description:
%s

Evaluate the candidate's approach in three stages. The current stage is: %s

Stage 0 — Pattern (stage = "pattern"):
The candidate must identify the algorithm pattern or technique this problem uses (e.g. "sliding window", "BFS/DFS", "dynamic programming", "two pointers", "binary search", "union find", "backtracking", "greedy", "heap/priority queue", "trie").
- If the guess is correct (matches the core pattern for this problem): briefly confirm and set stage to "algorithm".
- If the guess is incorrect or too vague: ask exactly ONE Socratic question to nudge them toward the right pattern. Keep stage as "pattern". Never reveal the pattern directly.

Stage 1 — Algorithm (stage = "algorithm"):
Assess whether the described algorithm is correct and would solve the problem efficiently.
- If incorrect or incomplete: ask exactly ONE focused Socratic question to guide their thinking. Never reveal the answer.
- If correct: briefly acknowledge it and set stage to "complexity" in your response.

Stage 2 — Complexity (stage = "complexity"):
Ask the candidate to state both time complexity and space complexity.
- If incorrect: ask one focused guiding question. Keep stage as "complexity".
- If both time and space complexity are correct: confirm and set stage to "complete".

CRITICAL: Your entire response must be ONLY the following JSON object — no explanation, no markdown, no text before or after, no code fences:
{"message": "<your response to the candidate>", "stage": "<pattern|algorithm|complexity|complete>"}

Any response that is not pure JSON will be rejected. Do not write anything except the JSON object.`
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && go test ./internal/llm/... -v 2>&1
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && go test ./... 2>&1
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/llm/llm.go backend/internal/llm/llm_test.go
git commit -m "feat: add pattern stage to LLM system prompt"
```

---

## Task 3: Frontend — wire up pattern stage

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/ChatView.tsx`
- Modify: `frontend/src/App.tsx`

Context: The frontend has a `Stage` type and a `stageBanner` map that drives the prompt shown to the user. The initial stage is set in `App.tsx` state and reset in `resetPracticeState`. All three need to know about `pattern`.

- [ ] **Step 1: Add `pattern` to Stage type in `frontend/src/types.ts`**

Change line 28:

```ts
export type Stage = 'algorithm' | 'complexity' | 'complete'
```

To:

```ts
export type Stage = 'pattern' | 'algorithm' | 'complexity' | 'complete'
```

- [ ] **Step 2: Add pattern banner to `frontend/src/components/ChatView.tsx`**

The `stageBanner` object currently has entries for `algorithm` and `complexity`. It is keyed as `Record<string, string>` so TypeScript won't error on a missing key — but there will be no banner shown for the pattern stage unless we add it.

Change:

```tsx
const stageBanner: Record<string, string> = {
  algorithm: 'Describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}
```

To:

```tsx
const stageBanner: Record<string, string> = {
  pattern: 'What pattern does this problem use?',
  algorithm: 'Pattern ✓ — Now describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}
```

Note: the algorithm banner is updated from "Describe your algorithm" to "Pattern ✓ — Now describe your algorithm" to reflect that the pattern step was already passed.

- [ ] **Step 3: Set initial stage to `pattern` in `frontend/src/App.tsx`**

Find the stage state initializer (currently `useState<Stage>('algorithm')`) and change it:

```tsx
const [stage, setStage] = useState<Stage>('pattern')
```

- [ ] **Step 4: Reset to `pattern` in `resetPracticeState`**

Find `resetPracticeState` in `App.tsx` (currently sets stage to `'algorithm'`):

```tsx
const resetPracticeState = () => {
  setHistory([])
  setStage('algorithm')
  setStreamingMessage('')
}
```

Change to:

```tsx
const resetPracticeState = () => {
  setHistory([])
  setStage('pattern')
  setStreamingMessage('')
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/ChatView.tsx frontend/src/App.tsx
git commit -m "feat: add pattern stage to frontend — initial stage and chat banner"
```
