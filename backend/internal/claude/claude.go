package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"leetgame/internal/llm"
	"leetgame/internal/models"
)

type AnthropicClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

func New(apiKey, model string) *AnthropicClient {
	return &AnthropicClient{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{Timeout: 30 * time.Second},
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

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to decode claude response: %w", err)
	}
	if len(apiResp.Content) == 0 {
		return llm.EvaluateResponse{}, fmt.Errorf("empty content from claude")
	}

	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &evalResp); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to parse claude JSON: %w (raw: %s)", err, apiResp.Content[0].Text)
	}

	switch evalResp.Stage {
	case "algorithm", "complexity", "complete":
	default:
		return llm.EvaluateResponse{}, fmt.Errorf("claude returned unknown stage %q", evalResp.Stage)
	}

	return evalResp, nil
}
