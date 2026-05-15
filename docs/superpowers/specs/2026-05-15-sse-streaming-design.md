# SSE Streaming for Chat

**Date:** 2026-05-15
**Status:** Approved

## Problem

The Ollama client uses `stream: false`, which means Ollama holds the HTTP connection open until the entire response is generated before sending back even the response headers. With a 60s `http.Client` timeout and a 36B local model, requests time out before headers arrive. Additionally, users see no feedback during generation.

## Goal

Stream LLM response tokens to the browser in real time. Users see the assistant message being typed out as it generates. The timeout issue is resolved because Ollama sends headers + the first chunk immediately when `stream: true`.

## Architecture

### Interface Change: `internal/llm/llm.go`

Add `onToken func(string)` to `Client.Evaluate`:

```go
type Client interface {
    Evaluate(
        ctx context.Context,
        problem models.Problem,
        stage string,
        history []ChatMessage,
        userMessage string,
        onToken func(string),
    ) (EvaluateResponse, error)
}
```

`onToken` is called for each clean message character chunk as the model generates. It fires zero times for clients that don't support streaming (Claude). The method still returns the full `EvaluateResponse` when done.

### Ollama Client: `internal/ollama/ollama.go`

- Switch to `stream: true`
- Read OpenAI-compatible SSE chunks line by line
- Extract `choices[0].delta.content`; skip empty chunks and reasoning tokens
- Run a state machine over accumulated content to extract just the message value:
  - `BEFORE_PREFIX`: buffer until accumulated text starts with `{"message": "`
  - `IN_MESSAGE`: forward tokens to `onToken`, but maintain a trailing buffer of `len(endMarker)-1` chars (`endMarker = ", \"stage\""`) so the end marker is detected before it reaches the frontend
  - `AFTER_MESSAGE`: discard remaining tokens
- On `[DONE]`: parse the full accumulated text as JSON, return `EvaluateResponse`
- Replace 60s `http.Client` timeout with a large value (10 minutes); headers arrive within seconds now

### Handler: `internal/handlers/chat.go`

**Important constraint:** fasthttp explicitly forbids accessing `RequestCtx` (i.e. `c` or `c.Context()`) from inside the `SetBodyStreamWriter` callback. All request parsing, storage calls, and context extraction must happen before the callback is registered.

Pattern:
1. Parse request, validate, fetch problem from storage — all using `c.Context()` normally
2. Create `streamCtx, cancelStream := context.WithCancel(context.Background())`
3. Set SSE response headers via `c.Set()`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
4. Call `c.Context().SetBodyStreamWriter(func(w *bufio.Writer))` — inside the callback, use only `streamCtx` and local variables; never `c` or `c.Context()`
5. Inside the callback:
   - `onToken` writes `event: token\ndata: {"content":"<token>"}\n\n` then calls `w.Flush()`; on flush error, calls `cancelStream()` and returns — this propagates client disconnect to the Ollama HTTP call
   - Call `hs.llmClient.Evaluate(streamCtx, ...)` 
   - On success, write `event: done\ndata: {"stage":"...","message":"..."}\n\n`
   - On error, write `event: error\ndata: {}\n\n`
   - `defer cancelStream()` at top of callback

Token data is JSON-encoded so newlines, quotes, and special characters in LLM output are safe.

### Claude Client: `internal/claude/claude.go`

Add `onToken func(string)` to the method signature; ignore it. Behavior is unchanged — batch response, no streaming.

### Types: `internal/types/`

No changes. The HTTP request body (`ChatRequest`) is identical. The SSE stream replaces `ChatResponse` on the wire, but the struct stays for the `done` event payload.

---

### Frontend: `frontend/src/api.ts`

Replace `sendChat` with `streamChat`, an async generator:

```ts
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

### Frontend: `frontend/src/App.tsx`

- Add `streamingMessage: string` state (empty string = not streaming)
- Add `streamAbortRef = useRef<AbortController | null>(null)` to track the active stream
- Replace `sendChat` call with `for await` over `streamChat`:
  - Before starting, cancel any previous stream: `streamAbortRef.current?.abort()`; create a new `AbortController` and store it in the ref; pass its `signal` to `streamChat`
  - `token` events: append content to `streamingMessage`
  - `done` event: push complete message into `history`, update `stage`, clear `streamingMessage`
  - On catch: ignore `AbortError` (user navigated away); set error state for other failures
- Cancel the stream on problem change: `useEffect(() => () => streamAbortRef.current?.abort(), [problem])`
- Pass `streamingMessage` as a new prop to `ChatView`

### Frontend: `frontend/src/components/ChatView.tsx`

- Add `streamingMessage: string` prop
- When non-empty, render a streaming assistant bubble below the history list:
  ```tsx
  <div className="self-start bg-secondary ... whitespace-pre-wrap">
    {streamingMessage}
    <span className="animate-pulse ml-0.5">▌</span>
  </div>
  ```
- Remove "Thinking..." indicator — the streaming bubble is the feedback
- `loading` prop remains to disable the input while streaming
- **Auto-scroll fix:** split the scroll effect into two: one on `[history]` with `behavior: 'smooth'` (for new complete messages), and a separate one on `[streamingMessage]` with `behavior: 'instant'` (for streaming updates). Using `'smooth'` on every token restarts the 300ms scroll animation each time and causes jitter.

### Frontend: `frontend/src/types.ts`

No changes.

---

## SSE Wire Format

```
event: token
data: {"content":"The "}

event: token
data: {"content":"algorithm you described "}

event: done
data: {"stage":"complexity","message":"The algorithm you described is correct! Now tell me the time and space complexity."}
```

## What Doesn't Change

- `/api/chat` route path — same endpoint, now responds with SSE
- `ChatRequest` type and validation
- Storage layer
- All other handlers and routes
- Claude client behavior (just a new ignored parameter)

## Key Design Decisions

**`onToken` callback vs channel:** Synchronous callback is simpler here — single producer, single consumer, no fan-out needed. No goroutine lifecycle management in the handler.

**State machine for JSON extraction:** The LLM outputs `{"message": "...", "stage": "..."}`. A trailing buffer of `len(endMarker)-1` chars ensures the end marker is detected before forwarding, so no JSON artifacts reach the frontend. This relies on `message` appearing before `stage` in the JSON output — the system prompt already specifies this key order, and LLMs reliably follow key order from their prompt template. This must not change.

**`done` event carries the full message:** The frontend replaces the accumulated streaming text with the authoritative parsed message on `done`. This handles any edge cases in the streaming extraction.

**Same endpoint, not a new route:** No reason to split `/api/chat` and `/api/chat/stream` — streaming is now the only mode.
