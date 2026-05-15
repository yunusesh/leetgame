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
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

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
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

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
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

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
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

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
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}
	history := []llm.ChatMessage{{Role: "user", Content: "prev"}, {Role: "assistant", Content: "resp"}}

	_, err := client.Evaluate(context.Background(), problem, "algorithm", history, "new message", nil)
	require.NoError(t, err)

	body := string(capturedBody)
	assert.Contains(t, body, "Two Sum")
	assert.Contains(t, body, "prev")
	assert.Contains(t, body, "new message")
}
