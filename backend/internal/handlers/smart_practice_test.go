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
	for range 100 {
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

func TestFilterTagsByActiveTopics(t *testing.T) {
	allTags := []types.ProblemTag{
		{Name: "Array"},
		{Name: "Graph"},
		{Name: "Brain Teaser"},
		{Name: "Geometry"},
	}
	activeTopics := []string{"Array", "Graph"}

	got := filterTagsByActiveTopics(allTags, activeTopics)
	if len(got) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(got))
	}
	if got[0].Name != "Array" || got[1].Name != "Graph" {
		t.Errorf("unexpected tags: %v", got)
	}
}

func TestFilterTagsByActiveTopics_EmptyFilter(t *testing.T) {
	allTags := []types.ProblemTag{
		{Name: "Array"},
		{Name: "Graph"},
	}
	// Empty active topics → return all tags unchanged
	got := filterTagsByActiveTopics(allTags, []string{})
	if len(got) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(got))
	}
}

func TestComputeTopicWeights_WithActiveTopics(t *testing.T) {
	proficiencies := []models.TopicProficiency{
		{Topic: "Array", Stage: "pattern", Score: 0.8},
		{Topic: "Graph", Stage: "pattern", Score: 0.2},
		{Topic: "Brain Teaser", Stage: "pattern", Score: 0.5},
	}
	// Only Array and Graph are active — Brain Teaser should not appear in weights
	tags := []types.ProblemTag{{Name: "Array"}, {Name: "Graph"}}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})
	if len(weights) != 2 {
		t.Fatalf("expected 2 weights, got %d", len(weights))
	}
	// Graph (score=0.2) should have higher weight than Array (score=0.8)
	graphW, arrayW := 0.0, 0.0
	for _, w := range weights {
		if w.Topic == "Graph" {
			graphW = w.Weight
		}
		if w.Topic == "Array" {
			arrayW = w.Weight
		}
	}
	if graphW <= arrayW {
		t.Errorf("Graph weight (%f) should be > Array weight (%f)", graphW, arrayW)
	}
}
