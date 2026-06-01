package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, topic, stage string, sessionScore, learningRate float64) error {
	const q = `
		INSERT INTO topic_proficiency (user_id, topic, stage, score, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id, topic, stage) DO UPDATE
		SET score      = topic_proficiency.score + $5 * ($4 - topic_proficiency.score),
		    updated_at = NOW()`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, topic, stage, sessionScore, learningRate)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	const q = `
		SELECT user_id, topic, stage, score, updated_at
		FROM topic_proficiency
		WHERE user_id = $1`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.TopicProficiency, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.TopicProficiency])
	})
}
