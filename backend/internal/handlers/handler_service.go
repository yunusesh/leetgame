package handlers

import (
	"log/slog"

	"leetgame/internal/claude"
	"leetgame/internal/storage"
)

type HandlerService struct {
	storage      storage.Storage
	logger       *slog.Logger
	claudeClient claude.Client
}

type HandlerServiceConfig struct {
	Storage      storage.Storage
	Logger       *slog.Logger
	ClaudeClient claude.Client
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:      cfg.Storage,
		logger:       cfg.Logger,
		claudeClient: cfg.ClaudeClient,
	}
}
