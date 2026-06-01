package models

import "time"

type ProficiencySnapshot struct {
	Topic        string    `json:"topic"         db:"topic"`
	Stage        string    `json:"stage"         db:"stage"`
	Score        float64   `json:"score"         db:"score"`
	SnapshotDate time.Time `json:"snapshot_date" db:"snapshot_date"`
}
