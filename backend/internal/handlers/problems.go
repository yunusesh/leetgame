package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetRandomProblem(c *fiber.Ctx) error {
	problem, err := hs.storage.GetRandomProblem(c.Context())
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}
