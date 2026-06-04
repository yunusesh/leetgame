package kafka_test

import (
	"encoding/json"
	"testing"
	"time"

	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionCompletedEvent_JSONRoundtrip(t *testing.T) {
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	problemID := uuid.MustParse("00000000-0000-0000-0000-000000000002")

	event := kafka.SessionCompletedEvent{
		UserID: userID,
		Problem: models.Problem{
			Id:         problemID,
			Title:      "Two Sum",
			Difficulty: "Easy",
			TopicTags:  []string{"Array", "Hash Table"},
			CreatedAt:  time.Time{},
		},
		ActiveStages: []string{"pattern", "tc_sc"},
		History: []llm.ChatMessage{
			{Role: "user", Content: "I would use a hash map"},
			{Role: "assistant", Content: "Can you explain why?"},
		},
	}

	data, err := json.Marshal(event)
	require.NoError(t, err)

	// Verify json tag names are correct
	var raw map[string]any
	require.NoError(t, json.Unmarshal(data, &raw))
	assert.Contains(t, raw, "user_id")
	assert.Contains(t, raw, "problem")
	assert.Contains(t, raw, "active_stages")
	assert.Contains(t, raw, "history")

	var got kafka.SessionCompletedEvent
	require.NoError(t, json.Unmarshal(data, &got))

	assert.Equal(t, event.UserID, got.UserID)
	assert.Equal(t, event.Problem.Title, got.Problem.Title)
	assert.Equal(t, event.Problem.Difficulty, got.Problem.Difficulty)
	assert.Equal(t, event.ActiveStages, got.ActiveStages)
	assert.Len(t, got.History, 2)
	assert.Equal(t, event.History[0].Content, got.History[0].Content)
	assert.Equal(t, event.History[1].Role, got.History[1].Role)
}
