package postgres

import (
	"context"

	"leetgame/internal/utils"

	"github.com/google/uuid"
)

func (p *Postgres) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	const sql = `
		INSERT INTO practice_days (user_id, day)
		VALUES ($1, CURRENT_DATE)
		ON CONFLICT (user_id, day) DO NOTHING
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetStreak(ctx context.Context, userID uuid.UUID) (int, error) {
	const sql = `
		WITH ranked AS (
			SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
			FROM practice_days WHERE user_id = $1
		)
		SELECT COUNT(*) FROM ranked
		WHERE day = CURRENT_DATE - CAST(rn - 1 AS INTEGER)
	`
	return utils.Retry(ctx, func(ctx context.Context) (int, error) {
		var n int
		err := p.Pool.QueryRow(ctx, sql, userID).Scan(&n)
		return n, err
	})
}
