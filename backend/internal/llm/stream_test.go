package llm_test

import (
	"testing"

	"leetgame/internal/llm"

	"github.com/stretchr/testify/assert"
)

func TestStripCodeFence(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"no fence", `{"message":"ok"}`, `{"message":"ok"}`},
		{"fence with newline", "```json\n{\"message\":\"ok\"}\n```", `{"message":"ok"}`},
		{"fence without newline", "```json{\"message\":\"ok\"}```", `{"message":"ok"}`},
		{"plain fence with newline", "```\n{\"message\":\"ok\"}\n```", `{"message":"ok"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, llm.StripCodeFence(tt.input))
		})
	}
}
