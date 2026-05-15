# SSE Streaming for Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocking `/api/chat` endpoint with SSE streaming so users see LLM tokens appear in real time and the 60s header-timeout is eliminated.

**Architecture:** The `llm.Client` interface gains an `onToken func(string)` callback; the Ollama client switches to `stream: true` and extracts clean message tokens from the streaming JSON via a state machine; the Chat handler uses fasthttp's `SetBodyStreamWriter` to push SSE events (all `c.Context()` calls must happen before the callback); the frontend replaces `sendChat` with a `streamChat` async generator that reads the SSE stream via `fetch` + `ReadableStream`.

**Tech Stack:** Go 1.26, Fiber v2.52.9, fasthttp, React 19, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `internal/llm/llm.go` | Add `onToken func(string)` param to `Client.Evaluate` |
| `internal/claude/claude.go` | Add `onToken` param, ignore it |
| `internal/ollama/ollama.go` | Rewrite: `stream: true`, state machine extraction, 10-min timeout |
| `internal/ollama/ollama_test.go` | Create: unit tests for streaming + state machine |
| `internal/handlers/chat.go` | Rewrite: SSE via `SetBodyStreamWriter` |
| `frontend/src/api.ts` | Replace `sendChat` with `streamChat` async generator |
| `frontend/src/App.tsx` | Add `streamingMessage` state, `streamAbortRef`, `for await` loop |
| `frontend/src/components/ChatView.tsx` | Add streaming bubble, split scroll effects |

---

## Task 1: Update `llm.Client` interface and Claude client

**Files:**
- Modify: `internal/llm/llm.go`
- Modify: `internal/claude/claude.go`

- [ ] **Step 1: Update the `Client` interface in `internal/llm/llm.go`**

Replace the existing `Client` interface with:

```go
type Client interface {
	Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string, onToken func(string)) (EvaluateResponse, error)
}
```

- [ ] **Step 2: Update Claude client signature in `internal/claude/claude.go`**

Change line 30 — only the function signature changes, the body is identical:

```go
func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []llm.ChatMessage, userMessage string, onToken func(string)) (llm.EvaluateResponse, error) {
```

- [ ] **Step 3: Verify compilation (expect Ollama to fail)**

```bash
cd backend && go build ./...
```

Expected: one error about `*OllamaClient` not implementing `llm.Client` — that's correct and is fixed in Task 2. All other packages should compile clean.

- [ ] **Step 4: Commit**

```bash
git add internal/llm/llm.go internal/claude/claude.go
git commit -m "feat: add onToken callback to llm.Client interface"
```

---

## Task 2: Rewrite Ollama client with streaming and state machine

**Files:**
- Modify: `internal/ollama/ollama.go`
- Create: `internal/ollama/ollama_test.go`

- [ ] **Step 1: Write failing tests — create `internal/ollama/ollama_test.go`**

```go
package ollama_test

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/ollama"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// makeSSEServer returns a test HTTP server that streams the given JSON payloads
// as SSE chunks in OpenAI-compatible format, then sends [DONE].
func makeSSEServer(payloads []string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		flusher := w.(http.Flusher)
		for _, p := range payloads {
			fmt.Fprintf(w, "data: %s\n\n", p)
			flusher.Flush()
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
}

// contentChunk builds one OpenAI-compatible streaming chunk with the given content token.
func contentChunk(tok string) string {
	return fmt.Sprintf(`{"choices":[{"delta":{"content":%q,"reasoning":""},"finish_reason":null}]}`, tok)
}

func TestEvaluate_streams_message_tokens(t *testing.T) {
	// LLM streams {"message": "Hello world", "stage": "algorithm"} token by token
	payloads := []string{
		contentChunk(`{"`),
		contentChunk(`message`),
		contentChunk(`": "`),
		contentChunk(`Hello`),
		contentChunk(` world`),
		contentChunk(`", "stage": "algorithm"}`),
	}
	srv := makeSSEServer(payloads)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model")
	problem := models.Problem{ID: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	var received []string
	result, err := client.Evaluate(context.Background(), problem, "algorithm", nil, "use a hash map", func(tok string) {
		received = append(received, tok)
	})

	require.NoError(t, err)
	assert.Equal(t, "Hello world", strings.Join(received, ""), "streamed tokens should be clean message content only")
	assert.Equal(t, "Hello world", result.Message)
	assert.Equal(t, "algorithm", result.Stage)
}

func TestEvaluate_skips_reasoning_tokens(t *testing.T) {
	// Reasoning tokens have empty content and should be ignored
	payloads := []string{
		`{"choices":[{"delta":{"content":"","reasoning":"let me think..."},"finish_reason":null}]}`,
		`{"choices":[{"delta":{"content":"","reasoning":"ok I know"},"finish_reason":null}]}`,
		contentChunk(`{"message": "Hi", "stage": "algorithm"}`),
	}
	srv := makeSSEServer(payloads)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model")
	problem := models.Problem{ID: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	var received []string
	result, err := client.Evaluate(context.Background(), problem, "algorithm", nil, "use a hash map", func(tok string) {
		received = append(received, tok)
	})

	require.NoError(t, err)
	assert.Equal(t, "Hi", strings.Join(received, ""))
	assert.Equal(t, "Hi", result.Message)
	assert.Equal(t, "algorithm", result.Stage)
}

func TestEvaluate_nil_onToken_does_not_panic(t *testing.T) {
	// Claude client passes nil — must not panic
	payloads := []string{
		contentChunk(`{"message": "Good", "stage": "complexity"}`),
	}
	srv := makeSSEServer(payloads)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model")
	problem := models.Problem{ID: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	result, err := client.Evaluate(context.Background(), problem, "complexity", nil, "O(n) time", nil)

	require.NoError(t, err)
	assert.Equal(t, "Good", result.Message)
	assert.Equal(t, "complexity", result.Stage)
}

func TestEvaluate_context_cancellation(t *testing.T) {
	// Server hangs mid-stream — context cancellation should propagate
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher := w.(http.Flusher)
		fmt.Fprintf(w, "data: %s\n\n", contentChunk(`{"message": "`))
		flusher.Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(10 * time.Second):
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	client := ollama.New(srv.URL, "test-model")
	problem := models.Problem{ID: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	_, err := client.Evaluate(ctx, problem, "algorithm", nil, "use a hash map", nil)
	assert.Error(t, err)
}

func TestEvaluate_passes_history_and_system_prompt(t *testing.T) {
	// Verify the request body includes system prompt, history, and user message
	var capturedBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "text/event-stream")
		flusher := w.(http.Flusher)
		fmt.Fprintf(w, "data: %s\n\n", contentChunk(`{"message": "ok", "stage": "algorithm"}`))
		flusher.Flush()
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model")
	problem := models.Problem{ID: uuid.New(), Title: "Two Sum", Description: "find two numbers"}
	history := []llm.ChatMessage{{Role: "user", Content: "prev"}, {Role: "assistant", Content: "resp"}}

	_, err := client.Evaluate(context.Background(), problem, "algorithm", history, "new message", nil)
	require.NoError(t, err)

	body := string(capturedBody)
	assert.Contains(t, body, "Two Sum")
	assert.Contains(t, body, "prev")
	assert.Contains(t, body, "new message")
}
```


- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/ollama/... -v 2>&1 | head -20
```

Expected: compilation error — `*OllamaClient` doesn't implement `llm.Client` yet.

- [ ] **Step 3: Rewrite `internal/ollama/ollama.go`**

Replace the entire file:

```go
package ollama

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"leetgame/internal/llm"
	"leetgame/internal/models"
)

const (
	msgPrefix = `{"message": "`
	endMarker = `", "stage"`
)

type OllamaClient struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

func New(baseURL, model string) *OllamaClient {
	return &OllamaClient{
		baseURL:    baseURL,
		model:      model,
		httpClient: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []llm.ChatMessage, userMessage string, onToken func(string)) (llm.EvaluateResponse, error) {
	systemPrompt := fmt.Sprintf(llm.SystemPromptTemplate, problem.Title, problem.Description, stage)

	messages := make([]map[string]string, 0, len(history)+2)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userMessage})

	body := map[string]any{
		"model":    c.model,
		"messages": messages,
		"stream":   true,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.EvaluateResponse{}, fmt.Errorf("ollama API returned status %d: %s", resp.StatusCode, string(b))
	}

	var fullText strings.Builder
	ex := &extractor{onToken: onToken}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := line[6:]
		if payload == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		tok := chunk.Choices[0].Delta.Content
		if tok == "" {
			continue
		}
		fullText.WriteString(tok)
		ex.add(tok)
	}
	if err := scanner.Err(); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("error reading ollama stream: %w", err)
	}

	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(fullText.String()), &evalResp); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to parse ollama JSON: %w (raw: %s)", err, fullText.String())
	}
	switch evalResp.Stage {
	case "algorithm", "complexity", "complete":
	default:
		return llm.EvaluateResponse{}, fmt.Errorf("ollama returned unknown stage %q", evalResp.Stage)
	}

	return evalResp, nil
}

// extractor pulls the clean message value out of a streaming JSON response.
// The LLM emits {"message": "CONTENT", "stage": "VALUE"} token by token.
// It calls onToken only with characters that belong to CONTENT.
type extractor struct {
	accumulated string
	pending     string // trailing buffer to detect end marker before forwarding
	state       extractState
	onToken     func(string)
}

type extractState int

const (
	stateBefore  extractState = iota // waiting to see the message prefix
	stateMessage                     // inside the message value, forwarding tokens
	stateAfter                       // past the message value, discarding
)

func (e *extractor) add(tok string) {
	e.accumulated += tok
	if e.state == stateAfter {
		return
	}
	if e.state == stateBefore {
		if strings.HasPrefix(e.accumulated, msgPrefix) {
			e.state = stateMessage
			after := e.accumulated[len(msgPrefix):]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
	e.forward(tok)
}

// forward sends tok through the trailing buffer.
// It keeps the last len(endMarker)-1 bytes buffered so the end marker
// is always detected before any part of it is forwarded to onToken.
func (e *extractor) forward(tok string) {
	combined := e.pending + tok
	if idx := strings.Index(combined, endMarker); idx >= 0 {
		if e.onToken != nil && idx > 0 {
			e.onToken(combined[:idx])
		}
		e.state = stateAfter
		e.pending = ""
		return
	}
	safeLen := len(combined) - len(endMarker) + 1
	if safeLen > 0 {
		if e.onToken != nil {
			e.onToken(combined[:safeLen])
		}
		e.pending = combined[safeLen:]
	} else {
		e.pending = combined
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/ollama/... -v
```

Expected:
```
--- PASS: TestEvaluate_streams_message_tokens
--- PASS: TestEvaluate_skips_reasoning_tokens
--- PASS: TestEvaluate_nil_onToken_does_not_panic
--- PASS: TestEvaluate_context_cancellation
--- PASS: TestEvaluate_passes_history_and_system_prompt
PASS
```

- [ ] **Step 5: Verify full build passes**

```bash
cd backend && go build ./...
```

Expected: clean build, no errors.

- [ ] **Step 6: Run all tests**

```bash
cd backend && go test ./...
```

Expected: `ok leetgame/internal/ollama`, `ok leetgame/internal/types`.

- [ ] **Step 7: Commit**

```bash
git add internal/ollama/ollama.go internal/ollama/ollama_test.go
git commit -m "feat: rewrite Ollama client with streaming and JSON extraction state machine"
```

---

## Task 3: Update Chat handler to emit SSE

**Files:**
- Modify: `internal/handlers/chat.go`

- [ ] **Step 1: Rewrite `internal/handlers/chat.go`**

Replace the entire file:

```go
package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"

	"leetgame/internal/llm"
	"leetgame/internal/types"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) Chat(c *fiber.Ctx) error {
	var req types.ChatRequest
	if err := c.BodyParser(&req); err != nil {
		return xerrors.InvalidJSON()
	}
	if errs := req.Validate(); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}

	problem, err := hs.storage.GetProblemByID(c.Context(), req.ProblemID)
	if err != nil {
		return err
	}

	history := make([]llm.ChatMessage, len(req.History))
	for i, h := range req.History {
		history[i] = llm.ChatMessage{Role: h.Role, Content: h.Content}
	}

	// fasthttp forbids accessing RequestCtx from inside SetBodyStreamWriter.
	// Extract everything from c before registering the callback.
	streamCtx, cancelStream := context.WithCancel(context.Background())

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer cancelStream()

		onToken := func(token string) {
			data, _ := json.Marshal(map[string]string{"content": token})
			if _, err := fmt.Fprintf(w, "event: token\ndata: %s\n\n", data); err != nil {
				cancelStream()
				return
			}
			if err := w.Flush(); err != nil {
				cancelStream()
				return
			}
		}

		result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, history, req.Message, onToken)
		if err != nil {
			hs.logger.Error("llm evaluate failed", "error", err)
			fmt.Fprintf(w, "event: error\ndata: {}\n\n") //nolint:errcheck
			w.Flush()                                     //nolint:errcheck
			return
		}

		done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
		fmt.Fprintf(w, "event: done\ndata: %s\n\n", done) //nolint:errcheck
		w.Flush()                                          //nolint:errcheck
	})

	return nil
}
```

- [ ] **Step 2: Verify compilation and tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Smoke test the SSE endpoint**

Start the backend:
```bash
cd backend && go run ./cmd/server
```

In a second terminal, pick any valid problem ID from the DB (e.g. via `psql` or the `/api/problems/random` endpoint), then:

```bash
curl -s -N -X POST http://localhost:42069/api/chat \
  -H "Content-Type: application/json" \
  -d '{"problem_id":"<uuid>","stage":"algorithm","history":[],"message":"I would use a hash map"}'
```

Expected output streams in real time:
```
event: token
data: {"content":"The "}

event: token
data: {"content":"algorithm..."}

event: done
data: {"stage":"algorithm","message":"The algorithm..."}
```

- [ ] **Step 4: Commit**

```bash
git add internal/handlers/chat.go
git commit -m "feat: update chat handler to emit SSE stream"
```

---

## Task 4: Replace `sendChat` with `streamChat` in `frontend/src/api.ts`

**Files:**
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Replace `sendChat` with `streamChat`**

Replace the entire file content with:

```ts
import type { Problem, ChatMessage, Stage, ProblemSearchResponse, ProblemTag } from './types'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch('/api/problems/random')
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function getRandomProblemFiltered(
  q: string,
  difficulty: string,
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(`/api/problems/random?${params.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch filtered random problem: ${res.status}`)
  return res.json()
}

export async function searchProblems(
  q: string,
  difficulty: string,
  tags: string[],
  tagMatch: 'and' | 'or',
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ProblemSearchResponse> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulty) params.set('difficulty', difficulty)
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`/api/problems?${params.toString()}`, { signal })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function getProblemTags(signal?: AbortSignal): Promise<ProblemTag[]> {
  const res = await fetch('/api/problems/tags', { signal })
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`)
  return res.json()
}

export async function* streamChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<
  { type: 'token'; content: string } |
  { type: 'done'; stage: Stage; message: string }
> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_id: problemId, stage, history, message }),
    signal,
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()!
    for (const event of events) {
      const lines = event.trim().split('\n')
      const type = lines.find(l => l.startsWith('event: '))?.slice(7)
      const data = lines.find(l => l.startsWith('data: '))?.slice(6)
      if (!type || !data) continue
      const parsed = JSON.parse(data)
      if (type === 'token') yield { type: 'token', content: parsed.content }
      else if (type === 'done') yield { type: 'done', ...parsed }
    }
  }
}
```

- [ ] **Step 2: Check TypeScript (expect errors about `sendChat` being missing)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors in `App.tsx` about `sendChat` not existing — those are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat: replace sendChat with streamChat async generator"
```

---

## Task 5: Update `App.tsx` for streaming state management

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update the React import to include `useRef`**

Change line 1 from:
```ts
import { useEffect, useState } from 'react'
```
to:
```ts
import { useEffect, useState, useRef } from 'react'
```

- [ ] **Step 2: Update the API import — replace `sendChat` with `streamChat`**

Change the import line that currently reads:
```ts
import { getRandomProblem, getRandomProblemFiltered, searchProblems, sendChat } from './api'
```
to:
```ts
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat } from './api'
```

- [ ] **Step 3: Add streaming state and abort ref**

After the `const [playlistExhausted, setPlaylistExhausted] = useState(false)` line, add:

```ts
const [streamingMessage, setStreamingMessage] = useState('')
const streamAbortRef = useRef<AbortController | null>(null)
```

- [ ] **Step 4: Add stream cancellation effect**

After the `useEffect(() => { void loadRandomProblem() }, [])` line, add:

```ts
useEffect(() => () => {
  streamAbortRef.current?.abort()
}, [problem])
```

- [ ] **Step 5: Replace `handleSubmit`**

Replace the entire `handleSubmit` function (lines 210–226 in the original) with:

```ts
const handleSubmit = async (message: string) => {
  if (!problem) return

  streamAbortRef.current?.abort()
  const controller = new AbortController()
  streamAbortRef.current = controller

  setLoading(true)
  setError(null)
  setStreamingMessage('')

  const userMsg: ChatMessage = { role: 'user', content: message }
  const nextHistory = [...history, userMsg]
  setHistory(nextHistory)

  try {
    let accumulated = ''
    for await (const event of streamChat(problem.id, stage, history, message, controller.signal)) {
      if (event.type === 'token') {
        accumulated += event.content
        setStreamingMessage(accumulated)
      } else if (event.type === 'done') {
        setHistory([...nextHistory, { role: 'assistant', content: event.message }])
        setStage(event.stage)
        setStreamingMessage('')
      }
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    setError('Something went wrong. Please try again.')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 6: Pass `streamingMessage` to `<ChatView>`**

Find the `<ChatView` JSX in the `practiceView` function and add the prop:

```tsx
<ChatView
  history={history}
  stage={stage}
  loading={loading}
  error={error}
  onSubmit={handleSubmit}
  streamingMessage={streamingMessage}
/>
```

- [ ] **Step 7: Check TypeScript (expect one error about ChatView prop)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -10
```

Expected: one error about `streamingMessage` not existing on `ChatView` Props — fixed in Task 6.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add streaming state and AbortController to App"
```

---

## Task 6: Update `ChatView` with streaming bubble and scroll

**Files:**
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Rewrite `frontend/src/components/ChatView.tsx`**

Replace the entire file:

```tsx
import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage } from '../types'
import { cn } from '../lib/utils'

const stageBanner: Record<string, string> = {
  algorithm: 'Describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
  streamingMessage: string
}

export function ChatView({ history, stage, loading, error, onSubmit, streamingMessage }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  useEffect(() => {
    if (streamingMessage) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
    }
  }, [streamingMessage])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div className="w-1/2 flex flex-col min-h-0">
      <div className="px-5 py-3 bg-muted border-b border-border text-sm font-semibold text-foreground">
        {stageBanner[stage]}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {history.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={cn(
              "max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap",
              msg.role === 'user'
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-secondary text-secondary-foreground"
            )}
          >
            {msg.content}
          </div>
        ))}
        {streamingMessage && (
          <div className="self-start bg-secondary text-secondary-foreground max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
            {streamingMessage}
            <span className="animate-pulse ml-0.5">▌</span>
          </div>
        )}
        {error && (
          <div className="self-start text-destructive text-xs">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); handleSubmit() }}
        className="p-4 border-t border-border flex gap-2"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
          placeholder="Describe your approach..."
          disabled={loading}
          rows={3}
          className="flex-1 resize-none px-3 py-2.5 rounded-lg border border-border text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 rounded-lg bg-primary text-primary-foreground border-none font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and test end-to-end**

Make sure the backend is running (`go run ./cmd/server` from `backend/`), then:

```bash
cd frontend && npm run dev
```

Open the app in the browser. Submit a message on any problem. Verify:
1. The streaming bubble appears immediately (within ~2 seconds) and text types out in real time
2. The blinking cursor `▌` appears at the end of the streaming text
3. When the stream ends, the streaming bubble disappears and the full message appears in the history list seamlessly
4. The view auto-scrolls as the bubble grows
5. Clicking "Skip" mid-stream cancels the stream cleanly (no console errors)
6. Navigating to Search and back mid-stream cancels cleanly

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatView.tsx
git commit -m "feat: add streaming bubble and split scroll effects to ChatView"
```
