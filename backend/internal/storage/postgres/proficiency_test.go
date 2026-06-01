package postgres

import (
	"math"
	"testing"
)

// adaptiveLR mirrors the SQL: GREATEST(floor, scale / sqrt(sessionCount + 1))
func adaptiveLR(sessionCount int, scale, floor float64) float64 {
	lr := scale / math.Sqrt(float64(sessionCount)+1)
	if lr < floor {
		return floor
	}
	return lr
}

// applyEMA mirrors the full SQL update for a given session
func applyEMA(current float64, sessionCount int, sessionScore, scale, floor float64) float64 {
	lr := adaptiveLR(sessionCount, scale, floor)
	return current + lr*(sessionScore-current)
}

func TestAdaptiveLR_MonotonicallyDecreasing(t *testing.T) {
	scale, floor := 0.25, 0.05
	prev := adaptiveLR(0, scale, floor)
	for n := 1; n <= 30; n++ {
		curr := adaptiveLR(n, scale, floor)
		if curr > prev+0.0001 {
			t.Errorf("lr increased at n=%d: prev=%f curr=%f", n, prev, curr)
		}
		prev = curr
	}
}

func TestAdaptiveLR_FloorAtSession24(t *testing.T) {
	cases := []struct {
		name  string
		scale float64
		floor float64
	}{
		{"Easy", 0.15, 0.03},
		{"Medium", 0.25, 0.05},
		{"Hard", 0.35, 0.07},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// should hit floor at or before session 24
			lr := adaptiveLR(24, c.scale, c.floor)
			if lr != c.floor {
				t.Errorf("%s: expected floor %f at session 24, got %f", c.name, c.floor, lr)
			}
		})
	}
}

func TestAdaptiveLR_DifficultyOrdering(t *testing.T) {
	for n := 0; n <= 30; n++ {
		easy := adaptiveLR(n, 0.15, 0.03)
		medium := adaptiveLR(n, 0.25, 0.05)
		hard := adaptiveLR(n, 0.35, 0.07)
		if !(hard >= medium && medium >= easy) {
			t.Errorf("ordering violated at n=%d: easy=%f medium=%f hard=%f", n, easy, medium, hard)
		}
	}
}

func TestAdaptiveLR_NeverExceedsOne(t *testing.T) {
	cases := [][2]float64{{0.15, 0.03}, {0.25, 0.05}, {0.35, 0.07}}
	for _, c := range cases {
		lr := adaptiveLR(0, c[0], c[1])
		if lr > 1.0 {
			t.Errorf("lr > 1 at session 0: scale=%f got %f", c[0], lr)
		}
	}
}

func TestApplyEMA_FirstSession(t *testing.T) {
	// First session (count=0) with Medium: lr=0.25, score 1.0 from 0.0 → expect 0.25
	got := applyEMA(0.0, 0, 1.0, 0.25, 0.05)
	want := 0.25
	if diff := got - want; diff < -0.001 || diff > 0.001 {
		t.Errorf("first session: got %f want %f", got, want)
	}
}

func TestApplyEMA_FloorSession(t *testing.T) {
	// At floor (count=24), Medium lr=0.05, score 0.9, session 0.0 → expect 0.9 - 0.05*0.9 = 0.855
	got := applyEMA(0.9, 24, 0.0, 0.25, 0.05)
	want := 0.9 - 0.05*0.9
	if diff := got - want; diff < -0.001 || diff > 0.001 {
		t.Errorf("floor session: got %f want %f", got, want)
	}
}
