package claude

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
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

type AnthropicClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

func New(apiKey, model string) *AnthropicClient {
	return &AnthropicClient{
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []llm.ChatMessage, userMessage string, onToken func(string)) (llm.EvaluateResponse, error) {
	systemPrompt := fmt.Sprintf(llm.SystemPromptTemplate, problem.Title, problem.Description, stage)

	messages := make([]map[string]string, 0, len(history)+1)
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userMessage})

	body := map[string]any{
		"model":      c.model,
		"max_tokens": 1024,
		"stream":     true,
		"system":     systemPrompt,
		"messages":   messages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.EvaluateResponse{}, fmt.Errorf("claude API returned status %d: %s", resp.StatusCode, string(b))
	}

	var fullText strings.Builder
	ex := &extractor{onToken: onToken}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1*1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return llm.EvaluateResponse{}, ctx.Err()
		}
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := line[6:]
		var event struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}
		if event.Type == "message_stop" {
			break
		}
		if event.Type == "content_block_delta" && event.Delta.Type == "text_delta" {
			tok := event.Delta.Text
			if tok == "" {
				continue
			}
			slog.Debug("claude stream chunk", "tok", tok)
			fullText.WriteString(tok)
			ex.add(tok)
		}
	}

	if ex.state == stateMessage && ex.pending != "" && ex.onToken != nil && ctx.Err() == nil {
		ex.onToken(ex.pending)
		ex.pending = ""
	}

	if err := scanner.Err(); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("error reading claude stream: %w", err)
	}

	text := strings.TrimSpace(fullText.String())
	text = stripCodeFence(text)

	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(text), &evalResp); err != nil {
		return llm.EvaluateResponse{Message: text, Stage: stage}, nil
	}

	switch evalResp.Stage {
	case "pattern", "algorithm", "complexity", "complete":
	default:
		return llm.EvaluateResponse{}, fmt.Errorf("claude returned unknown stage %q", evalResp.Stage)
	}

	return evalResp, nil
}

func stripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if idx := strings.Index(s, "\n"); idx >= 0 {
		s = s[idx+1:]
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return s
}

// extractor pulls the clean message value out of a streaming JSON response.
// The LLM emits {"message": "CONTENT", "stage": "VALUE"} token by token.
// It calls onToken only with characters that belong to CONTENT.
type extractor struct {
	accumulated string
	pending     string
	state       extractState
	onToken     func(string)
}

type extractState int

const (
	stateBefore  extractState = iota
	stateMessage
	stateAfter
)

func (e *extractor) add(tok string) {
	e.accumulated += tok
	if e.state == stateAfter {
		return
	}
	if e.state == stateBefore {
		// skip leading code fence (```json\n or ```\n) before looking for JSON prefix
		content := e.accumulated
		if strings.HasPrefix(content, "```") {
			if idx := strings.Index(content, "\n"); idx >= 0 {
				content = content[idx+1:]
			}
		}
		if strings.HasPrefix(content, msgPrefix) {
			e.state = stateMessage
			after := content[len(msgPrefix):]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
	e.forward(tok)
}

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
