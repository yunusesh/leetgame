package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error {
	const q = `
		INSERT INTO topic_proficiency (user_id, topic, stage, score, session_count, updated_at)
		VALUES ($1, $2, $3, $4, 1, NOW())
		ON CONFLICT (user_id, topic, stage) DO UPDATE
		SET score         = topic_proficiency.score + GREATEST($5, $6 / sqrt(topic_proficiency.session_count::float + 1)) * ($4 - topic_proficiency.score),
		    session_count = topic_proficiency.session_count + 1,
		    updated_at    = NOW()`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, topic, stage, sessionScore, floor, scale)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	const q = `
		SELECT user_id, topic, stage, score, session_count, updated_at
		FROM topic_proficiency
		WHERE user_id = $1
		ORDER BY topic, stage`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.TopicProficiency, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.TopicProficiency])
	})
}
