package types

import "leetgame/internal/models"

type ProblemSearchResponse struct {
	Problems []models.Problem `json:"problems"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
	Total    int              `json:"total"`
}
