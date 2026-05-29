package server

import (
	"log/slog"

	"leetgame/internal/handlers"
	"leetgame/internal/llm"
	"leetgame/internal/storage"
	"leetgame/internal/xerrors"

	go_json "github.com/goccy/go-json"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	AllowedOrigins string
	JWTSecret      string
}

func New(cfg *Config) *fiber.App {
	app := fiber.New(fiber.Config{
		JSONEncoder:  go_json.Marshal,
		JSONDecoder:  go_json.Unmarshal,
		ErrorHandler: xerrors.ErrorHandler,
	})

	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.AllowedOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:   cfg.Storage,
		Logger:    cfg.Logger,
		LLMClient: cfg.LLMClient,
		JWTSecret: cfg.JWTSecret,
	})
	service.RegisterRoutes(app)

	return app
}
