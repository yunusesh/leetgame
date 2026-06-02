package postgres

import (
	"context"
	"errors"
	"time"

	"leetgame/internal/types"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	const sql = `
		INSERT INTO user_streaks (user_id, streak, last_practiced_at)
		VALUES ($1, 1, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
		  streak = CASE
		    WHEN DATE(user_streaks.last_practiced_at AT TIME ZONE 'UTC') = DATE(NOW() AT TIME ZONE 'UTC')
		      THEN user_streaks.streak
		    WHEN NOW() - user_streaks.last_practiced_at <= INTERVAL '48 hours'
		      THEN user_streaks.streak + 1
		    ELSE 1
		  END,
		  last_practiced_at = NOW()
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error) {
	const sql = `SELECT streak, last_practiced_at FROM user_streaks WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (types.StreakInfo, error) {
		var streak int
		var lastPracticedAt *time.Time
		err := p.Pool.QueryRow(ctx, sql, userID).Scan(&streak, &lastPracticedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return types.StreakInfo{}, nil
		}
		return types.StreakInfo{Streak: streak, LastPracticedAt: lastPracticedAt}, err
	})
}
