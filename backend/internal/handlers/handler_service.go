package handlers

import (
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/storage"
)

type HandlerService struct {
	storage   storage.Storage
	logger    *slog.Logger
	llmClient llm.Client
	jwtSecret string
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
	JWTSecret string
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
		jwtSecret: cfg.JWTSecret,
	}
}
