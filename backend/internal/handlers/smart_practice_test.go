package handlers

import (
	"testing"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

var testUID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

func makeProficiency(topic, stage string, score float64) models.TopicProficiency {
	return models.TopicProficiency{UserID: testUID, Topic: topic, Stage: stage, Score: score}
}

func makeTag(name string) types.ProblemTag {
	return types.ProblemTag{Name: name, Count: 10}
}

func TestComputeTopicWeights_ColdStart(t *testing.T) {
	// No proficiency data — all weights should be 1.0 (cold start)
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(nil, tags, []string{"pattern"})

	if len(weights) != 2 {
		t.Fatalf("expected 2 weights, got %d", len(weights))
	}
	for _, w := range weights {
		if w.Weight != 1.0 {
			t.Errorf("cold start: expected weight 1.0 for %s, got %f", w.Topic, w.Weight)
		}
	}
}

func TestComputeTopicWeights_InverseScore(t *testing.T) {
	// DP pattern = 0.8 → weight = 0.2; Sliding Window pattern = 0.2 → weight = 0.8
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 0.8),
		makeProficiency("Sliding Window", "pattern", 0.2),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})

	wantDP := 0.2
	wantSW := 0.8
	for _, w := range weights {
		switch w.Topic {
		case "Dynamic Programming":
			if diff := w.Weight - wantDP; diff < -0.001 || diff > 0.001 {
				t.Errorf("DP weight: got %f, want %f", w.Weight, wantDP)
			}
		case "Sliding Window":
			if diff := w.Weight - wantSW; diff < -0.001 || diff > 0.001 {
				t.Errorf("SW weight: got %f, want %f", w.Weight, wantSW)
			}
		}
	}
}

func TestComputeTopicWeights_MultiStageAverage(t *testing.T) {
	// DP: pattern=0.9, tc_sc=0.1 → avg=0.5 → weight=0.5
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 0.9),
		makeProficiency("Dynamic Programming", "tc_sc", 0.1),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern", "tc_sc"})

	if len(weights) != 1 {
		t.Fatalf("expected 1 weight, got %d", len(weights))
	}
	want := 0.5
	if diff := weights[0].Weight - want; diff < -0.001 || diff > 0.001 {
		t.Errorf("multi-stage avg: got weight %f, want %f", weights[0].Weight, want)
	}
}

func TestComputeTopicWeights_AllPerfect_UsesUniform(t *testing.T) {
	// All scores 1.0 → all weights 0 → should fall back to uniform (1.0 each)
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 1.0),
		makeProficiency("Sliding Window", "pattern", 1.0),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})

	for _, w := range weights {
		if w.Weight != 1.0 {
			t.Errorf("all-perfect fallback: expected weight 1.0 for %s, got %f", w.Topic, w.Weight)
		}
	}
}

func TestSampleTopic_ReturnsValue(t *testing.T) {
	weights := []topicWeight{
		{Topic: "Dynamic Programming", Weight: 0.1},
		{Topic: "Sliding Window", Weight: 0.9},
	}
	// Run 100 samples — must always return one of the two topics
	for i := 0; i < 100; i++ {
		got := sampleTopic(weights)
		if got != "Dynamic Programming" && got != "Sliding Window" {
			t.Errorf("unexpected topic: %s", got)
		}
	}
}

func TestSampleTopic_Empty(t *testing.T) {
	got := sampleTopic(nil)
	if got != "" {
		t.Errorf("empty weights: expected empty string, got %q", got)
	}
}
