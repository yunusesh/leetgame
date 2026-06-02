package types

import "time"

type StreakInfo struct {
	Streak          int        `json:"streak"`
	LastPracticedAt *time.Time `json:"last_practiced_at"`
}
