package handlers

import (
	"math/rand"
	"net/http"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

type topicWeight struct {
	Topic  string
	Weight float64
}

// computeTopicWeights returns an inverse-proficiency weight for each available topic.
// Topics with no proficiency data default to score 0.0 (cold start → maximum weight).
// If all weights are zero (perfect scores everywhere), returns uniform weights.
func computeTopicWeights(proficiencies []models.TopicProficiency, tags []types.ProblemTag, activeStages []string) []topicWeight {
	scoreMap := make(map[string]float64)
	for _, p := range proficiencies {
		scoreMap[p.Topic+"|"+p.Stage] = p.Score
	}

	weights := make([]topicWeight, 0, len(tags))
	for _, tag := range tags {
		var total float64
		for _, stage := range activeStages {
			total += scoreMap[tag.Name+"|"+stage] // missing = 0.0
		}
		avg := total / float64(len(activeStages))
		weights = append(weights, topicWeight{Topic: tag.Name, Weight: 1.0 - avg})
	}

	// If all weights are zero, use uniform
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	if sum == 0 {
		for i := range weights {
			weights[i].Weight = 1.0
		}
	}

	return weights
}

// sampleTopic picks one topic from weights using weighted random sampling.
func sampleTopic(weights []topicWeight) string {
	if len(weights) == 0 {
		return ""
	}
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	r := rand.Float64() * sum
	for _, w := range weights {
		r -= w.Weight
		if r <= 0 {
			return w.Topic
		}
	}
	return weights[len(weights)-1].Topic
}

func (hs *HandlerService) GetSmartPracticeProblem(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	stagesParam := strings.TrimSpace(c.Query("active_stages"))
	if stagesParam == "" {
		return xerrors.BadRequestError("active_stages is required")
	}
	activeStages := strings.Split(stagesParam, ",")
	for i, s := range activeStages {
		activeStages[i] = strings.TrimSpace(s)
	}

	allTags, err := hs.storage.GetProblemTags(c.Context())
	if err != nil {
		return err
	}

	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}

	weights := computeTopicWeights(proficiencies, allTags, activeStages)
	sampledTopic := sampleTopic(weights)

	problem, err := hs.storage.GetRandomProblemFiltered(c.Context(), "", "", []string{sampledTopic}, "or", "")
	if err != nil {
		problem, err = hs.storage.GetRandomProblem(c.Context())
		if err != nil {
			return err
		}
	}

	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProficiency(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(proficiencies)
}
