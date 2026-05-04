package types

type ProblemTag struct {
	Name  string `json:"name" db:"name"`
	Count int    `json:"count" db:"count"`
}
