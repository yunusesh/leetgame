package handlers

import (
	"log/slog"

	"leetgame/internal/storage"
)

type HandlerService struct {
	storage          storage.Storage
	logger           *slog.Logger
}

type HandlerServiceConfig struct {
	Storage          storage.Storage
	Logger           *slog.Logger
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:          cfg.Storage,
		logger:           cfg.Logger,
	}
}
