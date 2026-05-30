package llm_test

import (
	"fmt"
	"testing"

	"leetgame/internal/llm"

	"github.com/stretchr/testify/assert"
)

func TestSystemPromptTemplate_contains_pattern_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "pattern")
	assert.Contains(t, formatted, "Stage 0")
	assert.Contains(t, formatted, `"pattern"`)
	assert.Contains(t, formatted, "pattern|algorithm|complexity|complete")
}

func TestSystemPromptTemplate_contains_algorithm_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "algorithm")
	assert.Contains(t, formatted, "Stage 1")
	assert.Contains(t, formatted, "algorithm")
}

func TestSystemPromptTemplate_contains_complexity_stage(t *testing.T) {
	formatted := fmt.Sprintf(llm.SystemPromptTemplate, "Two Sum", "find pairs", "complexity")
	assert.Contains(t, formatted, "Stage 2")
	assert.Contains(t, formatted, "complexity")
}
