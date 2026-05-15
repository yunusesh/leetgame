package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"

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

	// fasthttp forbids accessing RequestCtx from inside SetBodyStreamWriter.
	// Extract everything from c before registering the callback.
	streamCtx, cancelStream := context.WithCancel(context.Background())

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

		result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, history, req.Message, onToken)
		if err != nil {
			hs.logger.Error("llm evaluate failed", "error", err)
			fmt.Fprintf(w, "event: error\ndata: {}\n\n") //nolint:errcheck
			w.Flush()                                     //nolint:errcheck
			return
		}

		done, _ := json.Marshal(map[string]string{"stage": result.Stage, "message": result.Message})
		fmt.Fprintf(w, "event: done\ndata: %s\n\n", done) //nolint:errcheck
		w.Flush()                                          //nolint:errcheck
	})

	return nil
}
