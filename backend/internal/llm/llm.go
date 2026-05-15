package llm

import (
	"context"

	"leetgame/internal/models"
)

const SystemPromptTemplate = `You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.

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
	Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string, onToken func(string)) (EvaluateResponse, error)
}
