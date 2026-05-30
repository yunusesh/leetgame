package types

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	ProblemID uuid.UUID        `json:"problem_id"`
	Stage     string           `json:"stage"`
	History   []HistoryMessage `json:"history"`
	Message   string           `json:"message"`
}

func (r ChatRequest) Validate() map[string]string {
	errs := map[string]string{}
	if r.ProblemID == uuid.Nil {
		errs["problem_id"] = "required"
	}
	if strings.TrimSpace(r.Message) == "" {
		errs["message"] = "required"
	}
	validStages := map[string]bool{"pattern": true, "algorithm": true, "complexity": true}
	if !validStages[r.Stage] {
		errs["stage"] = "must be 'pattern', 'algorithm' or 'complexity'"
	}
	validRoles := map[string]bool{"user": true, "assistant": true}
	for i, msg := range r.History {
		if !validRoles[msg.Role] {
			errs[fmt.Sprintf("history[%d].role", i)] = "must be 'user' or 'assistant'"
		}
	}
	return errs
}
