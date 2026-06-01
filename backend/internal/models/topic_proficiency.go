package models

import (
	"time"

	"github.com/google/uuid"
)

type TopicProficiency struct {
	UserID       uuid.UUID `json:"user_id"       db:"user_id"`
	Topic        string    `json:"topic"         db:"topic"`
	Stage        string    `json:"stage"         db:"stage"`
	Score        float64   `json:"score"         db:"score"`
	SessionCount int       `json:"session_count" db:"session_count"`
	UpdatedAt    time.Time `json:"updated_at"    db:"updated_at"`
}
