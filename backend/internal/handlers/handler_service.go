package handlers

import (
	"log/slog"

	"leetgame/internal/evaluation"
	"leetgame/internal/llm"
	"leetgame/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

type HandlerService struct {
	storage    storage.Storage
	logger     *slog.Logger
	llmClient  llm.Client
	keyfunc    jwt.Keyfunc
	dispatcher evaluation.EvaluationDispatcher
}

type HandlerServiceConfig struct {
	Storage    storage.Storage
	Logger     *slog.Logger
	LLMClient  llm.Client
	Keyfunc    jwt.Keyfunc
	Dispatcher evaluation.EvaluationDispatcher
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:    cfg.Storage,
		logger:     cfg.Logger,
		llmClient:  cfg.LLMClient,
		keyfunc:    cfg.Keyfunc,
		dispatcher: cfg.Dispatcher,
	}
}
