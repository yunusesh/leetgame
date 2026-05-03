package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"leetgame/internal/models"
)

const systemPromptTemplate = `You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.

Problem Title: %s
Problem Description:
%s

Evaluate the candidate's approach in two stages. The current stage is: %s

Stage 1 — Algorithm (stage = "algorithm"):
Assess whether the described algorithm is correct and would solve the problem efficiently.
- If incorrect or incomplete: ask exactly ONE focused Socratic question to guide their thinking. Never reveal the answer.
- If correct: briefly acknowledge it and set stage to "complexity" in your response.

Stage 2 — Complexity (stage = "complexity"):
Ask the candidate to state both time complexity and space complexity.
- If incorrect: ask one focused guiding question. Keep stage as "complexity".
- If both time and space complexity are correct: confirm and set stage to "complete".

Respond ONLY with this exact JSON — no other text before or after:
{"message": "<your response to the candidate>", "stage": "<algorithm|complexity|complete>"}`

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type EvaluateResponse struct {
	Message string `json:"message"`
	Stage   string `json:"stage"`
}

type Client interface {
	Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string) (EvaluateResponse, error)
}

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

func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string) (EvaluateResponse, error) {
	systemPrompt := fmt.Sprintf(systemPromptTemplate, problem.Title, problem.Description, stage)

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
		return EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return EvaluateResponse{}, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return EvaluateResponse{}, fmt.Errorf("claude API returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to decode claude response: %w", err)
	}
	if len(apiResp.Content) == 0 {
		return EvaluateResponse{}, fmt.Errorf("empty content from claude")
	}

	var evalResp EvaluateResponse
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &evalResp); err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to parse claude JSON: %w (raw: %s)", err, apiResp.Content[0].Text)
	}

	switch evalResp.Stage {
	case "algorithm", "complexity", "complete":
		// valid
	default:
		return EvaluateResponse{}, fmt.Errorf("claude returned unknown stage %q", evalResp.Stage)
	}

	return evalResp, nil
}
