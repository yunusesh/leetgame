package evaluation_test

import (
	"context"
	"errors"
	"testing"

	"leetgame/internal/evaluation"
	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// mockPublisher satisfies evaluation.SessionPublisher.
type mockPublisher struct {
	err error
}

func (m *mockPublisher) PublishSessionCompleted(_ context.Context, _ kafka.SessionCompletedEvent) error {
	return m.err
}

func TestKafkaDispatcher_PublishSucceeds_NoFallback(t *testing.T) {
	fallbackCalled := false
	d := evaluation.NewKafkaDispatcher(
		&mockPublisher{err: nil},
		func(_ context.Context, _ uuid.UUID, _ models.Problem, _ []string, _ []llm.ChatMessage) {
			fallbackCalled = true
		},
		testLogger,
	)

	d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory)
	assert.False(t, fallbackCalled)
}

func TestKafkaDispatcher_PublishFails_CallsFallback(t *testing.T) {
	var capturedUserID uuid.UUID
	var capturedProblem models.Problem
	d := evaluation.NewKafkaDispatcher(
		&mockPublisher{err: errors.New("broker unavailable")},
		func(_ context.Context, uid uuid.UUID, p models.Problem, _ []string, _ []llm.ChatMessage) {
			capturedUserID = uid
			capturedProblem = p
		},
		testLogger,
	)

	d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory)
	assert.Equal(t, testUserID, capturedUserID)
	assert.Equal(t, testProblem.Title, capturedProblem.Title)
}
