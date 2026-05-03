package postgres

import (
	"context"
	"errors"

	"leetgame/internal/models"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) GetRandomProblem(ctx context.Context) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, created_at
		FROM problems
		ORDER BY RANDOM()
		LIMIT 1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{}),
				)
			}
			return models.Problem{}, err
		}
		return problem, nil
	})
}

func (p *Postgres) GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, created_at
		FROM problems
		WHERE id = $1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q, id)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{"id": id.String()}),
				)
			}
			return models.Problem{}, err
		}
		return problem, nil
	})
}
