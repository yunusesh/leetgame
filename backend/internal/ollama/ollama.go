package ollama

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

type OllamaClient struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

func New(baseURL, model string) *OllamaClient {
	return &OllamaClient{
		baseURL:    baseURL,
		model:      model,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []llm.ChatMessage, userMessage string) (llm.EvaluateResponse, error) {
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
		"stream":   false,
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

	var apiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to decode ollama response: %w", err)
	}
	if len(apiResp.Choices) == 0 {
		return llm.EvaluateResponse{}, fmt.Errorf("empty choices from ollama")
	}

	text := apiResp.Choices[0].Message.Content

	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(text), &evalResp); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to parse ollama JSON: %w (raw: %s)", err, text)
	}

	switch evalResp.Stage {
	case "algorithm", "complexity", "complete":
	default:
		return llm.EvaluateResponse{}, fmt.Errorf("ollama returned unknown stage %q", evalResp.Stage)
	}

	return evalResp, nil
}
