package server

import (
	"log/slog"
	"net/http"

	"leetgame/internal/claude"
	"leetgame/internal/handlers"
	"leetgame/internal/storage"
	"leetgame/internal/xerrors"

	go_json "github.com/goccy/go-json"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

type Config struct {
	Storage      storage.Storage
	Logger       *slog.Logger
	ClaudeClient claude.Client
}

func New(cfg *Config) *fiber.App {
	app := createFiberApp()
	setupStatic(app)

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:      cfg.Storage,
		Logger:       cfg.Logger,
		ClaudeClient: cfg.ClaudeClient,
	})
	setupMiddleware(app)
	service.RegisterRoutes(app)

	return app
}

func createFiberApp() *fiber.App {
	return fiber.New(fiber.Config{
		JSONEncoder:  go_json.Marshal,
		JSONDecoder:  go_json.Unmarshal,
		ErrorHandler: xerrors.ErrorHandler,
	})
}

func setupMiddleware(app *fiber.App) {
	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(redirectMiddleware())
	app.Use(cors.New())
}

func setupStatic(app *fiber.App) {
	app.Static("/", "internal/static")
}

func redirectMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()

		if path != "/" && !isApiOrWsPath(path) {
			slog.Info("redirecting to /",
				slog.String("original path", path),
			)
			return c.Redirect("/", http.StatusFound)
		}

		return c.Next()
	}
}

func isApiOrWsPath(path string) bool {
	return (len(path) >= 4 && path[:4] == "/api") || (len(path) >= 3 && path[:3] == "/ws")
}
