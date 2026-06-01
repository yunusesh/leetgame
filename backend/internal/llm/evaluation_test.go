package llm

import (
	"strings"
	"testing"

	"leetgame/internal/models"
	"github.com/google/uuid"
)

func TestBuildEvaluationPrompt(t *testing.T) {
	problem := models.Problem{
		Id:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:       "Two Sum",
		Description: "Given an array...",
		TopicTags:   []string{"Array", "Hash Table"},
	}
	activeStages := []string{"pattern", "tc_sc"}
	history := []ChatMessage{
		{Role: "user", Content: "I think we use a hash map"},
		{Role: "assistant", Content: "Good, can you explain why?"},
		{Role: "user", Content: "To achieve O(n) lookup"},
	}

	prompt := BuildEvaluationPrompt(problem, activeStages, history)

	checks := []struct {
		name    string
		contain string
	}{
		{"contains problem title", "Two Sum"},
		{"contains topic tags", "Array"},
		{"contains topic tags 2", "Hash Table"},
		{"contains active stages", "pattern"},
		{"contains active stages 2", "tc_sc"},
		{"contains user message", "I think we use a hash map"},
		{"contains assistant message", "Good, can you explain why?"},
		{"contains second user message", "To achieve O(n) lookup"},
		{"contains JSON instruction", `"scores"`},
		{"contains pattern rubric", "pattern, brute_force, algorithm"},
		{"contains edge_cases rubric", "edge_cases"},
		{"contains tc_sc rubric", "tc_sc"},
		{"contains reveal cap", "Reveal cap"},
		{"contains hint cap", "USER REQUESTED HINT"},
		{"contains answer cap", "USER REQUESTED ANSWER"},
		{"contains calibration note", "Calibration"},
	}

	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if !strings.Contains(prompt, c.contain) {
				t.Errorf("prompt missing %q", c.contain)
			}
		})
	}
}

func TestBuildEvaluationPrompt_EmptyHistory(t *testing.T) {
	problem := models.Problem{
		Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:     "Test",
		TopicTags: []string{"Array"},
	}
	// Should not panic
	prompt := BuildEvaluationPrompt(problem, []string{"pattern"}, nil)
	if !strings.Contains(prompt, "Test") {
		t.Error("prompt missing problem title")
	}
}
