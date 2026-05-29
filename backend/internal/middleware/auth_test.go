package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"leetgame/internal/middleware"
	"leetgame/internal/xcontext"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-secret-key"

func makeToken(t *testing.T, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": sub,
		"exp": jwt.NewNumericDate(expiry),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(testSecret))
	require.NoError(t, err)
	return signed
}

func TestRequireAuth_ValidToken(t *testing.T) {
	app := fiber.New()
	app.Use(middleware.RequireAuth(testSecret))
	uid := uuid.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		got, err := xcontext.GetUserID(c)
		require.NoError(t, err)
		assert.Equal(t, uid, got)
		return c.SendStatus(http.StatusOK)
	})

	token := makeToken(t, uid.String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(testSecret))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_ExpiredToken(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(testSecret))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, uuid.New().String(), time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_InvalidSignature(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(testSecret))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, uuid.New().String(), time.Now().Add(time.Hour))
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
