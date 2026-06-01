package storage

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetRandomProblemFiltered(ctx context.Context, q, difficulty string, tags []string, tagMatch, excludeID string) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
	SearchProblems(ctx context.Context, q, difficulty string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)
	GetProblemTags(ctx context.Context) ([]types.ProblemTag, error)

	// streaks
	UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error
	GetStreak(ctx context.Context, userID uuid.UUID) (int, error)

	// settings
	GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error)
	UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool) error
}
