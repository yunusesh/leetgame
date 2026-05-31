package constants

var ValidStageIDs = map[string]bool{
	"edge_cases":  true,
	"brute_force": true,
	"pattern":     true,
	"algorithm":   true,
	"tc_sc":       true,
}

var CanonicalStageOrder = []string{"edge_cases", "brute_force", "pattern", "algorithm", "tc_sc"}

func CanonicalStageIndex(s string) int {
	for i, v := range CanonicalStageOrder {
		if v == s {
			return i
		}
	}
	return -1
}
