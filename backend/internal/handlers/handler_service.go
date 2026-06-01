package handlers

import (
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

type HandlerService struct {
	storage   storage.Storage
	logger    *slog.Logger
	llmClient llm.Client
	evaluator llm.Evaluator
	keyfunc   jwt.Keyfunc
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
	Evaluator llm.Evaluator
	Keyfunc   jwt.Keyfunc
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
		evaluator: cfg.Evaluator,
		keyfunc:   cfg.Keyfunc,
	}
}
