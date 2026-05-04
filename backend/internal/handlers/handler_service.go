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
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
	}
}
