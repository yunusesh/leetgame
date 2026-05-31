package postgres

import (
	"context"
	"errors"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var defaultActiveStages = []string{"pattern", "algorithm", "tc_sc"}

func (p *Postgres) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	const sql = `SELECT user_id, active_stages FROM user_settings WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (models.UserSettings, error) {
		row, err := p.Pool.Query(ctx, sql, userID)
		if err != nil {
			return models.UserSettings{}, err
		}
		s, err := pgx.CollectOneRow(row, pgx.RowToStructByName[models.UserSettings])
		if errors.Is(err, pgx.ErrNoRows) {
			return models.UserSettings{
				UserID:       userID,
				ActiveStages: defaultActiveStages,
			}, nil
		}
		return s, err
	})
}

func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET active_stages = EXCLUDED.active_stages
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages)
		return struct{}{}, err
	})
	return err
}
