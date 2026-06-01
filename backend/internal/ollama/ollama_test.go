package ollama_test

import (
	"context"
	"encoding/json"
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

// makeOllamaServer returns a test HTTP server that streams the given content tokens
// in native Ollama /api/chat format, then sends a done:true terminator.
func makeOllamaServer(tokens []string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher := w.(http.Flusher)
		for _, tok := range tokens {
			line, _ := json.Marshal(map[string]any{
				"message": map[string]string{"role": "assistant", "content": tok},
				"done":    false,
			})
			fmt.Fprintf(w, "%s\n", line)
			flusher.Flush()
		}
		done, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": ""},
			"done":    true,
		})
		fmt.Fprintf(w, "%s\n", done)
		flusher.Flush()
	}))
}

func TestEvaluate_streams_message_tokens(t *testing.T) {
	// LLM streams {"message": "Hello world", "stage": "algorithm"} token by token
	tokens := []string{`{"`, `message`, `": "`, `Hello`, ` world`, `", "stage": "algorithm"}`}
	srv := makeOllamaServer(tokens)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	var received []string
	result, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", func(tok string) {
		received = append(received, tok)
	})

	require.NoError(t, err)
	assert.Equal(t, "Hello world", strings.Join(received, ""), "streamed tokens should be clean message content only")
	assert.Equal(t, "Hello world", result.Message)
	assert.Equal(t, "algorithm", result.Stage)
}

func TestEvaluate_think_false_in_request(t *testing.T) {
	// Verify think:false is sent so reasoning is disabled server-side
	var capturedBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedBody, _ = io.ReadAll(r.Body)
		line, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": `{"message": "ok", "stage": "algorithm"}`},
			"done":    false,
		})
		fmt.Fprintf(w, "%s\n", line)
		w.(http.Flusher).Flush()
		done, _ := json.Marshal(map[string]any{"message": map[string]string{}, "done": true})
		fmt.Fprintf(w, "%s\n", done)
		w.(http.Flusher).Flush()
	}))
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	_, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", nil)
	require.NoError(t, err)

	var body map[string]any
	require.NoError(t, json.Unmarshal(capturedBody, &body))
	assert.Equal(t, false, body["think"], "think:false must be sent to disable reasoning")
}

func TestEvaluate_nil_onToken_does_not_panic(t *testing.T) {
	// Claude client passes nil — must not panic
	srv := makeOllamaServer([]string{`{"message": "Good", "stage": "complexity"}`})
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	result, err := client.Evaluate(context.Background(), problem, "complexity", []string{"pattern", "algorithm", "tc_sc", "complexity"}, nil, "O(n) time", nil)

	require.NoError(t, err)
	assert.Equal(t, "Good", result.Message)
	assert.Equal(t, "complexity", result.Stage)
}

func TestEvaluate_context_cancellation(t *testing.T) {
	// Server hangs mid-stream — context cancellation should propagate
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		line, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": `{"message": "`},
			"done":    false,
		})
		fmt.Fprintf(w, "%s\n", line)
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(10 * time.Second):
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	_, err := client.Evaluate(ctx, problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", nil)
	assert.Error(t, err)
}

func TestEvaluate_passes_history_and_system_prompt(t *testing.T) {
	// Verify the request body includes system prompt, history, and user message
	var capturedBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedBody, _ = io.ReadAll(r.Body)
		line, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": `{"message": "ok", "stage": "algorithm"}`},
			"done":    false,
		})
		fmt.Fprintf(w, "%s\n", line)
		w.(http.Flusher).Flush()
		done, _ := json.Marshal(map[string]any{"message": map[string]string{}, "done": true})
		fmt.Fprintf(w, "%s\n", done)
		w.(http.Flusher).Flush()
	}))
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}
	history := []llm.ChatMessage{{Role: "user", Content: "prev"}, {Role: "assistant", Content: "resp"}}

	_, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, history, "new message", nil)
	require.NoError(t, err)

	body := string(capturedBody)
	assert.Contains(t, body, "Two Sum")
	assert.Contains(t, body, "prev")
	assert.Contains(t, body, "new message")
}

func TestEvaluate_pattern_stage_returned(t *testing.T) {
	// LLM returns pattern stage (staying on pattern after incorrect guess)
	tokens := []string{`{"message": "Think about a subarray technique", "stage": "pattern"}`}
	srv := makeOllamaServer(tokens)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Max Subarray", Description: "find the contiguous subarray"}

	result, err := client.Evaluate(context.Background(), problem, "pattern", []string{"pattern", "algorithm", "tc_sc"}, nil, "binary search maybe?", nil)

	require.NoError(t, err)
	assert.Equal(t, "Think about a subarray technique", result.Message)
	assert.Equal(t, "pattern", result.Stage)
}

func TestEvaluate_prefix_and_content_in_single_token(t *testing.T) {
	// The entire prefix + some content arrives as one token
	tokens := []string{`{"message": "Hello`, ` world`, `", "stage": "algorithm"}`}
	srv := makeOllamaServer(tokens)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	var received []string
	result, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", func(tok string) {
		received = append(received, tok)
	})

	require.NoError(t, err)
	assert.Equal(t, "Hello world", strings.Join(received, ""))
	assert.Equal(t, "Hello world", result.Message)
	assert.Equal(t, "algorithm", result.Stage)
}
