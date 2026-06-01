package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xerrors"
	"leetgame/internal/xcontext"

	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) Chat(c *fiber.Ctx) error {
	var req types.ChatRequest
	if err := c.BodyParser(&req); err != nil {
		return xerrors.InvalidJSON()
	}
	if errs := req.Validate(); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}

	problem, err := hs.storage.GetProblemByID(c.Context(), req.ProblemID)
	if err != nil {
		return err
	}

	history := make([]llm.ChatMessage, len(req.History))
	for i, h := range req.History {
		history[i] = llm.ChatMessage{Role: h.Role, Content: h.Content}
	}

	// fasthttp forbids accessing RequestCtx from inside SetBodyStreamWriter.
	// Extract everything from c before registering the callback.
	streamCtx, cancelStream := context.WithCancel(context.Background())

	// Extract evaluation inputs before the stream writer — fasthttp recycles c after handler returns
	evalUID, _ := xcontext.GetUserID(c)
	evalEnabled := hs.evaluator != nil && evalUID != uuid.Nil
	evalProblem := problem
	evalProblem.TopicTags = append([]string(nil), problem.TopicTags...)
	evalActiveStages := append([]string(nil), req.ActiveStages...)
	// baseHistory = prior turns + user's current message; assistant reply appended after streaming
	baseHistory := make([]llm.ChatMessage, 0, len(history)+1)
	baseHistory = append(baseHistory, history...)
	baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: req.Message})

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer cancelStream()

		onToken := func(token string) {
			data, _ := json.Marshal(map[string]string{"content": token})
			if _, err := fmt.Fprintf(w, "event: token\ndata: %s\n\n", data); err != nil {
				cancelStream()
				return
			}
			if err := w.Flush(); err != nil {
				cancelStream()
				return
			}
		}

		result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, req.HintRequested, req.AnswerRequested, onToken)
		if err != nil {
			hs.logger.Error("llm evaluate failed", "error", err)
			fmt.Fprintf(w, "event: error\ndata: {}\n\n") //nolint:errcheck
			w.Flush()                                     //nolint:errcheck
			return
		}

		done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
		fmt.Fprintf(w, "event: done\ndata: %s\n\n", done) //nolint:errcheck
		w.Flush()                                          //nolint:errcheck

		if evalEnabled && result.Stage == "complete" {
			fullHistory := append(baseHistory[:len(baseHistory):len(baseHistory)], llm.ChatMessage{Role: "assistant", Content: result.Message})
			go hs.runSessionEvaluation(evalUID, evalProblem, evalActiveStages, fullHistory)
		}
	})

	return nil
}

func (hs *HandlerService) runSessionEvaluation(userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
	if userID == uuid.Nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	hs.logger.Info("starting session evaluation",
		"user_id", userID,
		"problem_id", problem.Id,
		"problem_title", problem.Title,
		"active_stages", activeStages,
	)

	eval, err := hs.evaluator.EvaluateSession(ctx, problem, activeStages, history)
	if err != nil {
		hs.logger.Error("session evaluation failed",
			"error", err,
			"user_id", userID,
			"problem_id", problem.Id,
			"problem_title", problem.Title,
		)
		return
	}

	type difficultyParams struct{ scale, floor float64 }
	params := map[string]difficultyParams{
		"Easy": {0.15, 0.03},
		"Hard": {0.35, 0.07},
	}
	dp, ok := params[problem.Difficulty]
	if !ok {
		dp = difficultyParams{0.25, 0.05} // Medium + unknown
	}

	var updated int
	for _, score := range eval.Scores {
		if score.Score < 0 || score.Score > 1 {
			hs.logger.Warn("skipping out-of-range score from LLM",
				"topic", score.Topic,
				"stage", score.Stage,
				"score", score.Score,
			)
			continue
		}
		if err := hs.storage.UpsertTopicProficiency(ctx, userID, problem.Id, score.Topic, score.Stage, score.Score, dp.scale, dp.floor); err != nil {
			hs.logger.Error("failed to upsert topic proficiency",
				"error", err,
				"topic", score.Topic,
				"stage", score.Stage,
			)
			continue
		}
		updated++
	}

	hs.logger.Info("session evaluation complete",
		"user_id", userID,
		"problem_title", problem.Title,
		"topics_updated", updated,
		"scores", eval.Scores,
	)
}
