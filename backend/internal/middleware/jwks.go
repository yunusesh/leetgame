package middleware

import (
	"time"

	"github.com/MicahParks/keyfunc/v2"
)

// NewKeyfunc creates a JWKS client for the given Supabase project URL.
// It fetches the JWKS immediately on creation and starts a background refresh goroutine.
// Call EndBackground() when the server shuts down to stop the goroutine.
func NewKeyfunc(supabaseURL string) (*keyfunc.JWKS, error) {
	jwksURL := supabaseURL + "/auth/v1/.well-known/jwks.json"
	return keyfunc.Get(jwksURL, keyfunc.Options{
		RefreshInterval: time.Hour,
	})
}
