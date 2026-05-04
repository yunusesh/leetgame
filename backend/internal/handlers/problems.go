package handlers

import (
	"net/http"
	"strings"

	"leetgame/internal/types"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetRandomProblem(c *fiber.Ctx) error {
	problem, err := hs.storage.GetRandomProblem(c.Context())
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProblems(c *fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.QueryParser(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	tags := []string{}
	if q.Tags != "" {
		for _, t := range strings.Split(q.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
	}

	problems, err := hs.storage.SearchProblems(c.Context(), q.Q, q.Difficulty, tags)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}
