package postgres

import "testing"

// computeEMA mirrors the SQL formula in UpsertTopicProficiency: score + lr*(session-score)
func computeEMA(current, sessionScore, learningRate float64) float64 {
	return current + learningRate*(sessionScore-current)
}

func TestComputeEMA(t *testing.T) {
	tests := []struct {
		name       string
		current    float64
		session    float64
		lr         float64
		wantApprox float64
	}{
		{"cold start good session easy", 0.0, 0.8, 0.1, 0.08},
		{"cold start good session hard", 0.0, 0.8, 0.3, 0.24},
		{"mid score improve medium", 0.5, 0.8, 0.2, 0.56},
		{"mid score decline medium", 0.5, 0.2, 0.2, 0.44},
		{"high score perfect session", 0.9, 1.0, 0.2, 0.92},
		{"high score bad session", 0.9, 0.0, 0.2, 0.72},
		{"score does not exceed 1.0 direction", 1.0, 1.0, 0.2, 1.0},
		{"score does not go below 0.0 direction", 0.0, 0.0, 0.2, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := computeEMA(tt.current, tt.session, tt.lr)
			diff := got - tt.wantApprox
			if diff < -0.001 || diff > 0.001 {
				t.Errorf("computeEMA(%v, %v, %v) = %v, want ~%v", tt.current, tt.session, tt.lr, got, tt.wantApprox)
			}
		})
	}
}
