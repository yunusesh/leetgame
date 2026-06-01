package llm

import (
	"context"
	"fmt"
	"strings"

	"leetgame/internal/models"
)

type TopicScore struct {
	Topic string  `json:"topic"`
	Stage string  `json:"stage"`
	Score float64 `json:"score"`
}

type SessionEvaluation struct {
	Scores []TopicScore `json:"scores"`
}

type Evaluator interface {
	EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []ChatMessage) (SessionEvaluation, error)
}

func BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage) string {
	var sb strings.Builder

	sb.WriteString("You are evaluating a candidate's performance on a LeetCode practice session.\n\n")
	fmt.Fprintf(&sb, "Problem: %s\n", problem.Title)
	fmt.Fprintf(&sb, "Problem tags: %s\n", strings.Join(problem.TopicTags, ", "))
	fmt.Fprintf(&sb, "Active stages practiced: %s\n\n", strings.Join(activeStages, ", "))

	sb.WriteString("Full conversation (note: 'assistant' turns are interviewer coaching prompts, not candidate answers — only score the candidate's own words in 'user' turns):\n")
	for _, msg := range history {
		fmt.Fprintf(&sb, "%s: %s\n", msg.Role, msg.Content)
	}

	sb.WriteString("\nScore the candidate's demonstrated understanding for each (topic, stage) pair that was actually tested.")
	sb.WriteString(" Only include pairs from the problem's tags × active stages.")
	sb.WriteString(" Score 0.0 = no understanding or completely wrong, 1.0 = correct and clearly articulated without hints.\n\n")
	sb.WriteString("CRITICAL: Return ONLY this JSON — no explanation, no markdown, no text before or after:\n")
	sb.WriteString(`{"scores": [{"topic": "Dynamic Programming", "stage": "pattern", "score": 0.8}]}`)
	sb.WriteString("\n\nOnly use topics from the problem's tags list. Only use stages from the active stages list.")

	return sb.String()
}
