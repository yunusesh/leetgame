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
	const sql = `SELECT user_id, active_stages, hide_title FROM user_settings WHERE user_id = $1`
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
				HideTitle:    true,
			}, nil
		}
		return s, err
	})
}

func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages, hide_title)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET active_stages = EXCLUDED.active_stages, hide_title = EXCLUDED.hide_title
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages, hideTitle)
		return struct{}{}, err
	})
	return err
}
