package models

import "github.com/google/uuid"

type UserSettings struct {
	UserID       uuid.UUID `json:"user_id" db:"user_id"`
	ActiveStages []string  `json:"active_stages" db:"active_stages"`
}
