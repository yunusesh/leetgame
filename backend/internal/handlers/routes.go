package handlers

import (
	"net/http"

	"leetgame/internal/middleware"

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

		api.Use(middleware.OptionalAuth(hs.keyfunc))

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
			problems.Get("/tags", hs.GetProblemTags)
			problems.Get("/", hs.GetProblems)
		})

		api.Post("/chat", hs.Chat)

		api.Route("/streak", func(streak fiber.Router) {
			streak.Use(middleware.RequireAuth(hs.keyfunc))
			streak.Get("/", hs.GetStreak)
			streak.Post("/", hs.RecordStreak)
		})

		api.Route("/settings", func(settings fiber.Router) {
			settings.Use(middleware.RequireAuth(hs.keyfunc))
			settings.Get("/", hs.GetSettings)
			settings.Put("/", hs.UpdateSettings)
		})

		api.Route("/saved", func(saved fiber.Router) {
			saved.Use(middleware.RequireAuth(hs.keyfunc))
			saved.Get("/", hs.GetSavedProblems)
			saved.Post("/:problem_id", hs.SaveProblem)
			saved.Delete("/:problem_id", hs.UnsaveProblem)
		})
	})
}
