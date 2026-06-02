package handlers

import (
	"testing"
)

func TestNextStage_MiddleStage(t *testing.T) {
	got := nextStage("pattern", []string{"pattern", "algorithm", "tc_sc"})
	if got != "algorithm" {
		t.Errorf("want 'algorithm', got %q", got)
	}
}

func TestNextStage_LastStage(t *testing.T) {
	got := nextStage("tc_sc", []string{"pattern", "algorithm", "tc_sc"})
	if got != "complete" {
		t.Errorf("want 'complete', got %q", got)
	}
}

func TestNextStage_SingleStage(t *testing.T) {
	got := nextStage("pattern", []string{"pattern"})
	if got != "complete" {
		t.Errorf("want 'complete', got %q", got)
	}
}

func TestNextStage_NotFound(t *testing.T) {
	got := nextStage("edge_cases", []string{"pattern", "tc_sc"})
	if got != "complete" {
		t.Errorf("want 'complete', got %q", got)
	}
}
