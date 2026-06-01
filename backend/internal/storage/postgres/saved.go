package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	const q = `
		INSERT INTO saved_problems (user_id, problem_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	const q = `DELETE FROM saved_problems WHERE user_id = $1 AND problem_id = $2`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error) {
	const q = `
		SELECT p.id, p.slug, p.title, p.description, p.difficulty, p.topic_tags, p.leetcode_id, p.created_at
		FROM problems p
		INNER JOIN saved_problems sp ON sp.problem_id = p.id
		WHERE sp.user_id = $1
		ORDER BY sp.created_at DESC`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
	})
}
