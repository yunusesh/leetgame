package types

type SearchQuery struct {
	Q          string `query:"q"`
	Difficulty string `query:"difficulty"`
	Tags       string `query:"tags"`
	TagMatch   string `query:"tag_match"`
	ExcludeID  string `query:"exclude_id"`
	Page       int    `query:"page"`
	PageSize   int    `query:"page_size"`
}
