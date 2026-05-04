package types

type SearchQuery struct {
	Q          string `query:"q"`
	Difficulty string `query:"difficulty"`
	Tags       string `query:"tags"`
}
