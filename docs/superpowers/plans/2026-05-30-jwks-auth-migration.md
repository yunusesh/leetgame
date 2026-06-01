# JWKS Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy HS256 JWT shared secret with Supabase's asymmetric JWKS verification, fetching public keys from the discovery endpoint instead of storing a secret.

**Architecture:** A new `NewKeyfunc(supabaseURL string)` helper in the middleware package fetches the JWKS public-key set from `<supabaseURL>/auth/v1/.well-known/jwks.json` using `github.com/MicahParks/keyfunc/v2`. Both `RequireAuth` and `OptionalAuth` accept a `jwt.Keyfunc` instead of a string secret. The keyfunc is created once at startup in `main.go` (nil if `AUTH_SUPABASE_URL` is unset) and threaded through `server.Config` → `HandlerServiceConfig` → middleware. A nil keyfunc in `OptionalAuth` is a passthrough — this preserves the local dev workflow where no Supabase project is configured.

**Tech Stack:** Go + Fiber v2, `github.com/golang-jwt/jwt/v5`, `github.com/MicahParks/keyfunc/v2` (new dependency)

---

## File Map

**Modified:**
- `backend/internal/settings/auth.go` — `SupabaseJWTSecret string` → `SupabaseURL string`
- `backend/internal/middleware/auth.go` — `RequireAuth`/`OptionalAuth` signatures change to `jwt.Keyfunc`; remove HS256 check; add nil-keyfunc passthrough in `OptionalAuth`
- `backend/internal/middleware/auth_test.go` — switch from HS256 shared secret to RSA key pair; update all helpers and WrongAlgorithm tests
- `backend/internal/handlers/handler_service.go` — `jwtSecret string` → `keyfunc jwt.Keyfunc`
- `backend/internal/handlers/routes.go` — `hs.jwtSecret` → `hs.keyfunc`
- `backend/internal/server/server.go` — `JWTSecret string` → `Keyfunc jwt.Keyfunc`
- `backend/cmd/server/main.go` — create JWKS keyfunc from `settings.Auth.SupabaseURL` if set; `defer jwks.EndBackground()`
- `backend/.env.example` — replace `AUTH_SUPABASE_JWT_SECRET` with `AUTH_SUPABASE_URL`

**Created:**
- `backend/internal/middleware/jwks.go` — `NewKeyfunc(supabaseURL string) (*keyfunc.JWKS, error)`
- `backend/internal/middleware/jwks_test.go` — verify `NewKeyfunc` hits the correct JWKS path

---

## Task 1: Install keyfunc/v2 dependency and update settings

**Files:**
- Run: `go get github.com/MicahParks/keyfunc/v2` in `backend/`
- Modify: `backend/internal/settings/auth.go`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the keyfunc/v2 dependency**

```bash
cd backend && go get github.com/MicahParks/keyfunc/v2
```

Expected: module added to `go.mod` and `go.sum` with no errors.

- [ ] **Step 2: Update settings/auth.go**

Replace the entire file:

```go
package settings

type Auth struct {
	SupabaseURL string `env:"SUPABASE_URL"`
}
```

No `required` tag — an empty `AUTH_SUPABASE_URL` means auth is disabled (OptionalAuth passes through). This is intentional; local dev without a Supabase project still works.

- [ ] **Step 3: Update .env.example**

In `backend/.env.example`, replace:

```
AUTH_SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

With:

```
AUTH_SUPABASE_URL=https://your-project-ref.supabase.co
```

- [ ] **Step 4: Verify compilation (expect one error)**

```bash
cd backend && go build ./... 2>&1
```

Expected: one compile error in `cmd/server/main.go` referencing `settings.Auth.SupabaseJWTSecret`. This is expected — it will be fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/settings/auth.go backend/.env.example backend/go.mod backend/go.sum
git commit -m "feat: add keyfunc/v2 dependency and change auth setting to SupabaseURL"
```

---

## Task 2: Create JWKS keyfunc helper

**Files:**
- Create: `backend/internal/middleware/jwks.go`
- Create: `backend/internal/middleware/jwks_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/middleware/jwks_test.go`:

```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"leetgame/internal/middleware"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewKeyfunc_FetchesFromCorrectPath(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"keys":[]}`))
	}))
	defer srv.Close()

	jwks, err := middleware.NewKeyfunc(srv.URL)
	require.NoError(t, err)
	defer jwks.EndBackground()

	assert.Equal(t, "/auth/v1/.well-known/jwks.json", gotPath)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && go test ./internal/middleware/... -run TestNewKeyfunc_FetchesFromCorrectPath -v 2>&1
```

Expected: compile error — `middleware.NewKeyfunc` is not defined yet.

- [ ] **Step 3: Create middleware/jwks.go**

```go
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
```

**Verify the API before running tests:** Run `go doc github.com/MicahParks/keyfunc/v2 Get` to confirm `Get` exists with signature `Get(url string, options Options) (*JWKS, error)`. If the v2 API differs (e.g., uses a different function name or options struct field names), adjust accordingly. The `JWKS` struct must expose a `Keyfunc` method with signature `func(*jwt.Token) (interface{}, error)` and an `EndBackground()` method.

- [ ] **Step 4: Run to verify it passes**

```bash
cd backend && go test ./internal/middleware/... -run TestNewKeyfunc_FetchesFromCorrectPath -v 2>&1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/middleware/jwks.go backend/internal/middleware/jwks_test.go
git commit -m "feat: add NewKeyfunc JWKS helper for Supabase asymmetric JWT verification"
```

---

## Task 3: Rewrite auth middleware and tests

**Files:**
- Modify: `backend/internal/middleware/auth.go`
- Modify: `backend/internal/middleware/auth_test.go`

The signatures change from `(jwtSecret string)` to `(kf jwt.Keyfunc)`. Tests switch from HS256 to RS256 to match Supabase's actual token format. `OptionalAuth` gains a nil-keyfunc passthrough. The `WrongAlgorithm` tests are inverted: previously an RS256 token was wrong for HS256 middleware; now an HS256 token is wrong for an RS256 keyfunc.

- [ ] **Step 1: Write new auth_test.go**

Replace the entire `backend/internal/middleware/auth_test.go`:

```go
package middleware_test

import (
	"crypto/rand"
	"crypto/rsa"
	"fmt"
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

// makeTestKeyfunc generates an RSA-2048 key pair and returns a jwt.Keyfunc
// that accepts RS256 tokens signed with the corresponding private key.
func makeTestKeyfunc(t *testing.T) (*rsa.PrivateKey, jwt.Keyfunc) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	kf := func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return &privateKey.PublicKey, nil
	}
	return privateKey, kf
}

// makeToken creates an RS256-signed JWT with the given sub and expiry.
func makeToken(t *testing.T, privateKey *rsa.PrivateKey, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": sub,
		"exp": jwt.NewNumericDate(expiry),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)
	return signed
}

// makeHMACToken creates an HS256-signed JWT — used only to test wrong-algorithm rejection.
func makeHMACToken(t *testing.T, sub string, expiry time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": sub,
		"exp": jwt.NewNumericDate(expiry),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte("some-hmac-secret"))
	require.NoError(t, err)
	return signed
}

func makeOptionalApp(kf jwt.Keyfunc) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.OptionalAuth(kf))
	return app
}

func TestRequireAuth_ValidToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New()
	app.Use(middleware.RequireAuth(kf))
	uid := uuid.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		got, err := xcontext.GetUserID(c)
		require.NoError(t, err)
		assert.Equal(t, uid, got)
		return c.SendStatus(http.StatusOK)
	})

	token := makeToken(t, privateKey, uid.String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRequireAuth_MissingHeader(t *testing.T) {
	_, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_ExpiredToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_InvalidSignature(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(time.Hour))
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_NonUUIDSub(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, "not-a-uuid", time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestRequireAuth_WrongAlgorithm(t *testing.T) {
	_, kf := makeTestKeyfunc(t) // RS256 keyfunc
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		return c.Status(http.StatusUnauthorized).SendString("unauthorized")
	}})
	app.Use(middleware.RequireAuth(kf))
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	// HS256 token is the wrong algorithm for an RS256 keyfunc
	token := makeHMACToken(t, uuid.New().String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

// OptionalAuth tests — all cases must pass through with 200, never return 401.

func TestOptionalAuth_NilKeyfunc(t *testing.T) {
	app := makeOptionalApp(nil)
	app.Get("/test", func(c *fiber.Ctx) error {
		_, err := xcontext.GetUserID(c)
		assert.Error(t, err, "user ID should not be set when keyfunc is nil")
		return c.SendStatus(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_NoHeader(t *testing.T) {
	_, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c *fiber.Ctx) error {
		_, err := xcontext.GetUserID(c)
		assert.Error(t, err, "user ID should not be set for unauthenticated request")
		return c.SendStatus(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_ValidToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	uid := uuid.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		got, err := xcontext.GetUserID(c)
		require.NoError(t, err)
		assert.Equal(t, uid, got)
		return c.SendStatus(http.StatusOK)
	})

	token := makeToken(t, privateKey, uid.String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_ExpiredToken(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(-time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_InvalidSignature(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, uuid.New().String(), time.Now().Add(time.Hour))
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_NonUUIDSub(t *testing.T) {
	privateKey, kf := makeTestKeyfunc(t)
	app := makeOptionalApp(kf)
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	token := makeToken(t, privateKey, "not-a-uuid", time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestOptionalAuth_WrongAlgorithm(t *testing.T) {
	_, kf := makeTestKeyfunc(t) // RS256 keyfunc
	app := makeOptionalApp(kf)
	app.Get("/test", func(c *fiber.Ctx) error { return c.SendStatus(http.StatusOK) })

	// HS256 token is wrong algorithm — OptionalAuth silently passes through
	token := makeHMACToken(t, uuid.New().String(), time.Now().Add(time.Hour))
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && go test ./internal/middleware/... -run "TestRequireAuth|TestOptionalAuth" -v 2>&1
```

Expected: compile error — `middleware.RequireAuth` and `middleware.OptionalAuth` still take `string`.

- [ ] **Step 3: Rewrite middleware/auth.go**

Replace the entire `backend/internal/middleware/auth.go`:

```go
package middleware

import (
	"strings"

	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func RequireAuth(kf jwt.Keyfunc) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return xerrors.UnauthorizedError()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, kf)
		if err != nil || !token.Valid {
			return xerrors.UnauthorizedError()
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		sub, ok := claims["sub"].(string)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return xerrors.UnauthorizedError()
		}

		xcontext.SetUserID(c, uid)
		return c.Next()
	}
}

// OptionalAuth sets the user ID in context if a valid JWT is present, but does not
// block unauthenticated requests. A nil keyfunc disables verification entirely (passthrough).
func OptionalAuth(kf jwt.Keyfunc) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if kf == nil {
			return c.Next()
		}

		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Next()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, kf)
		if err != nil || !token.Valid {
			return c.Next()
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Next()
		}
		sub, ok := claims["sub"].(string)
		if !ok {
			return c.Next()
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return c.Next()
		}

		xcontext.SetUserID(c, uid)
		return c.Next()
	}
}
```

- [ ] **Step 4: Run middleware tests**

```bash
cd backend && go test ./internal/middleware/... -v 2>&1
```

Expected: all 14 tests PASS (`TestNewKeyfunc_FetchesFromCorrectPath` + 6 `RequireAuth` tests + 7 `OptionalAuth` tests including `TestOptionalAuth_NilKeyfunc`). There will still be a compile error in `cmd/server/main.go` when running `go build ./...` — that's fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/middleware/auth.go backend/internal/middleware/auth_test.go
git commit -m "feat: migrate auth middleware from HS256 secret to jwt.Keyfunc (RS256)"
```

---

## Task 4: Update wiring

**Files:**
- Modify: `backend/internal/handlers/handler_service.go`
- Modify: `backend/internal/handlers/routes.go`
- Modify: `backend/internal/server/server.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Update handler_service.go**

Replace the entire `backend/internal/handlers/handler_service.go`:

```go
package handlers

import (
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

type HandlerService struct {
	storage   storage.Storage
	logger    *slog.Logger
	llmClient llm.Client
	keyfunc   jwt.Keyfunc
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
	Keyfunc   jwt.Keyfunc
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
		keyfunc:   cfg.Keyfunc,
	}
}
```

- [ ] **Step 2: Update routes.go**

In `backend/internal/handlers/routes.go`, change line 20:

```go
api.Use(middleware.OptionalAuth(hs.jwtSecret))
```

To:

```go
api.Use(middleware.OptionalAuth(hs.keyfunc))
```

- [ ] **Step 3: Update server/server.go**

Replace the entire `backend/internal/server/server.go`:

```go
package server

import (
	"log/slog"

	"leetgame/internal/handlers"
	"leetgame/internal/llm"
	"leetgame/internal/storage"
	"leetgame/internal/xerrors"

	go_json "github.com/goccy/go-json"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	AllowedOrigins string
	Keyfunc        jwt.Keyfunc
}

func New(cfg *Config) *fiber.App {
	app := fiber.New(fiber.Config{
		JSONEncoder:  go_json.Marshal,
		JSONDecoder:  go_json.Unmarshal,
		ErrorHandler: xerrors.ErrorHandler,
	})

	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.AllowedOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:   cfg.Storage,
		Logger:    cfg.Logger,
		LLMClient: cfg.LLMClient,
		Keyfunc:   cfg.Keyfunc,
	})
	service.RegisterRoutes(app)

	return app
}
```

- [ ] **Step 4: Update cmd/server/main.go**

Replace the entire `backend/cmd/server/main.go`:

```go
package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
	"leetgame/internal/llm"
	"leetgame/internal/middleware"
	"leetgame/internal/ollama"
	"leetgame/internal/server"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Error("failed to load .env file", "error", err)
	}

	// Render sets PORT; our settings use SERVER_PORT via envPrefix.
	if port := os.Getenv("PORT"); port != "" && os.Getenv("SERVER_PORT") == "" {
		os.Setenv("SERVER_PORT", port)
	}

	settings, err := settings.Load()
	if err != nil {
		slog.Error("failed to load settings", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(settings.Log.Level),
	})))

	pg := postgres.New(&postgres.Config{
		DbUrl: settings.Storage.DbUrl,
	})

	var llmClient llm.Client
	switch settings.LLM.Provider {
	case "ollama":
		llmClient = ollama.New(settings.LLM.OllamaURL, settings.LLM.Model, settings.LLM.APIKey)
	default:
		llmClient = claude.New(settings.LLM.APIKey, settings.LLM.Model)
	}

	var kf jwt.Keyfunc
	if settings.Auth.SupabaseURL != "" {
		jwks, err := middleware.NewKeyfunc(settings.Auth.SupabaseURL)
		if err != nil {
			slog.Error("failed to initialize JWKS", "error", err)
			os.Exit(1)
		}
		defer jwks.EndBackground()
		kf = jwks.Keyfunc
	}

	app := server.New(&server.Config{
		Storage: pg,
		Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
		})),
		LLMClient:      llmClient,
		AllowedOrigins: settings.Server.AllowedOrigins,
		Keyfunc:        kf,
	})

	go func() {
		if err := app.Listen(":" + settings.Server.Port); err != nil {
			slog.Error("failed to start server", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	slog.Info("shutting down server")

	if err := app.Shutdown(); err != nil {
		slog.Error("failed to shutdown server", slog.String("error", err.Error()))
	}

	slog.Info("server shutdown")
}
```

- [ ] **Step 5: Verify full compilation**

```bash
cd backend && go build ./... 2>&1
```

Expected: no errors.

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && go test ./... 2>&1
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handlers/handler_service.go backend/internal/handlers/routes.go backend/internal/server/server.go backend/cmd/server/main.go
git commit -m "feat: wire JWKS keyfunc through server config and main"
```
