package llm_test

import (
	"strings"
	"testing"

	"leetgame/internal/llm"
)

func TestBuildSystemPrompt_contains_current_stage(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"})
	if !strings.Contains(prompt, `"pattern"`) {
		t.Error("expected prompt to contain current stage")
	}
}

func TestBuildSystemPrompt_contains_problem_title(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"})
	if !strings.Contains(prompt, "Two Sum") {
		t.Error("expected prompt to contain problem title")
	}
}

func TestBuildSystemPrompt_lists_only_active_stages(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "tc_sc"})
	if !strings.Contains(prompt, "Optimal Pattern") {
		t.Error("expected prompt to contain active stage 'pattern'")
	}
	if !strings.Contains(prompt, "Time & Space Complexity") {
		t.Error("expected prompt to contain active stage 'tc_sc'")
	}
	if strings.Contains(prompt, "Brute Force") {
		t.Error("expected prompt to NOT contain inactive stage 'brute_force'")
	}
}

func TestBuildSystemPrompt_success_stage_is_complete_for_last(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "tc_sc", []string{"pattern", "tc_sc"})
	if !strings.Contains(prompt, `"complete"`) {
		t.Error("expected prompt to indicate 'complete' as success for last stage")
	}
}
