package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RegisterRoutes(app *fiber.App) {
	app.Route("/api", func(api fiber.Router) {
		api.Get("/healthcheck", func(c *fiber.Ctx) error {
			if err := hs.storage.Ping(c.Context()); err != nil {
				return c.Status(http.StatusInternalServerError).SendString("failed to ping database")
			}

			return c.SendStatus(http.StatusOK)
		})
	})
}
