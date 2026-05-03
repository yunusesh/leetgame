# leetgame MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP web app where users describe their LeetCode problem-solving approach in natural language and Claude evaluates correctness, guiding them with Socratic questions until they get both the algorithm and complexity right.

**Architecture:** Stateless Go/Fiber backend with two endpoints (`GET /api/problems/random`, `POST /api/chat`). The client sends full conversation history on every chat turn. Claude is the sole evaluator — it returns JSON with a `stage` field that drives all UI state transitions.

**Tech Stack:** Go 1.24 / Fiber v2 / pgx v5 / Anthropic Messages API (net/http) / React + Vite + TypeScript / Python 3 for one-time seed script

---

## File Map

**New files — backend:**
- `backend/db/schema.sql` — problems table DDL
- `backend/internal/models/problem.go` — Problem struct
- `backend/internal/constants/routes.go` — route path constants
- `backend/internal/settings/claude.go` — Claude settings struct
- `backend/internal/claude/claude.go` — Client interface + AnthropicClient impl
- `backend/internal/storage/postgres/problems.go` — GetRandomProblem + GetProblemByID
- `backend/internal/types/chat_request.go` — ChatRequest + Validate()
- `backend/internal/types/chat_request_test.go` — validation tests
- `backend/internal/types/chat_response.go` — ChatResponse
- `backend/internal/handlers/problems.go` — GetRandomProblem handler
- `backend/internal/handlers/chat.go` — Chat handler

**Modified files — backend:**
- `backend/internal/storage/storage.go` — add GetRandomProblem + GetProblemByID
- `backend/internal/settings/settings.go` — add Claude sub-struct
- `backend/internal/handlers/handler_service.go` — add claudeClient field
- `backend/internal/handlers/routes.go` — register new routes
- `backend/internal/server/server.go` — pass Claude config
- `backend/cmd/server/main.go` — pass Claude API key + model

**New files — seed:**
- `scripts/seed.py`
- `scripts/requirements.txt`

**New files — frontend:**
- `frontend/` — Vite React TS project (created via CLI)
- `frontend/src/types.ts`
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/ProblemView.tsx`
- `frontend/src/components/ChatView.tsx`
- `frontend/src/components/CompleteView.tsx`
- `frontend/vite.config.ts` — proxy `/api` to backend

---

## Task 1: DB Schema

**Files:**
- Create: `backend/db/schema.sql`

- [ ] **Step 1: Create schema file**

```sql
-- backend/db/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS problems (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  difficulty  TEXT        NOT NULL,
  topic_tags  TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Apply schema to your local DB**

```bash
psql $DATABASE_URL -f backend/db/schema.sql
```

Expected: no errors, `CREATE TABLE` printed.

- [ ] **Step 3: Commit**

```bash
git add backend/db/schema.sql
git commit -m "feat: add problems table schema"
```

---

## Task 2: Seed Script

**Files:**
- Create: `scripts/requirements.txt`
- Create: `scripts/seed.py`

- [ ] **Step 1: Create requirements.txt**

```
datasets==3.5.0
psycopg2-binary==2.9.10
```

- [ ] **Step 2: Create seed.py**

```python
#!/usr/bin/env python3
"""One-time script to seed the problems table from the HuggingFace dataset."""

import os
import uuid
import psycopg2
from datasets import load_dataset

DATABASE_URL = os.environ["DATABASE_URL"]

print("Loading dataset...")
ds = load_dataset("newfacade/LeetCodeDataset", split="train")

print(f"Loaded {len(ds)} problems. Inspecting columns...")
print("Columns:", ds.column_names)
print("Sample row:", {k: ds[0][k] for k in ds.column_names})
```

- [ ] **Step 3: Install deps and run the inspect step**

```bash
cd scripts
pip install -r requirements.txt
DATABASE_URL="<your-db-url>" python seed.py
```

Look at the printed column names and sample row — confirm which fields map to `slug`, `title`, `description`, `difficulty`, `topic_tags`. Update the mapping in Step 4 accordingly based on what you see.

- [ ] **Step 4: Complete seed.py with the correct field names**

Replace the contents of `scripts/seed.py` with the full version (adjust field names if the inspect output differs from `title_slug`, `title`, `content`, `difficulty`, `topic_tags`):

```python
#!/usr/bin/env python3
"""One-time script to seed the problems table from the HuggingFace dataset."""

import os
import uuid
import psycopg2
from datasets import load_dataset

DATABASE_URL = os.environ["DATABASE_URL"]

print("Loading dataset...")
ds = load_dataset("newfacade/LeetCodeDataset", split="train")
print(f"Loaded {len(ds)} problems.")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

inserted = 0
skipped = 0

for row in ds:
    slug        = row.get("title_slug") or row.get("slug") or ""
    title       = row.get("title") or ""
    description = row.get("content") or row.get("description") or ""
    difficulty  = row.get("difficulty") or ""
    raw_tags    = row.get("topic_tags") or []
    topic_tags  = [t if isinstance(t, str) else t.get("name", "") for t in raw_tags]

    if not slug or not title or not description or not difficulty:
        skipped += 1
        continue

    cur.execute(
        """
        INSERT INTO problems (id, slug, title, description, difficulty, topic_tags)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        (str(uuid.uuid4()), slug, title, description, difficulty, topic_tags),
    )
    inserted += 1

conn.commit()
cur.close()
conn.close()
print(f"Done. inserted={inserted} skipped={skipped}")
```

- [ ] **Step 5: Run the full seed**

```bash
DATABASE_URL="<your-db-url>" python seed.py
```

Expected output ends with `Done. inserted=<N> skipped=<small number>`.

- [ ] **Step 6: Verify rows were inserted**

```bash
psql $DATABASE_URL -c "SELECT COUNT(*), difficulty FROM problems GROUP BY difficulty ORDER BY difficulty;"
```

Expected: rows grouped by Easy / Medium / Hard totalling ~2,800+.

- [ ] **Step 7: Commit**

```bash
cd ..
git add scripts/
git commit -m "feat: add HuggingFace dataset seed script"
```

---

## Task 3: Problem Model + Storage

**Files:**
- Create: `backend/internal/models/problem.go`
- Modify: `backend/internal/storage/storage.go`
- Create: `backend/internal/storage/postgres/problems.go`

- [ ] **Step 1: Create Problem model**

```go
// backend/internal/models/problem.go
package models

import (
	"time"

	"github.com/google/uuid"
)

type Problem struct {
	Id          uuid.UUID `json:"id" db:"id"`
	Slug        string    `json:"slug" db:"slug"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description" db:"description"`
	Difficulty  string    `json:"difficulty" db:"difficulty"`
	TopicTags   []string  `json:"topic_tags" db:"topic_tags"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
```

- [ ] **Step 2: Update storage interface**

Replace the contents of `backend/internal/storage/storage.go`:

```go
// backend/internal/storage/storage.go
package storage

import (
	"context"

	"leetgame/internal/models"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
}
```

- [ ] **Step 3: Create postgres/problems.go**

```go
// backend/internal/storage/postgres/problems.go
package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) GetRandomProblem(ctx context.Context) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, created_at
		FROM problems
		ORDER BY RANDOM()
		LIMIT 1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			return models.Problem{}, err
		}
		return problem, nil
	})
}

func (p *Postgres) GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, created_at
		FROM problems
		WHERE id = $1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q, id)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if err == pgx.ErrNoRows {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{"id": id.String()}),
				)
			}
			return models.Problem{}, err
		}
		return problem, nil
	})
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/models/problem.go backend/internal/storage/
git commit -m "feat: add problem model and storage methods"
```

---

## Task 4: Claude Package

**Files:**
- Create: `backend/internal/claude/claude.go`
- Create: `backend/internal/settings/claude.go`
- Modify: `backend/internal/settings/settings.go`

- [ ] **Step 1: Create settings/claude.go**

```go
// backend/internal/settings/claude.go
package settings

type Claude struct {
	APIKey string `env:"API_KEY,required"`
	Model  string `env:"MODEL" envDefault:"claude-haiku-4-5-20251001"`
}
```

- [ ] **Step 2: Add Claude to root Settings**

```go
// backend/internal/settings/settings.go
package settings

import "github.com/caarlos0/env/v11"

type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
	Claude  Claude  `envPrefix:"CLAUDE_"`
}

func Load() (Settings, error) {
	return env.ParseAs[Settings]()
}
```

- [ ] **Step 3: Create the Claude package**

```go
// backend/internal/claude/claude.go
package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"leetgame/internal/models"
)

const systemPromptTemplate = `You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.

Problem Title: %s
Problem Description:
%s

Evaluate the candidate's approach in two stages. The current stage is: %s

Stage 1 — Algorithm (stage = "algorithm"):
Assess whether the described algorithm is correct and would solve the problem efficiently.
- If incorrect or incomplete: ask exactly ONE focused Socratic question to guide their thinking. Never reveal the answer.
- If correct: briefly acknowledge it and set stage to "complexity" in your response.

Stage 2 — Complexity (stage = "complexity"):
Ask the candidate to state both time complexity and space complexity.
- If incorrect: ask one focused guiding question. Keep stage as "complexity".
- If both time and space complexity are correct: confirm and set stage to "complete".

Respond ONLY with this exact JSON — no other text before or after:
{"message": "<your response to the candidate>", "stage": "<algorithm|complexity|complete>"}`

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type EvaluateResponse struct {
	Message string `json:"message"`
	Stage   string `json:"stage"`
}

type Client interface {
	Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string) (EvaluateResponse, error)
}

type AnthropicClient struct {
	apiKey string
	model  string
}

func New(apiKey, model string) *AnthropicClient {
	return &AnthropicClient{apiKey: apiKey, model: model}
}

func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, history []ChatMessage, userMessage string) (EvaluateResponse, error) {
	systemPrompt := fmt.Sprintf(systemPromptTemplate, problem.Title, problem.Description, stage)

	messages := make([]map[string]string, 0, len(history)+1)
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userMessage})

	body := map[string]any{
		"model":      c.model,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages":   messages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return EvaluateResponse{}, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return EvaluateResponse{}, fmt.Errorf("claude API returned status %d", resp.StatusCode)
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to decode claude response: %w", err)
	}
	if len(apiResp.Content) == 0 {
		return EvaluateResponse{}, fmt.Errorf("empty content from claude")
	}

	var evalResp EvaluateResponse
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &evalResp); err != nil {
		return EvaluateResponse{}, fmt.Errorf("failed to parse claude JSON: %w (raw: %s)", err, apiResp.Content[0].Text)
	}

	return evalResp, nil
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/claude/ backend/internal/settings/
git commit -m "feat: add Claude client and settings"
```

---

## Task 5: Chat Types + Validation Tests

**Files:**
- Create: `backend/internal/types/chat_request.go`
- Create: `backend/internal/types/chat_request_test.go`
- Create: `backend/internal/types/chat_response.go`

- [ ] **Step 1: Write the failing tests first**

```go
// backend/internal/types/chat_request_test.go
package types_test

import (
	"testing"

	"leetgame/internal/types"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestChatRequest_Validate_valid(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.New(),
		Stage:     "algorithm",
		History:   []types.HistoryMessage{},
		Message:   "I would use a hash map",
	}
	assert.Empty(t, req.Validate())
}

func TestChatRequest_Validate_missing_problem_id(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.Nil,
		Stage:     "algorithm",
		History:   []types.HistoryMessage{},
		Message:   "I would use a hash map",
	}
	errs := req.Validate()
	assert.Contains(t, errs, "problem_id")
}

func TestChatRequest_Validate_empty_message(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.New(),
		Stage:     "algorithm",
		History:   []types.HistoryMessage{},
		Message:   "   ",
	}
	errs := req.Validate()
	assert.Contains(t, errs, "message")
}

func TestChatRequest_Validate_invalid_stage(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.New(),
		Stage:     "complete",
		History:   []types.HistoryMessage{},
		Message:   "some message",
	}
	errs := req.Validate()
	assert.Contains(t, errs, "stage")
}

func TestChatRequest_Validate_complexity_stage_valid(t *testing.T) {
	req := types.ChatRequest{
		ProblemID: uuid.New(),
		Stage:     "complexity",
		History:   []types.HistoryMessage{},
		Message:   "O(n) time, O(n) space",
	}
	assert.Empty(t, req.Validate())
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/types/... -v
```

Expected: compilation error — `types.ChatRequest` not defined yet.

- [ ] **Step 3: Create chat_request.go**

```go
// backend/internal/types/chat_request.go
package types

import (
	"strings"

	"github.com/google/uuid"
)

type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	ProblemID uuid.UUID        `json:"problem_id"`
	Stage     string           `json:"stage"`
	History   []HistoryMessage `json:"history"`
	Message   string           `json:"message"`
}

func (r ChatRequest) Validate() map[string]string {
	errs := map[string]string{}
	if r.ProblemID == uuid.Nil {
		errs["problem_id"] = "required"
	}
	if strings.TrimSpace(r.Message) == "" {
		errs["message"] = "required"
	}
	validStages := map[string]bool{"algorithm": true, "complexity": true}
	if !validStages[r.Stage] {
		errs["stage"] = "must be 'algorithm' or 'complexity'"
	}
	return errs
}
```

- [ ] **Step 4: Create chat_response.go**

```go
// backend/internal/types/chat_response.go
package types

type ChatResponse struct {
	Message string `json:"message"`
	Stage   string `json:"stage"`
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/types/... -v
```

Expected:
```
--- PASS: TestChatRequest_Validate_valid
--- PASS: TestChatRequest_Validate_missing_problem_id
--- PASS: TestChatRequest_Validate_empty_message
--- PASS: TestChatRequest_Validate_invalid_stage
--- PASS: TestChatRequest_Validate_complexity_stage_valid
PASS
```

- [ ] **Step 6: Commit**

```bash
git add backend/internal/types/
git commit -m "feat: add chat request/response types with validation"
```

---

## Task 6: Problem Handler

**Files:**
- Create: `backend/internal/constants/routes.go`
- Create: `backend/internal/handlers/problems.go`
- Modify: `backend/internal/handlers/handler_service.go`
- Modify: `backend/internal/handlers/routes.go`

- [ ] **Step 1: Create routes constants**

```go
// backend/internal/constants/routes.go
package constants

const (
	RandomProblem = "/api/problems/random"
	Chat          = "/api/chat"
)
```

Note: these full-path constants are for reference only (e.g., cache middleware). The route registration in `routes.go` uses the sub-paths directly (`/problems/random`, `/chat`) inside the `app.Route("/api", ...)` group.

- [ ] **Step 2: Create the problem handler**

```go
// backend/internal/handlers/problems.go
package handlers

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetRandomProblem(c *fiber.Ctx) error {
	problem, err := hs.storage.GetRandomProblem(c.Context())
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}
```

- [ ] **Step 3: Update HandlerService to accept claudeClient**

```go
// backend/internal/handlers/handler_service.go
package handlers

import (
	"log/slog"

	"leetgame/internal/claude"
	"leetgame/internal/storage"
)

type HandlerService struct {
	storage      storage.Storage
	logger       *slog.Logger
	claudeClient claude.Client
}

type HandlerServiceConfig struct {
	Storage      storage.Storage
	Logger       *slog.Logger
	ClaudeClient claude.Client
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:      cfg.Storage,
		logger:       cfg.Logger,
		claudeClient: cfg.ClaudeClient,
	}
}
```

- [ ] **Step 4: Register the routes**

```go
// backend/internal/handlers/routes.go
package handlers

import (
	"net/http"

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

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
		})

		api.Post("/chat", hs.Chat)
	})
}
```

- [ ] **Step 5: Update server.go to pass ClaudeClient**

```go
// backend/internal/server/server.go
package server

import (
	"log/slog"
	"net/http"

	"leetgame/internal/claude"
	"leetgame/internal/handlers"
	"leetgame/internal/storage"
	"leetgame/internal/xerrors"

	go_json "github.com/goccy/go-json"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

type Config struct {
	Storage      storage.Storage
	Logger       *slog.Logger
	ClaudeClient claude.Client
}

func New(cfg *Config) *fiber.App {
	app := createFiberApp()
	setupStatic(app)

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:      cfg.Storage,
		Logger:       cfg.Logger,
		ClaudeClient: cfg.ClaudeClient,
	})
	setupMiddleware(app)
	service.RegisterRoutes(app)

	return app
}

func createFiberApp() *fiber.App {
	return fiber.New(fiber.Config{
		JSONEncoder:  go_json.Marshal,
		JSONDecoder:  go_json.Unmarshal,
		ErrorHandler: xerrors.ErrorHandler,
	})
}

func setupMiddleware(app *fiber.App) {
	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(redirectMiddleware())
	app.Use(cors.New())
}

func setupStatic(app *fiber.App) {
	app.Static("/", "internal/static")
}

func redirectMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		if path != "/" && !isApiOrWsPath(path) {
			return c.Redirect("/", http.StatusFound)
		}
		return c.Next()
	}
}

func isApiOrWsPath(path string) bool {
	return (len(path) >= 4 && path[:4] == "/api") || (len(path) >= 3 && path[:3] == "/ws")
}
```

- [ ] **Step 6: Update main.go**

```go
// backend/cmd/server/main.go
package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
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

	claudeClient := claude.New(settings.Claude.APIKey, settings.Claude.Model)

	app := server.New(&server.Config{
		Storage: pg,
		Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
		})),
		ClaudeClient: claudeClient,
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

- [ ] **Step 7: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 8: Add CLAUDE_API_KEY to .env and smoke test the endpoint**

Add to `backend/.env`:
```
CLAUDE_API_KEY=<your-anthropic-api-key>
```

Then run the server and test:
```bash
cd backend && go run ./cmd/server
```

In another terminal:
```bash
curl http://localhost:42069/api/problems/random | jq .
```

Expected: JSON object with `id`, `slug`, `title`, `description`, `difficulty`, `topic_tags`.

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: add problem handler and wire Claude client"
```

---

## Task 7: Chat Handler

**Files:**
- Create: `backend/internal/handlers/chat.go`

- [ ] **Step 1: Create the chat handler**

```go
// backend/internal/handlers/chat.go
package handlers

import (
	"net/http"

	"leetgame/internal/claude"
	"leetgame/internal/types"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) Chat(c *fiber.Ctx) error {
	var req types.ChatRequest
	if err := c.BodyParser(&req); err != nil {
		return xerrors.InvalidJSON()
	}
	if errs := req.Validate(); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}

	problem, err := hs.storage.GetProblemByID(c.Context(), req.ProblemID)
	if err != nil {
		return err
	}

	history := make([]claude.ChatMessage, len(req.History))
	for i, h := range req.History {
		history[i] = claude.ChatMessage{Role: h.Role, Content: h.Content}
	}

	result, err := hs.claudeClient.Evaluate(c.Context(), problem, req.Stage, history, req.Message)
	if err != nil {
		hs.logger.Error("claude evaluate failed", "error", err)
		return xerrors.InternalServerError()
	}

	return c.Status(http.StatusOK).JSON(types.ChatResponse{
		Message: result.Message,
		Stage:   result.Stage,
	})
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 3: Smoke test the chat endpoint**

Start the server. First get a problem ID:
```bash
PROBLEM_ID=$(curl -s http://localhost:42069/api/problems/random | jq -r '.id')
```

Then send a chat turn:
```bash
curl -s -X POST http://localhost:42069/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"problem_id\":\"$PROBLEM_ID\",\"stage\":\"algorithm\",\"history\":[],\"message\":\"I would use a brute force nested loop\"}" \
  | jq .
```

Expected: JSON with `message` (a Socratic question from Claude) and `stage` set to `"algorithm"`.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/chat.go
git commit -m "feat: add chat handler"
```

---

## Task 8: Frontend Scaffold

**Files:**
- Create: `frontend/` (via Vite CLI)
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`

- [ ] **Step 1: Scaffold the Vite React TS project**

```bash
cd /Users/aaronkim/projects/leetgame
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: Configure Vite proxy**

Replace `frontend/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:42069',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 3: Create types.ts**

```ts
// frontend/src/types.ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type Stage = 'algorithm' | 'complexity' | 'complete'

export interface ChatResponse {
  message: string
  stage: Stage
}
```

- [ ] **Step 4: Create api.ts**

```ts
// frontend/src/api.ts
import type { Problem, ChatMessage, Stage, ChatResponse } from './types'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch('/api/problems/random')
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function sendChat(
  problemId: string,
  stage: Stage,
  history: ChatMessage[],
  message: string,
): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_id: problemId, stage, history, message }),
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 5: Verify dev server starts**

```bash
cd frontend && npm run dev
```

Expected: Vite prints `Local: http://localhost:5173/` with no errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold React/Vite frontend with API client"
```

---

## Task 9: App State + Problem View

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/ProblemView.tsx`

- [ ] **Step 1: Create ProblemView component**

```tsx
// frontend/src/components/ProblemView.tsx
import type { Problem } from '../types'

const difficultyColor: Record<string, string> = {
  Easy: '#00b8a9',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

export function ProblemView({ problem }: { problem: Problem }) {
  return (
    <div style={{ width: '50%', overflowY: 'auto', padding: '24px', borderRight: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>{problem.title}</h2>
        <span style={{
          color: difficultyColor[problem.difficulty] ?? '#666',
          fontWeight: 600,
          fontSize: '14px',
        }}>
          {problem.difficulty}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {problem.topic_tags.map(tag => (
          <span key={tag} style={{
            background: '#f0f0f0',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '12px',
            color: '#444',
          }}>
            {tag}
          </span>
        ))}
      </div>

      <div
        style={{ lineHeight: 1.7, fontSize: '15px' }}
        dangerouslySetInnerHTML={{ __html: problem.description }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Replace App.tsx with app state shell**

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'
import type { Problem, ChatMessage, Stage } from './types'
import { getRandomProblem, sendChat } from './api'
import { ProblemView } from './components/ProblemView'
import { ChatView } from './components/ChatView'
import { CompleteView } from './components/CompleteView'

export default function App() {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>('algorithm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProblem = async () => {
    try {
      setError(null)
      const p = await getRandomProblem()
      setProblem(p)
      setHistory([])
      setStage('algorithm')
    } catch (e) {
      setError('Failed to load problem. Is the backend running?')
    }
  }

  useEffect(() => { loadProblem() }, [])

  const handleSubmit = async (message: string) => {
    if (!problem) return
    setLoading(true)
    setError(null)
    const userMsg: ChatMessage = { role: 'user', content: message }
    const nextHistory = [...history, userMsg]
    setHistory(nextHistory)
    try {
      const resp = await sendChat(problem.id, stage, history, message)
      setHistory([...nextHistory, { role: 'assistant', content: resp.message }])
      setStage(resp.stage)
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (error && !problem) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#ff375f' }}>{error}</div>
  )

  if (!problem) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>Loading problem...</div>
  )

  if (stage === 'complete') return <CompleteView onNext={loadProblem} />

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <ProblemView problem={problem} />
      <ChatView
        history={history}
        stage={stage}
        loading={loading}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify the app compiles (ChatView and CompleteView stubs needed)**

Create stubs so TypeScript is happy:

```bash
mkdir -p frontend/src/components

cat > frontend/src/components/ChatView.tsx << 'EOF'
export function ChatView(_: any) { return <div>ChatView stub</div> }
EOF

cat > frontend/src/components/CompleteView.tsx << 'EOF'
export function CompleteView(_: any) { return <div>CompleteView stub</div> }
EOF
```

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: add App state, ProblemView, and component stubs"
```

---

## Task 10: Chat View

**Files:**
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Replace the stub with the real ChatView**

```tsx
// frontend/src/components/ChatView.tsx
import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, Stage } from '../types'

const stageBanner: Record<string, string> = {
  algorithm: 'Describe your algorithm',
  complexity: 'Algorithm ✓ — Now describe the time and space complexity',
}

interface Props {
  history: ChatMessage[]
  stage: Stage
  loading: boolean
  error: string | null
  onSubmit: (message: string) => void
}

export function ChatView({ history, stage, loading, error, onSubmit }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div style={{ width: '50%', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        padding: '12px 20px',
        background: '#f8f9fa',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '14px',
        fontWeight: 600,
        color: '#333',
      }}>
        {stageBanner[stage]}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {history.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: '12px',
            background: msg.role === 'user' ? '#0070f3' : '#f0f0f0',
            color: msg.role === 'user' ? '#fff' : '#222',
            fontSize: '14px',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#888', fontSize: '13px', fontStyle: 'italic' }}>
            Thinking...
          </div>
        )}
        {error && (
          <div style={{ alignSelf: 'flex-start', color: '#ff375f', fontSize: '13px' }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} style={{
        padding: '16px',
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        gap: '8px',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any) } }}
          placeholder="Describe your approach..."
          disabled={loading}
          rows={3}
          style={{
            flex: 1,
            resize: 'none',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '0 20px',
            borderRadius: '8px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add frontend/src/components/ChatView.tsx
git commit -m "feat: add ChatView component"
```

---

## Task 11: Complete View + End-to-End Test

**Files:**
- Modify: `frontend/src/components/CompleteView.tsx`

- [ ] **Step 1: Replace the stub with the real CompleteView**

```tsx
// frontend/src/components/CompleteView.tsx
interface Props {
  onNext: () => void
}

export function CompleteView({ onNext }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      gap: '24px',
    }}>
      <h1 style={{ margin: 0, fontSize: '32px' }}>Nice work!</h1>
      <p style={{ margin: 0, color: '#555', fontSize: '16px' }}>
        You nailed the algorithm and complexity.
      </p>
      <button
        onClick={onNext}
        style={{
          padding: '12px 32px',
          borderRadius: '8px',
          background: '#0070f3',
          color: '#fff',
          border: 'none',
          fontSize: '16px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Next Problem
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no errors.

- [ ] **Step 3: End-to-end manual test**

Start the backend:
```bash
cd backend && go run ./cmd/server
```

Start the frontend (separate terminal):
```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` and verify:
1. A random problem loads with title, difficulty, tags, and description
2. Typing an approach and submitting shows a response from Claude in the chat
3. Responding incorrectly triggers a Socratic follow-up question
4. Responding correctly to the algorithm transitions the stage banner to "Algorithm ✓ — Now describe the complexity"
5. Answering the complexity correctly shows the CompleteView
6. Clicking "Next Problem" loads a new problem and resets the chat

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/components/CompleteView.tsx
git commit -m "feat: add CompleteView and complete MVP"
```
