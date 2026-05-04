package storage

import (
	"context"

	"leetgame/internal/models"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
	SearchProblems(ctx context.Context, q, difficulty string, tags []string) ([]models.Problem, error)
}
