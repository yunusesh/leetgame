package handlers

import (
	"net/http"

	"leetgame/internal/llm"
	"leetgame/internal/types"
	"leetgame/internal/xerrors"

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

	result, err := hs.llmClient.Evaluate(c.Context(), problem, req.Stage, history, req.Message)
	if err != nil {
		hs.logger.Error("llm evaluate failed", "error", err)
		return xerrors.InternalServerError()
	}

	return c.Status(http.StatusOK).JSON(types.ChatResponse{
		Message: result.Message,
		Stage:   result.Stage,
	})
}
