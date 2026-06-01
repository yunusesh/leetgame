package models

import (
	"time"

	"github.com/google/uuid"
)

type TopicProficiency struct {
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	Topic     string    `json:"topic" db:"topic"`
	Stage     string    `json:"stage" db:"stage"`
	Score     float64   `json:"score" db:"score"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
