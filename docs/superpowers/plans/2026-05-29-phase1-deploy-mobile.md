# Phase 1: Deploy + Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make leetgame mobile-responsive and deploy it to Render with Supabase Auth (Google OAuth), so it's accessible from any device.

**Architecture:** Separate Render deployments — a static site for the React frontend and a Go web service for the backend. Supabase handles auth (Google OAuth) and the database. The frontend passes a Supabase JWT on every API request; a backend middleware validates it.

**Tech Stack:** React + Tailwind (frontend), Go + Fiber (backend), Supabase Auth + Postgres, Ollama cloud LLM, Render hosting.

---

## File Map

**Frontend — new files:**
- `frontend/src/lib/supabase.ts` — Supabase JS client singleton
- `frontend/src/components/LoginPage.tsx` — Google sign-in screen
- `frontend/.env.example` — documents required env vars

**Frontend — modified files:**
- `frontend/src/App.tsx` — mobile layout + auth gate (check session, show LoginPage or app)
- `frontend/src/components/ProblemView.tsx` — collapsible on mobile, full-width on mobile
- `frontend/src/components/ChatView.tsx` — full-width on mobile
- `frontend/src/api.ts` — prefix calls with VITE_API_URL, attach JWT Authorization header

**Backend — new files:**
- `backend/internal/xcontext/user.go` — SetUserID / GetUserID typed Fiber context accessors
- `backend/internal/middleware/auth.go` — RequireAuth factory: validates Supabase JWT, sets user ID in context
- `backend/internal/settings/auth.go` — Auth settings struct (SupabaseJWTSecret)
- `backend/internal/middleware/auth_test.go` — unit tests for RequireAuth

**Backend — modified files:**
- `backend/internal/xerrors/http.go` — add UnauthorizedError()
- `backend/internal/settings/settings.go` — add Auth field
- `backend/internal/settings/server.go` — add AllowedOrigins field
- `backend/internal/server/server.go` — remove static serving + redirect middleware, configure CORS with AllowedOrigins
- `backend/internal/handlers/routes.go` — apply RequireAuth middleware
- `backend/cmd/server/main.go` — PORT fallback, pass AllowedOrigins + JWT secret
- `backend/.env.example` — add AUTH_SUPABASE_JWT_SECRET and SERVER_ALLOWED_ORIGINS

**Infra — new files:**
- `render.yaml` — Render blueprint (backend web service + frontend static site)

---

## Task 1: Responsive UI

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ProblemView.tsx`
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Update App.tsx — use dvh and stack vertically on mobile**

Replace the outer div class and the practice view layout div:

```tsx
// In the return statement, outer container:
<div className="flex flex-col h-dvh">

// In practiceView(), the div wrapping ProblemView + ChatView:
<div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
```

Full updated `practiceView` return for the split view:
```tsx
return (
  <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
    <ProblemView
      key={problem.id}
      problem={problem}
      onSkip={() => void loadNextProblem()}
      onRandom={() => void loadRandomNextProblem()}
      playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
    />
    <ChatView
      history={history}
      stage={stage}
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      streamingMessage={streamingMessage}
    />
  </div>
)
```

- [ ] **Step 2: Update ProblemView.tsx — collapsible on mobile**

Replace the entire component with the mobile-aware version:

```tsx
import { useState } from 'react'
import type { Problem } from '../types'
import { cn } from '../lib/utils'

const difficultyColor: Record<string, string> = {
  Easy: 'text-easy',
  Medium: 'text-medium',
  Hard: 'text-hard',
}

interface SearchPlaylistSummary {
  q: string
  difficulty: string
  tags: string[]
  tagMatch: 'and' | 'or'
}

export function ProblemView({
  problem,
  onSkip,
  onRandom,
  playlistSummary,
}: {
  problem: Problem
  onSkip: () => void
  onRandom: () => void
  playlistSummary?: SearchPlaylistSummary | null
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)

  return (
    <div className={cn(
      "border-b md:border-b-0 md:border-r border-border md:w-1/2 md:overflow-y-auto",
      problemOpen ? "flex-1 overflow-y-auto" : "shrink-0"
    )}>
      {/* mobile toggle bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <span className="flex-1 text-sm font-medium truncate text-muted-foreground">
          {titleOpen ? problem.title : 'Problem'}
        </span>
        <span className={cn(
          "text-xs font-semibold",
          difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
        )}>
          {problem.difficulty}
        </span>
        <button
          onClick={() => setProblemOpen(o => !o)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
        >
          {problemOpen ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>

      {/* content: always visible on desktop, toggled on mobile */}
      <div className={cn("p-6", !problemOpen && "hidden md:block")}>
        {playlistSummary && (
          <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Search playlist
                </span>
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  {playlistSummary.tagMatch === 'and' ? 'All tags' : 'Any tag'}
                </span>
              </div>
              <button
                type="button"
                onClick={onRandom}
                className="rounded-md border border-muted-foreground/40 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Random instead
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {playlistSummary.q && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  Query: {playlistSummary.q}
                </span>
              )}
              {playlistSummary.difficulty && (
                <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
                  Difficulty: {playlistSummary.difficulty}
                </span>
              )}
              {playlistSummary.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 mb-3">
          <h2
            onClick={() => setTitleOpen(o => !o)}
            className="m-0 flex-1 cursor-pointer select-none relative"
            title={titleOpen ? '' : 'Click to reveal'}
          >
            <span className={cn(
              "transition-all duration-200 block",
              titleOpen ? "opacity-100 blur-0" : "opacity-0 blur-[5px]"
            )}>
              {problem.title}
            </span>
            {!titleOpen && (
              <span className="absolute inset-0 flex items-center text-muted-foreground text-base font-normal italic">
                Click to reveal title
              </span>
            )}
          </h2>
          <span className={cn(
            "font-semibold text-sm hidden md:block",
            difficultyColor[problem.difficulty] ?? 'text-muted-foreground'
          )}>
            {problem.difficulty}
          </span>
          <button
            onClick={onSkip}
            className="ml-auto px-3 py-1 text-xs cursor-pointer border border-muted-foreground/50 rounded-md bg-transparent text-muted-foreground hover:bg-muted transition-colors"
          >
            Next →
          </button>
        </div>

        <div className="mb-5">
          <button
            onClick={() => setTagsOpen(o => !o)}
            className="bg-transparent border-none cursor-pointer text-muted-foreground text-xs p-0 hover:text-foreground transition-colors"
          >
            {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
          </button>
          {tagsOpen && (
            <div className="flex gap-2 flex-wrap mt-2">
              {problem.topic_tags.map(tag => (
                <span
                  key={tag}
                  className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="leading-[1.7] text-[15px] whitespace-pre-wrap">
          {problem.description}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update ChatView.tsx — full-width on mobile**

Change the outer div class from `w-1/2 flex flex-col min-h-0` to:
```tsx
<div className="flex-1 flex flex-col min-h-0 md:w-1/2">
```

- [ ] **Step 4: Start the dev server and verify on a narrow viewport**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` and resize the browser window to ~390px wide (iPhone size). Verify:
- Problem panel shows a collapsed header bar ("Problem", difficulty badge, "Show ▾" button)
- Tapping "Show ▾" expands the problem content
- Chat takes full width and the input sits at the bottom
- On desktop (>768px) the side-by-side layout is unchanged

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/ProblemView.tsx frontend/src/components/ChatView.tsx
git commit -m "feat: responsive layout — collapsible problem panel on mobile"
```

---

## Task 2: API URL for production

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/.env.example`

- [ ] **Step 1: Add API_URL prefix to api.ts**

Add at the top of `frontend/src/api.ts`, after the imports:

```ts
const API_URL = import.meta.env.VITE_API_URL ?? ''
```

Then prefix every `fetch('/api/...')` call with `API_URL`. Replace all occurrences:

```ts
// getRandomProblem
const res = await fetch(`${API_URL}/api/problems/random`)

// getRandomProblemFiltered
const res = await fetch(`${API_URL}/api/problems/random?${params.toString()}`)

// searchProblems
const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, { signal })

// getProblemTags
const res = await fetch(`${API_URL}/api/problems/tags`, { signal })

// streamChat
const res = await fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ problem_id: problemId, stage, history, message }),
  signal,
})
```

- [ ] **Step 2: Create frontend/.env.example**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Leave empty in development (Vite proxy handles /api). Set to backend URL in production.
VITE_API_URL=
```

- [ ] **Step 3: Verify dev still works (proxy still routes /api)**

```bash
cd frontend && npm run dev
```

Load the app. Problems should load normally — `API_URL` is empty string in dev, so fetch paths remain `/api/...` and the Vite proxy still routes them.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/.env.example
git commit -m "feat: add VITE_API_URL prefix for production backend routing"
```

---

## Task 3: Ollama API key

**Files:**
- Modify: `backend/internal/ollama/ollama.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add apiKey field to OllamaClient and set Authorization header**

In `backend/internal/ollama/ollama.go`, change the struct and constructor:

```go
type OllamaClient struct {
	baseURL    string
	model      string
	apiKey     string
	httpClient *http.Client
}

func New(baseURL, model, apiKey string) *OllamaClient {
	return &OllamaClient{
		baseURL:    baseURL,
		model:      model,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Minute},
	}
}
```

In the `Evaluate` method, add the header after `req.Header.Set("content-type", "application/json")`:

```go
req.Header.Set("content-type", "application/json")
if c.apiKey != "" {
    req.Header.Set("Authorization", "Bearer "+c.apiKey)
}
```

- [ ] **Step 2: Update main.go to pass the API key**

In `backend/cmd/server/main.go`, change the ollama case:

```go
case "ollama":
    llmClient = ollama.New(settings.LLM.OllamaURL, settings.LLM.Model, settings.LLM.APIKey)
```

- [ ] **Step 3: Run the backend and verify it starts**

```bash
cd backend && go run ./cmd/server
```

Expected: server starts without compilation errors. The API key header is only sent when `LLM_API_KEY` is set, so local dev still works without it.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/ollama/ollama.go backend/cmd/server/main.go
git commit -m "feat: pass API key as Bearer token in Ollama requests"
```

---

## Task 4: Backend cleanup + CORS

**Files:**
- Modify: `backend/internal/settings/server.go`
- Modify: `backend/internal/server/server.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add AllowedOrigins to server settings**

Replace `backend/internal/settings/server.go`:

```go
package settings

type Server struct {
	Port           string `env:"PORT" envDefault:"42069"`
	LogLevel       string `env:"LOG_LEVEL" envDefault:"INFO"`
	AllowedOrigins string `env:"ALLOWED_ORIGINS" envDefault:"*"`
}
```

- [ ] **Step 2: Update server.go — remove static serving + redirect, configure CORS**

Replace `backend/internal/server/server.go`:

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
)

type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	AllowedOrigins string
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
	})
	service.RegisterRoutes(app)

	return app
}
```

- [ ] **Step 3: Update main.go — PORT fallback + pass AllowedOrigins**

In `backend/cmd/server/main.go`, add the PORT fallback before `settings.Load()`, and pass `AllowedOrigins` to `server.New`:

```go
package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
	"leetgame/internal/llm"
	"leetgame/internal/ollama"
	"leetgame/internal/server"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/utils"

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

	app := server.New(&server.Config{
		Storage: pg,
		Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
		})),
		LLMClient:      llmClient,
		AllowedOrigins: settings.Server.AllowedOrigins,
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

- [ ] **Step 4: Run the backend and verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/settings/server.go backend/internal/server/server.go backend/cmd/server/main.go
git commit -m "feat: configure CORS with allowed origins, remove static serving, add PORT fallback"
```

---

## Task 5: Auth middleware (backend)

**Files:**
- Modify: `backend/internal/xerrors/http.go`
- Create: `backend/internal/xcontext/user.go`
- Create: `backend/internal/middleware/auth.go`
- Create: `backend/internal/middleware/auth_test.go`
- Create: `backend/internal/settings/auth.go`
- Modify: `backend/internal/settings/settings.go`
- Modify: `backend/internal/handlers/routes.go`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the JWT library**

```bash
cd backend && go get github.com/golang-jwt/jwt/v5
```

Expected: `go.mod` and `go.sum` updated.

- [ ] **Step 2: Add UnauthorizedError to xerrors**

In `backend/internal/xerrors/http.go`, add after `InvalidJSON()`:

```go
func UnauthorizedError() HTTPError {
	return NewHTTPError(http.StatusUnauthorized, errors.New("unauthorized"))
}
```

- [ ] **Step 3: Create xcontext/user.go**

```go
package xcontext

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type userIDKey struct{}

func SetUserID(c *fiber.Ctx, id uuid.UUID) {
	c.Locals(userIDKey{}, id)
}

func GetUserID(c *fiber.Ctx) (uuid.UUID, error) {
	id, ok := c.Locals(userIDKey{}).(uuid.UUID)
	if !ok {
		return uuid.UUID{}, fmt.Errorf("user id not set in context")
	}
	return id, nil
}
```

- [ ] **Step 4: Write the failing auth middleware tests**

Create `backend/internal/middleware/auth_test.go`:

```go
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
	// tamper with the token
	token = token[:len(token)-4] + "xxxx"

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
```

- [ ] **Step 5: Run tests — verify they fail (middleware doesn't exist yet)**

```bash
cd backend && go test ./internal/middleware/... -v
```

Expected: compilation error — `middleware` package not found.

- [ ] **Step 6: Create middleware/auth.go**

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

func RequireAuth(jwtSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return xerrors.UnauthorizedError()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, xerrors.UnauthorizedError()
			}
			return []byte(jwtSecret), nil
		})
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
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
cd backend && go test ./internal/middleware/... -v
```

Expected:
```
--- PASS: TestRequireAuth_ValidToken
--- PASS: TestRequireAuth_MissingHeader
--- PASS: TestRequireAuth_ExpiredToken
--- PASS: TestRequireAuth_InvalidSignature
PASS
```

- [ ] **Step 8: Create settings/auth.go**

```go
package settings

type Auth struct {
	SupabaseJWTSecret string `env:"SUPABASE_JWT_SECRET,required"`
}
```

- [ ] **Step 9: Add Auth to settings.go**

```go
type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
	LLM     LLM     `envPrefix:"LLM_"`
	Auth    Auth    `envPrefix:"AUTH_"`
}
```

- [ ] **Step 10: Apply RequireAuth in routes.go**

Replace `backend/internal/handlers/routes.go`:

```go
package handlers

import (
	"net/http"

	"leetgame/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RegisterRoutes(app *fiber.App) {
	app.Route("/api", func(api fiber.Router) {
		api.Get("/healthcheck", func(c *fiber.Ctx) error {
			if err := hs.storage.Ping(c.Context()); err != nil {
				return c.Status(http.StatusInternalServerError).SendString("failed to ping database")
			}
			return c.SendStatus(http.StatusOK)
		})

		api.Use(middleware.RequireAuth(hs.jwtSecret))

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
			problems.Get("/tags", hs.GetProblemTags)
			problems.Get("/", hs.GetProblems)
		})

		api.Post("/chat", hs.Chat)
	})
}
```

- [ ] **Step 11: Add jwtSecret field to HandlerService**

In `backend/internal/handlers/handler_service.go`:

```go
package handlers

import (
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/storage"
)

type HandlerService struct {
	storage   storage.Storage
	logger    *slog.Logger
	llmClient llm.Client
	jwtSecret string
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
	JWTSecret string
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
		jwtSecret: cfg.JWTSecret,
	}
}
```

- [ ] **Step 12: Pass JWTSecret through server.go and main.go**

In `backend/internal/server/server.go`, add `JWTSecret string` to `Config` and pass it to `NewService`:

```go
type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	AllowedOrigins string
	JWTSecret      string
}

func New(cfg *Config) *fiber.App {
	// ... fiber.New, middleware setup unchanged ...

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:   cfg.Storage,
		Logger:    cfg.Logger,
		LLMClient: cfg.LLMClient,
		JWTSecret: cfg.JWTSecret,
	})
	service.RegisterRoutes(app)

	return app
}
```

In `backend/cmd/server/main.go`, pass `JWTSecret` to `server.New`:

```go
app := server.New(&server.Config{
	Storage: pg,
	Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
	})),
	LLMClient:      llmClient,
	AllowedOrigins: settings.Server.AllowedOrigins,
	JWTSecret:      settings.Auth.SupabaseJWTSecret,
})
```

- [ ] **Step 13: Add AUTH_SUPABASE_JWT_SECRET to .env.example**

Append to `backend/.env.example`:

```
AUTH_SUPABASE_JWT_SECRET=your-supabase-jwt-secret
SERVER_ALLOWED_ORIGINS=https://your-frontend.onrender.com
```

- [ ] **Step 14: Add a placeholder to local .env for development**

Add to `backend/.env` (the actual file, not example):

```
AUTH_SUPABASE_JWT_SECRET=dev-placeholder-replace-with-real-secret
SERVER_ALLOWED_ORIGINS=http://localhost:5173
```

Note: The real JWT secret comes from Supabase dashboard → Settings → API → JWT Secret.

- [ ] **Step 15: Build and verify**

```bash
cd backend && go build ./...
```

Expected: compiles without errors.

- [ ] **Step 16: Commit**

```bash
git add backend/internal/xerrors/http.go \
        backend/internal/xcontext/user.go \
        backend/internal/middleware/auth.go \
        backend/internal/middleware/auth_test.go \
        backend/internal/settings/auth.go \
        backend/internal/settings/settings.go \
        backend/internal/handlers/handler_service.go \
        backend/internal/handlers/routes.go \
        backend/internal/server/server.go \
        backend/cmd/server/main.go \
        backend/.env.example \
        backend/go.mod backend/go.sum
git commit -m "feat: add Supabase JWT auth middleware"
```

---

## Task 6: Auth frontend

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/components/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Install Supabase JS client**

```bash
cd frontend && npm install @supabase/supabase-js
```

- [ ] **Step 2: Create frontend/src/lib/supabase.ts**

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 3: Create a local .env for the frontend**

Create `frontend/.env` (gitignored):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=
```

Get these values from the Supabase dashboard → Settings → API.

- [ ] **Step 4: Create frontend/src/components/LoginPage.tsx**

```tsx
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
      <h1 className="text-2xl font-bold">leetgame</h1>
      <p className="text-muted-foreground text-sm text-center">
        Practice algorithm pattern recognition
      </p>
      <button
        onClick={() => void handleLogin()}
        className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
      >
        Sign in with Google
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Update App.tsx — add auth gate**

Add these imports at the top:

```tsx
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { LoginPage } from './components/LoginPage'
```

Add session state inside the `App` component, before existing state:

```tsx
const [session, setSession] = useState<Session | null>(null)
const [authLoading, setAuthLoading] = useState(true)

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
    setAuthLoading(false)
  })

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })

  return () => subscription.unsubscribe()
}, [])
```

Update the return statement to gate on auth:

```tsx
if (authLoading) {
  return (
    <div className="flex flex-col h-dvh items-center justify-center text-muted-foreground text-sm">
      Loading...
    </div>
  )
}

if (!session) {
  return (
    <div className="flex flex-col h-dvh">
      <LoginPage />
    </div>
  )
}

return (
  <div className="flex flex-col h-dvh">
    <NavBar view={view} onNavigate={setView} />
    {view === 'search'
      ? <SearchPage onSelectProblem={selectProblem} />
      : practiceView()
    }
  </div>
)
```

- [ ] **Step 6: Update api.ts — attach JWT to all requests**

Add a helper after the `API_URL` line:

```ts
import { supabase } from './lib/supabase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}
```

Update each fetch call to spread in the auth headers:

```ts
// getRandomProblem
const res = await fetch(`${API_URL}/api/problems/random`, {
  headers: await authHeaders(),
})

// getRandomProblemFiltered
const res = await fetch(`${API_URL}/api/problems/random?${params.toString()}`, {
  headers: await authHeaders(),
})

// searchProblems
const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
  signal,
  headers: await authHeaders(),
})

// getProblemTags
const res = await fetch(`${API_URL}/api/problems/tags`, {
  signal,
  headers: await authHeaders(),
})

// streamChat — merge with existing headers
const headers = {
  'Content-Type': 'application/json',
  ...(await authHeaders()),
}
const res = await fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ problem_id: problemId, stage, history, message }),
  signal,
})
```

- [ ] **Step 7: Configure Google OAuth in Supabase**

In the Supabase dashboard:
1. Go to Authentication → Providers → Google
2. Enable Google, enter your Google OAuth client ID + secret (from Google Cloud Console)
3. Add `http://localhost:5173` and your Render frontend URL to the redirect URLs allowlist
4. In Authentication → URL Configuration, set Site URL to your Render frontend URL

- [ ] **Step 8: Start the dev server and verify the login flow**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. You should see the login page. Sign in with Google — you should be redirected back to the app and see problems loading.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/supabase.ts \
        frontend/src/components/LoginPage.tsx \
        frontend/src/App.tsx \
        frontend/src/api.ts \
        frontend/package.json frontend/package-lock.json
git commit -m "feat: add Supabase Auth with Google OAuth"
```

---

## Task 7: Render deployment

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Create Supabase hosted project**

1. Go to supabase.com → New project
2. Note the project URL, anon key, and JWT secret (Settings → API)
3. Run the seed script against the hosted DB:
   ```bash
   DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres python3 scripts/seed.py
   ```
   (Connection string from Supabase → Settings → Database → Connection string → URI)

- [ ] **Step 2: Create render.yaml**

Create at the repo root:

```yaml
services:
  - type: web
    name: leetgame-backend
    env: go
    rootDir: backend
    buildCommand: go build -o server ./cmd/server
    startCommand: ./server
    envVars:
      - key: STORAGE_DB_URL
        sync: false
      - key: LLM_PROVIDER
        value: ollama
      - key: LLM_MODEL
        value: gemma4:31b-cloud
      - key: LLM_OLLAMA_URL
        value: https://ollama.com
      - key: LLM_API_KEY
        sync: false
      - key: LOG_LEVEL
        value: INFO
      - key: AUTH_SUPABASE_JWT_SECRET
        sync: false
      - key: SERVER_ALLOWED_ORIGINS
        sync: false

  - type: static
    name: leetgame-frontend
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    envVars:
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_ANON_KEY
        sync: false
      - key: VITE_API_URL
        sync: false
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

- [ ] **Step 3: Deploy to Render**

1. Push this branch to GitHub
2. Go to render.com → New → Blueprint → connect your repo
3. Render will detect `render.yaml` and create both services
4. Fill in the `sync: false` env vars in the Render dashboard:
   - Backend: `STORAGE_DB_URL` (Supabase connection string), `LLM_API_KEY` (from `ollama login` token — find it at `~/.ollama/credentials`), `AUTH_SUPABASE_JWT_SECRET`, `SERVER_ALLOWED_ORIGINS` (your frontend Render URL, e.g. `https://leetgame-frontend.onrender.com`)
   - Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (your backend Render URL, e.g. `https://leetgame-backend.onrender.com`)

- [ ] **Step 4: Verify the deployed app**

1. Open your frontend Render URL on your phone
2. Verify the login page appears
3. Sign in with Google
4. Verify a problem loads and chat works

- [ ] **Step 5: Commit**

```bash
git add render.yaml
git commit -m "feat: add Render deployment blueprint"
```
