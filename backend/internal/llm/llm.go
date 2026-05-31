package llm

import (
	"context"
	"fmt"
	"strings"

	"leetgame/internal/models"
)

type stageDesc struct {
	label    string
	criteria string
	guidance string
}

var stageDescriptions = map[string]stageDesc{
	"edge_cases": {
		label:    "Edge Cases",
		criteria: "The candidate identifies key edge cases and boundary conditions for this problem (e.g. empty input, single element, duplicates, overflow).",
		guidance: "If incomplete: ask ONE Socratic question about a specific edge case they missed. Never enumerate all edge cases.",
	},
	"brute_force": {
		label:    "Brute Force",
		criteria: "The candidate describes a working naive solution, even if inefficient.",
		guidance: "If incorrect or too vague: ask ONE focused question to guide them toward a valid brute force approach.",
	},
	"pattern": {
		label:    "Optimal Pattern",
		criteria: "The candidate correctly identifies the algorithm pattern for the optimal solution (e.g. sliding window, BFS/DFS, dynamic programming, two pointers, binary search, union find, backtracking, greedy, heap/priority queue, trie).",
		guidance: "If incorrect or too vague: ask ONE Socratic question to nudge them toward the right pattern. Never reveal the pattern directly.",
	},
	"algorithm": {
		label:    "Optimal Algorithm",
		criteria: "The candidate describes a correct and efficient algorithm that solves the problem optimally.",
		guidance: "If incorrect or incomplete: ask ONE focused Socratic question. Never reveal the answer.",
	},
	"tc_sc": {
		label:    "Time & Space Complexity",
		criteria: "The candidate correctly states both time complexity and space complexity.",
		guidance: "If incorrect: ask ONE focused guiding question about the complexity.",
	},
}

func BuildSystemPrompt(title, description, stage string, activeStages []string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.\n\nProblem Title: %s\nProblem Description:\n%s\n\n", title, description)

	sb.WriteString("Guide the candidate through the following stages in order:\n\n")
	for i, s := range activeStages {
		d := stageDescriptions[s]
		successStage := "complete"
		if i < len(activeStages)-1 {
			successStage = activeStages[i+1]
		}
		fmt.Fprintf(&sb, "Stage %d — %s (stage = %q):\n%s\n%s\nOn success: set stage to %q.\n\n",
			i, d.label, s, d.criteria, d.guidance, successStage)
	}

	fmt.Fprintf(&sb, "The current stage is: %q\n\n", stage)

	sb.WriteString("CRITICAL: Your entire response must be ONLY the following JSON object — no explanation, no markdown, no text before or after, no code fences:\n")
	sb.WriteString(`{"message": "<your response to the candidate>", "stage": "<stage_id>"}`)
	sb.WriteString("\n\nAny response that is not pure JSON will be rejected. Do not write anything except the JSON object.")

	return sb.String()
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type EvaluateResponse struct {
	Message string `json:"message"`
	Stage   string `json:"stage"`
}

type Client interface {
	Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, onToken func(string)) (EvaluateResponse, error)
}
