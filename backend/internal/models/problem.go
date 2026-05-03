package models

import (
	"time"

	"github.com/google/uuid"
)

type Problem struct {
	Id          uuid.UUID `json:"id" db:"id"`
	Slug        string    `json:"slug" db:"slug"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description" db:"description"`
	Difficulty  string    `json:"difficulty" db:"difficulty"`
	TopicTags   []string  `json:"topic_tags" db:"topic_tags"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
