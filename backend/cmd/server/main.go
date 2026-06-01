package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
	"leetgame/internal/llm"
	"leetgame/internal/middleware"
	"leetgame/internal/ollama"
	"leetgame/internal/server"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Error("failed to load .env file", "error", err)
	}

	// Render sets PORT; our settings use SERVER_PORT via envPrefix.
	if port := os.Getenv("PORT"); port != "" && os.Getenv("SERVER_PORT") == "" {
		os.Setenv("SERVER_PORT", port)
	}

	settings, err := settings.Load()
	if err != nil {
		slog.Error("failed to load settings", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(settings.Log.Level),
	})))

	pg := postgres.New(&postgres.Config{
		DbUrl: settings.Storage.DbUrl,
	})

	var llmClient llm.Client
	switch settings.LLM.Provider {
	case "ollama":
		llmClient = ollama.New(settings.LLM.OllamaURL, settings.LLM.Model, settings.LLM.APIKey)
	default:
		llmClient = claude.New(settings.LLM.APIKey, settings.LLM.Model)
	}

	var evaluator llm.Evaluator
	if ac, ok := llmClient.(*claude.AnthropicClient); ok {
		evaluator = ac
	}

	var kf jwt.Keyfunc
	if settings.Auth.SupabaseURL != "" {
		jwks, err := middleware.NewKeyfunc(settings.Auth.SupabaseURL)
		if err != nil {
			slog.Error("failed to initialize JWKS", "error", err)
			os.Exit(1)
		}
		defer jwks.EndBackground()
		kf = jwks.Keyfunc
	}

	app := server.New(&server.Config{
		Storage: pg,
		Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
		})),
		LLMClient:      llmClient,
		Evaluator:      evaluator,
		AllowedOrigins: settings.Server.AllowedOrigins,
		Keyfunc:        kf,
	})

	go func() {
		if err := app.Listen(":" + settings.Server.Port); err != nil {
			slog.Error("failed to start server", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	slog.Info("shutting down server")

	if err := app.Shutdown(); err != nil {
		slog.Error("failed to shutdown server", slog.String("error", err.Error()))
	}

	pg.Close()
	slog.Info("server shutdown")
}
