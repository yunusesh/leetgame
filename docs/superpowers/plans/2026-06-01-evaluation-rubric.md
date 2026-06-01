# Evaluation Rubric & Hint/Answer Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vague evaluation rubric with stage-specific anchored scoring, and add "Give me a hint" / "Give me the answer" buttons that inject explicit signals into the evaluation history.

**Architecture:** Four tasks, two independent groups. Task 1 (rubric) ships on its own — it only changes `BuildEvaluationPrompt`. Tasks 2–4 (buttons) are full-stack and depend on each other: ChatRequest gains two bool fields, `BuildSystemPrompt` and the `Client` interface gain two bool params, the chat handler threads them through, and the frontend adds two buttons that send a pre-filled message + flag.

**Tech Stack:** Go (`internal/llm`, `internal/types`, `internal/handlers`, `internal/claude`, `internal/ollama`), TypeScript/React (`frontend/src`).

---

## File Map

- **Modify:** `backend/internal/llm/evaluation.go` — replace rubric in `BuildEvaluationPrompt`
- **Modify:** `backend/internal/llm/evaluation_test.go` — update assertions for new rubric text
- **Modify:** `backend/internal/llm/llm.go` — add `hintRequested, answerRequested bool` to `BuildSystemPrompt` and `Client.Evaluate`
- **Modify:** `backend/internal/llm/llm_test.go` — add tests for hint/answer instructions; update all `BuildSystemPrompt` calls to pass two extra `false` args
- **Modify:** `backend/internal/types/chat_request.go` — add `HintRequested bool`, `AnswerRequested bool`
- **Modify:** `backend/internal/claude/claude.go` — update `Evaluate` signature, pass flags to `BuildSystemPrompt`
- **Modify:** `backend/internal/ollama/ollama.go` — update `Evaluate` signature, pass flags to `BuildSystemPrompt`
- **Modify:** `backend/internal/handlers/chat.go` — thread flags through to `Evaluate`; inject marker into `baseHistory`
- **Modify:** `frontend/src/api.ts` — add `hintRequested`, `answerRequested` params to `streamChat`
- **Modify:** `frontend/src/components/ChatView.tsx` — add `onHint`, `onAnswer` props and buttons
- **Modify:** `frontend/src/App.tsx` — add `handleHint`/`handleAnswer`, pass to `ChatView`

---

## Task 1: Stage-specific rubric in `BuildEvaluationPrompt`

**Files:**
- Modify: `backend/internal/llm/evaluation.go`
- Modify: `backend/internal/llm/evaluation_test.go`

- [ ] **Step 1: Run existing evaluation tests to get a green baseline**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/llm/... -v
```

Expected: all tests PASS.

- [ ] **Step 2: Replace the rubric section in `BuildEvaluationPrompt`**

Open `backend/internal/llm/evaluation.go`. The current rubric is on lines 38–40:

```go
sb.WriteString("\nScore the candidate's demonstrated understanding for each (topic, stage) pair that was actually tested.")
sb.WriteString(" Only include pairs from the problem's tags × active stages.")
sb.WriteString(" Score 0.0 = no understanding or completely wrong, 1.0 = correct and clearly articulated without hints.\n\n")
```

Replace those three lines with:

```go
sb.WriteString("\nScore the candidate's demonstrated understanding for each (topic, stage) pair that was actually tested.")
sb.WriteString(" Only include pairs from the problem's tags × active stages.\n\n")
sb.WriteString("Use the stage-specific anchors below. Pick the anchor that best fits — do not average or interpolate.\n\n")
sb.WriteString("**pattern, brute_force, algorithm** — correctness and depth of explanation:\n")
sb.WriteString("  0.0 — Nothing correct, completely wrong, or did not engage with this stage\n")
sb.WriteString("  0.2 — Vague or surface answer with no real substance (e.g. named a concept without explaining it)\n")
sb.WriteString("  0.4 — Partial understanding: some correct ideas but significant gaps or wrong reasoning\n")
sb.WriteString("  0.6 — Correct on the core idea but missed a key detail or nuance\n")
sb.WriteString("  0.8 — Correct and well-reasoned, covered the key points\n")
sb.WriteString("  1.0 — Thorough and accurate with clear reasoning and no meaningful gaps\n\n")
sb.WriteString("**edge_cases** — coverage and specificity:\n")
sb.WriteString("  First determine the key edge cases for this specific problem.\n")
sb.WriteString("  0.0 — Identified no relevant edge cases\n")
sb.WriteString("  0.2 — Only named generic cases not specific to this problem (e.g. 'null input' where irrelevant)\n")
sb.WriteString("  0.4 — Identified some cases but missed the most important one(s) for this problem\n")
sb.WriteString("  0.6 — Identified the key cases but described them imprecisely or missed a minor one\n")
sb.WriteString("  0.8 — Identified all key cases correctly, minor wording imprecision\n")
sb.WriteString("  1.0 — Identified all key cases clearly and correctly\n\n")
sb.WriteString("**tc_sc** — both time and space complexity with explanation:\n")
sb.WriteString("  0.0 — Both wrong\n")
sb.WriteString("  0.5 — One correct, one wrong\n")
sb.WriteString("  0.7 — Both correct, explanation vague or incomplete\n")
sb.WriteString("  1.0 — Both correct with clear reasoning (e.g. 'O(n) because we iterate once, O(1) because no extra space')\n\n")
sb.WriteString("**Reveal cap:** If the interviewer stated an answer directly (not a Socratic question, but an outright explanation or reveal) without the user requesting it, cap that stage's score at 0.2 regardless of the user's response.\n\n")
sb.WriteString("**Hint cap:** If you see '[USER REQUESTED HINT]' in the user's message for a stage, the score for that stage cannot exceed 0.6.\n\n")
sb.WriteString("**Answer cap:** If you see '[USER REQUESTED ANSWER]' in the user's message for a stage, the score for that stage cannot exceed 0.2.\n\n")
sb.WriteString("Calibration: most sessions should score in the 0.2–0.6 range. Reserve 0.8–1.0 for genuinely strong, unprompted answers.\n\n")
```

- [ ] **Step 3: Update `evaluation_test.go` — replace the `"Score 0.0"` check and add rubric checks**

The existing test `TestBuildEvaluationPrompt` checks for `{"scores": [...]}` but does not check rubric content. Add these checks to the `checks` slice in that test:

```go
{"contains pattern rubric", "pattern, brute_force, algorithm"},
{"contains edge_cases rubric", "edge_cases"},
{"contains tc_sc rubric", "tc_sc"},
{"contains reveal cap", "Reveal cap"},
{"contains hint cap", "USER REQUESTED HINT"},
{"contains answer cap", "USER REQUESTED ANSWER"},
{"contains calibration note", "Calibration"},
```

The full updated `checks` slice in `TestBuildEvaluationPrompt` should be:

```go
checks := []struct {
    name    string
    contain string
}{
    {"contains problem title", "Two Sum"},
    {"contains topic tags", "Array"},
    {"contains topic tags 2", "Hash Table"},
    {"contains active stages", "pattern"},
    {"contains active stages 2", "tc_sc"},
    {"contains user message", "I think we use a hash map"},
    {"contains assistant message", "Good, can you explain why?"},
    {"contains second user message", "To achieve O(n) lookup"},
    {"contains JSON instruction", `"scores"`},
    {"contains pattern rubric", "pattern, brute_force, algorithm"},
    {"contains edge_cases rubric", "edge_cases"},
    {"contains tc_sc rubric", "tc_sc"},
    {"contains reveal cap", "Reveal cap"},
    {"contains hint cap", "USER REQUESTED HINT"},
    {"contains answer cap", "USER REQUESTED ANSWER"},
    {"contains calibration note", "Calibration"},
}
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/llm/... -v
```

Expected: all tests PASS including the new rubric checks.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/llm/evaluation.go internal/llm/evaluation_test.go
git commit -m "feat: stage-specific evaluation rubric with anchored scoring"
```

---

## Task 2: Add hint/answer flags to `BuildSystemPrompt`, `Client` interface, and `ChatRequest`

**Files:**
- Modify: `backend/internal/llm/llm.go`
- Modify: `backend/internal/llm/llm_test.go`
- Modify: `backend/internal/types/chat_request.go`
- Modify: `backend/internal/claude/claude.go`
- Modify: `backend/internal/ollama/ollama.go`

- [ ] **Step 1: Add `hintRequested, answerRequested bool` to `BuildSystemPrompt`**

In `backend/internal/llm/llm.go`, change the signature of `BuildSystemPrompt` from:

```go
func BuildSystemPrompt(title, description, stage string, activeStages []string) string {
```

to:

```go
func BuildSystemPrompt(title, description, stage string, activeStages []string, hintRequested, answerRequested bool) string {
```

Then at the end of the function body, just before the final `return sb.String()`, add:

```go
if hintRequested {
    sb.WriteString("\n\nThe user has clicked 'Give me a hint'. Give a targeted hint that moves them toward the answer without fully revealing it. One sentence maximum.")
}
if answerRequested {
    sb.WriteString("\n\nThe user has clicked 'Give me the answer'. Reveal the correct answer for the current stage clearly and completely. Then set stage to the next stage (or \"complete\" if this is the last stage) in your JSON response.")
}
```

- [ ] **Step 2: Add `hintRequested, answerRequested bool` to the `Client` interface**

In `backend/internal/llm/llm.go`, change `Client` from:

```go
type Client interface {
    Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, onToken func(string)) (EvaluateResponse, error)
}
```

to:

```go
type Client interface {
    Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (EvaluateResponse, error)
}
```

- [ ] **Step 3: Update `claude.go` `Evaluate` to match the new interface**

In `backend/internal/claude/claude.go`, change the function signature from:

```go
func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, onToken func(string)) (llm.EvaluateResponse, error) {
    systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages)
```

to:

```go
func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (llm.EvaluateResponse, error) {
    systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages, hintRequested, answerRequested)
```

- [ ] **Step 4: Update `ollama.go` `Evaluate` to match the new interface**

In `backend/internal/ollama/ollama.go`, change the function signature from:

```go
func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, onToken func(string)) (llm.EvaluateResponse, error) {
    systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages)
```

to:

```go
func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (llm.EvaluateResponse, error) {
    systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages, hintRequested, answerRequested)
```

- [ ] **Step 5: Add `HintRequested` and `AnswerRequested` to `ChatRequest`**

In `backend/internal/types/chat_request.go`, add two fields to the `ChatRequest` struct:

```go
type ChatRequest struct {
    ProblemID       uuid.UUID        `json:"problem_id"`
    Stage           string           `json:"stage"`
    ActiveStages    []string         `json:"active_stages"`
    History         []HistoryMessage `json:"history"`
    Message         string           `json:"message"`
    HintRequested   bool             `json:"hint_requested"`
    AnswerRequested bool             `json:"answer_requested"`
}
```

No validation changes needed — both fields are optional booleans that default to `false`.

- [ ] **Step 6: Update `llm_test.go` — fix `BuildSystemPrompt` call sites and add hint/answer tests**

All existing calls in `backend/internal/llm/llm_test.go` use 4 arguments. Add `false, false` to each:

```go
// TestBuildSystemPrompt_contains_current_stage
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false)

// TestBuildSystemPrompt_contains_problem_title
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false)

// TestBuildSystemPrompt_lists_only_active_stages
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "tc_sc"}, false, false)

// TestBuildSystemPrompt_success_stage_is_complete_for_last
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "tc_sc", []string{"pattern", "tc_sc"}, false, false)

// TestBuildSystemPrompt_empty_active_stages_does_not_panic
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{}, false, false)
```

Then add two new tests at the bottom of `llm_test.go`:

```go
func TestBuildSystemPrompt_hint_requested(t *testing.T) {
    prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern"}, true, false)
    if !strings.Contains(prompt, "Give a targeted hint") {
        t.Error("expected hint instruction in prompt when hintRequested=true")
    }
}

func TestBuildSystemPrompt_answer_requested(t *testing.T) {
    prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern"}, false, true)
    if !strings.Contains(prompt, "Reveal the correct answer") {
        t.Error("expected answer instruction in prompt when answerRequested=true")
    }
}
```

- [ ] **Step 7: Build to confirm no compilation errors**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 8: Run tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/llm/... ./internal/types/... -v
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/llm/llm.go internal/llm/llm_test.go internal/types/chat_request.go internal/claude/claude.go internal/ollama/ollama.go
git commit -m "feat: add hint/answer flags to BuildSystemPrompt, Client interface, and ChatRequest"
```

---

## Task 3: Wire hint/answer flags through the chat handler

**Files:**
- Modify: `backend/internal/handlers/chat.go`

- [ ] **Step 1: Thread flags to `llmClient.Evaluate` and inject markers into `baseHistory`**

In `backend/internal/handlers/chat.go`, find the `baseHistory` construction block (around line 50):

```go
baseHistory := make([]llm.ChatMessage, 0, len(history)+1)
baseHistory = append(baseHistory, history...)
baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: req.Message})
```

Replace it with:

```go
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

Then find the `llmClient.Evaluate` call inside the stream writer (around line 73):

```go
result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, onToken)
```

Replace it with:

```go
result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, req.HintRequested, req.AnswerRequested, onToken)
```

Note: `history` (the clean prior conversation) is passed to the interviewer LLM unchanged. Only `baseHistory` (used for evaluation) gets the marker prefix.

- [ ] **Step 2: Build**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 3: Run all backend tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./... -v 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/handlers/chat.go
git commit -m "feat: thread hint/answer flags through chat handler to LLM and evaluator"
```

---

## Task 4: Frontend — hint/answer buttons in ChatView

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/ChatView.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add `hintRequested` and `answerRequested` params to `streamChat` in `api.ts`**

In `frontend/src/api.ts`, change the `streamChat` signature from:

```typescript
export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  signal?: AbortSignal,
):
```

to:

```typescript
export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  signal?: AbortSignal,
):
```

And update the `body` in the fetch call from:

```typescript
body: JSON.stringify({ problem_id: problemId, stage, active_stages: activeStages, history, message }),
```

to:

```typescript
body: JSON.stringify({ problem_id: problemId, stage, active_stages: activeStages, history, message, hint_requested: hintRequested, answer_requested: answerRequested }),
```

- [ ] **Step 2: Add `onHint` and `onAnswer` props to `ChatView`**

In `frontend/src/components/ChatView.tsx`, add two props to the `Props` interface:

```typescript
interface Props {
  history: ChatMessage[]
  stage: Stage
  sessionActiveStages: ActiveStage[]
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
  streamingMessage: string
  onNext?: () => void
  onSmartPractice?: () => void
  onRandom?: () => void
  onBack?: () => void
  onHint?: () => void
  onAnswer?: () => void
}
```

Update the destructured props in the function signature:

```typescript
export function ChatView({ history, stage, sessionActiveStages, loading, error, onSubmit, streamingMessage, onNext, onSmartPractice, onRandom, onBack, onHint, onAnswer }: Props) {
```

Then inside the `form` (not the `complete` section), add the hint/answer buttons above the `Send` button row. Find this block:

```tsx
<form
  onSubmit={e => { e.preventDefault(); handleSubmit() }}
  className="p-4 border-t border-border flex gap-2"
>
  <div className="flex-1 flex flex-col gap-1">
    <Textarea ... />
    {queue.length > 0 && ( ... )}
  </div>
  <Button type="submit" disabled={!input.trim()}>Send</Button>
</form>
```

Replace it with:

```tsx
<form
  onSubmit={e => { e.preventDefault(); handleSubmit() }}
  className="p-4 border-t border-border flex flex-col gap-2"
>
  <div className="flex gap-2">
    <div className="flex-1 flex flex-col gap-1">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
        placeholder={stagePlaceholder[stage as ActiveStage] ?? 'Describe your approach…'}
        rows={3}
        className="resize-none font-sans"
      />
      {queue.length > 0 && (
        <div className="flex flex-col gap-1 px-1">
          {queue.map((msg, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="shrink-0 mt-0.5 opacity-50">{i + 1}.</span>
              <span className="flex-1 truncate">{msg}</span>
              <button
                type="button"
                onClick={() => setQueue(q => q.filter((_, j) => j !== i))}
                className="shrink-0 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity"
                aria-label="Cancel queued message"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    <Button type="submit" disabled={!input.trim()}>Send</Button>
  </div>
  {(onHint || onAnswer) && (
    <div className="flex gap-2">
      {onHint && (
        <Button type="button" variant="outline" size="sm" onClick={onHint} disabled={loading}>
          Give me a hint
        </Button>
      )}
      {onAnswer && (
        <Button type="button" variant="outline" size="sm" onClick={onAnswer} disabled={loading}>
          Give me the answer
        </Button>
      )}
    </div>
  )}
</form>
```

- [ ] **Step 3: Update `App.tsx` — update `handleSubmit`, add `handleHint`/`handleAnswer`, pass to `ChatView`**

In `frontend/src/App.tsx`, change `handleSubmit` from:

```typescript
const handleSubmit = async (message: string) => {
```

to:

```typescript
const handleSubmit = async (message: string, hintRequested = false, answerRequested = false) => {
```

And update the `streamChat` call from:

```typescript
for await (const event of streamChat(problem.id, stage, sessionActiveStages, history, message, controller.signal)) {
```

to:

```typescript
for await (const event of streamChat(problem.id, stage, sessionActiveStages, history, message, hintRequested, answerRequested, controller.signal)) {
```

Then find where `ChatView` is rendered (around line 429) and add the two new props:

```tsx
<ChatView
  history={history}
  stage={stage}
  sessionActiveStages={sessionActiveStages}
  loading={loading}
  error={error}
  onSubmit={handleSubmit}
  streamingMessage={streamingMessage}
  onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
  onSmartPractice={stage === 'complete' && !!session ? () => void loadSmartPracticeProblem() : undefined}
  onRandom={stage === 'complete' && problemSource === 'search' ? () => void loadRandomNextProblem() : undefined}
  onBack={stage === 'complete' && canGoBack ? goBack : undefined}
  onHint={stage !== 'complete' ? () => void handleSubmit('Give me a hint', true, false) : undefined}
  onAnswer={stage !== 'complete' ? () => void handleSubmit('Give me the answer', false, true) : undefined}
/>
```

- [ ] **Step 4: Type-check the frontend**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and test manually**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npm run dev
```

Open the app, start a practice session, and verify:
1. "Give me a hint" and "Give me the answer" buttons appear below the textarea
2. Clicking "Give me a hint" sends "Give me a hint" as a user message and the LLM responds with a hint (not the full answer)
3. Clicking "Give me the answer" sends "Give me the answer" as a user message and the LLM reveals the answer and advances to the next stage
4. Buttons disappear when stage is `complete`

- [ ] **Step 6: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/frontend
git add src/api.ts src/components/ChatView.tsx src/App.tsx
git commit -m "feat: add Give me a hint and Give me the answer buttons to chat UI"
```
