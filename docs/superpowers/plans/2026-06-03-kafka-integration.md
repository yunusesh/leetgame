# Kafka Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kafka as the transport for session evaluation events — web server publishes, a standalone evaluator binary consumes — with graceful goroutine fallback when Kafka is not configured.

**Architecture:** The chat handler calls `hs.dispatcher.Dispatch(...)` in a goroutine; `EvaluationDispatcher` is an interface with two implementations: `GoroutineDispatcher` (current behavior, used when `KAFKA_BROKER_URL` is unset) and `KafkaDispatcher` (publishes a `SessionCompletedEvent`, falls back to inline evaluation on publish error). A new `cmd/evaluator` binary consumes from the topic, runs `EvaluateSession` via LLM, and writes proficiency scores to Postgres.

**Tech Stack:** `github.com/segmentio/kafka-go` (pure Go Kafka client), Upstash Kafka (production), `confluentinc/cp-kafka:7.6.0` KRaft (local dev), Go 1.24.1.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/go.mod` | Modify | Add `github.com/segmentio/kafka-go` |
| `backend/internal/settings/kafka.go` | Create | `Kafka` settings struct |
| `backend/internal/settings/settings.go` | Modify | Add `Kafka` field |
| `backend/internal/kafka/events.go` | Create | `SessionCompletedEvent` struct |
| `backend/internal/kafka/producer.go` | Create | `Producer` — publishes events to Kafka |
| `backend/internal/kafka/consumer.go` | Create | `Consumer` — reads events, retries, commits |
| `backend/internal/evaluation/evaluation.go` | Create | `RunSession`, `RunSessionWithError`, `EvaluationDispatcher` interface |
| `backend/internal/evaluation/goroutine_dispatcher.go` | Create | `GoroutineDispatcher` — calls `RunSession` directly |
| `backend/internal/evaluation/kafka_dispatcher.go` | Create | `KafkaDispatcher` — publishes; falls back to `RunSession` on error |
| `backend/internal/handlers/handler_service.go` | Modify | Add `dispatcher evaluation.EvaluationDispatcher` field |
| `backend/internal/handlers/chat.go` | Modify | Replace `go hs.runSessionEvaluation(...)` with `go hs.dispatcher.Dispatch(...)` |
| `backend/internal/server/server.go` | Modify | Add `Dispatcher` to `Config`, pass through to `HandlerServiceConfig` |
| `backend/cmd/server/main.go` | Modify | Init dispatcher (Kafka or goroutine) based on settings |
| `backend/cmd/evaluator/main.go` | Create | Consumer binary entry point |
| `backend/docker-compose.yml` | Create | Single-node Kafka in KRaft mode |

---

### Task 1: Add kafka-go dependency + Kafka settings

**Files:**
- Modify: `backend/go.mod` (via `go get`)
- Create: `backend/internal/settings/kafka.go`
- Modify: `backend/internal/settings/settings.go`

- [ ] **Step 1: Add kafka-go dependency**

```bash
cd backend && go get github.com/segmentio/kafka-go
```

Expected: module added to `go.mod` and `go.sum`, no errors.

- [ ] **Step 2: Create `backend/internal/settings/kafka.go`**

```go
package settings

type Kafka struct {
	BrokerURL    string `env:"BROKER_URL"    envDefault:""`
	Topic        string `env:"TOPIC"         envDefault:"session_completed"`
	GroupID      string `env:"GROUP_ID"      envDefault:"evaluator"`
	TLS          bool   `env:"TLS"           envDefault:"false"`
	SASLUser     string `env:"SASL_USER"     envDefault:""`
	SASLPassword string `env:"SASL_PASSWORD" envDefault:""`
}
```

- [ ] **Step 3: Add `Kafka` field to `backend/internal/settings/settings.go`**

Current `Settings` struct:
```go
type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
	LLM     LLM     `envPrefix:"LLM_"`
	Auth    Auth    `envPrefix:"AUTH_"`
}
```

Replace with:
```go
type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
	LLM     LLM     `envPrefix:"LLM_"`
	Auth    Auth    `envPrefix:"AUTH_"`
	Kafka   Kafka   `envPrefix:"KAFKA_"`
}
```

- [ ] **Step 4: Verify build**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/settings/kafka.go backend/internal/settings/settings.go
git commit -m "feat: add kafka-go dependency and Kafka settings"
```

---

### Task 2: `internal/kafka` — events + producer

**Files:**
- Create: `backend/internal/kafka/events.go`
- Create: `backend/internal/kafka/producer.go`
- Create: `backend/internal/kafka/producer_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/kafka/producer_test.go`:

```go
package kafka_test

import (
	"encoding/json"
	"testing"
	"time"

	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionCompletedEvent_JSONRoundtrip(t *testing.T) {
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	problemID := uuid.MustParse("00000000-0000-0000-0000-000000000002")

	event := kafka.SessionCompletedEvent{
		UserID: userID,
		Problem: models.Problem{
			Id:         problemID,
			Title:      "Two Sum",
			Difficulty: "Easy",
			TopicTags:  []string{"Array", "Hash Table"},
			CreatedAt:  time.Time{},
		},
		ActiveStages: []string{"pattern", "tc_sc"},
		History: []llm.ChatMessage{
			{Role: "user", Content: "I would use a hash map"},
			{Role: "assistant", Content: "Can you explain why?"},
		},
	}

	data, err := json.Marshal(event)
	require.NoError(t, err)

	var got kafka.SessionCompletedEvent
	require.NoError(t, json.Unmarshal(data, &got))

	assert.Equal(t, event.UserID, got.UserID)
	assert.Equal(t, event.Problem.Title, got.Problem.Title)
	assert.Equal(t, event.Problem.Difficulty, got.Problem.Difficulty)
	assert.Equal(t, event.ActiveStages, got.ActiveStages)
	assert.Len(t, got.History, 2)
	assert.Equal(t, event.History[0].Content, got.History[0].Content)
	assert.Equal(t, event.History[1].Role, got.History[1].Role)
}
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && go test ./internal/kafka/... -v -run TestSessionCompletedEvent
```

Expected: FAIL — package does not exist yet.

- [ ] **Step 3: Create `backend/internal/kafka/events.go`**

```go
package kafka

import (
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
)

type SessionCompletedEvent struct {
	UserID       uuid.UUID         `json:"user_id"`
	Problem      models.Problem    `json:"problem"`
	ActiveStages []string          `json:"active_stages"`
	History      []llm.ChatMessage `json:"history"`
}
```

- [ ] **Step 4: Create `backend/internal/kafka/producer.go`**

```go
package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl/scram"
)

type Producer struct {
	writer *kafkago.Writer
}

func NewProducer(brokerURL, topic, saslUser, saslPass string, useTLS bool) (*Producer, error) {
	transport := &kafkago.Transport{}
	if useTLS {
		transport.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	if saslUser != "" {
		mechanism, err := scram.Mechanism(scram.SHA256, saslUser, saslPass)
		if err != nil {
			return nil, fmt.Errorf("failed to create SASL mechanism: %w", err)
		}
		transport.SASL = mechanism
	}

	w := &kafkago.Writer{
		Addr:      kafkago.TCP(brokerURL),
		Topic:     topic,
		Balancer:  &kafkago.LeastBytes{},
		Transport: transport,
	}
	return &Producer{writer: w}, nil
}

func (p *Producer) PublishSessionCompleted(ctx context.Context, event SessionCompletedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}
	return p.writer.WriteMessages(ctx, kafkago.Message{Value: data})
}

func (p *Producer) Close() error {
	return p.writer.Close()
}
```

- [ ] **Step 5: Run test — confirm it passes**

```bash
cd backend && go test ./internal/kafka/... -v -run TestSessionCompletedEvent
```

Expected: PASS.

- [ ] **Step 6: Verify build**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/kafka/
git commit -m "feat: add SessionCompletedEvent and Kafka producer"
```

---

### Task 3: `internal/evaluation` — RunSession + EvaluationDispatcher interface

**Files:**
- Create: `backend/internal/evaluation/evaluation.go`
- Create: `backend/internal/evaluation/evaluation_test.go`

- [ ] **Step 1: Write failing tests**

Create `backend/internal/evaluation/evaluation_test.go`:

```go
package evaluation_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"leetgame/internal/evaluation"
	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubStorage satisfies storage.Storage. Unimplemented methods panic.
type stubStorage struct {
	storage.Storage
	upsertCalls []upsertArgs
	upsertErr   error
}

type upsertArgs struct {
	userID, problemID uuid.UUID
	topic, stage      string
	score, scale, floor float64
}

func (s *stubStorage) UpsertTopicProficiency(ctx context.Context, userID, problemID uuid.UUID, topic, stage string, score, scale, floor float64) error {
	s.upsertCalls = append(s.upsertCalls, upsertArgs{userID, problemID, topic, stage, score, scale, floor})
	return s.upsertErr
}

// stubLLM satisfies llm.Client.
type stubLLM struct {
	eval llm.SessionEvaluation
	err  error
}

func (s *stubLLM) Evaluate(_ context.Context, _ models.Problem, _ string, _ []string, _ []llm.ChatMessage, _ string, _, _ bool, _ func(string)) (llm.EvaluateResponse, error) {
	return llm.EvaluateResponse{}, nil
}

func (s *stubLLM) EvaluateSession(_ context.Context, _ models.Problem, _ []string, _ []llm.ChatMessage) (llm.SessionEvaluation, error) {
	return s.eval, s.err
}

var (
	testUserID    = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	testProblemID = uuid.MustParse("00000000-0000-0000-0000-000000000002")
	testProblem   = models.Problem{Id: testProblemID, Title: "Two Sum", Difficulty: "Easy", TopicTags: []string{"Array"}}
	testStages    = []string{"pattern"}
	testHistory   = []llm.ChatMessage{{Role: "user", Content: "hash map"}}
	testLogger    = slog.Default()
)

func TestRunSessionWithError_Success(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 0.8},
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	require.NoError(t, err)
	require.Len(t, store.upsertCalls, 1)
	call := store.upsertCalls[0]
	assert.Equal(t, testUserID, call.userID)
	assert.Equal(t, testProblemID, call.problemID)
	assert.Equal(t, "Array", call.topic)
	assert.Equal(t, "pattern", call.stage)
	assert.InDelta(t, 0.8, call.score, 0.001)
	// Easy difficulty → scale 0.15, floor 0.03
	assert.InDelta(t, 0.15, call.scale, 0.001)
	assert.InDelta(t, 0.03, call.floor, 0.001)
}

func TestRunSessionWithError_LLMError(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{err: errors.New("llm unavailable")}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	assert.Error(t, err)
	assert.Empty(t, store.upsertCalls)
}

func TestRunSessionWithError_OutOfRangeScoreSkipped(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 1.5}, // out of range
				{Topic: "Array", Stage: "tc_sc", Score: 0.6},   // valid
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	require.NoError(t, err)
	require.Len(t, store.upsertCalls, 1) // only the valid score
	assert.Equal(t, "tc_sc", store.upsertCalls[0].stage)
}

func TestRunSessionWithError_DBError(t *testing.T) {
	store := &stubStorage{upsertErr: errors.New("db down")}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 0.5},
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	assert.Error(t, err)
}

// Ensure stubStorage and stubLLM satisfy the required interfaces at compile time.
var _ storage.Storage = (*stubStorage)(nil)
var _ llm.Client = (*stubLLM)(nil)
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && go test ./internal/evaluation/... -v
```

Expected: FAIL — package does not exist.

- [ ] **Step 3: Create `backend/internal/evaluation/evaluation.go`**

```go
package evaluation

import (
	"context"
	"fmt"
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
)

// EvaluationDispatcher dispatches session evaluation work after a session completes.
// Implementations: GoroutineDispatcher (direct), KafkaDispatcher (via Kafka topic).
type EvaluationDispatcher interface {
	Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage)
}

// RunSession runs session evaluation and logs any error. Used by GoroutineDispatcher.
func RunSession(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
	if err := RunSessionWithError(ctx, store, llmClient, logger, userID, problem, activeStages, history); err != nil {
		logger.Error("session evaluation failed",
			"error", err,
			"user_id", userID,
			"problem_id", problem.Id,
		)
	}
}

// RunSessionWithError runs session evaluation and returns the first error encountered.
// Used by the Kafka consumer so it can decide whether to retry.
func RunSessionWithError(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) error {
	logger.Info("starting session evaluation",
		"user_id", userID,
		"problem_id", problem.Id,
		"problem_title", problem.Title,
		"active_stages", activeStages,
	)

	eval, err := llmClient.EvaluateSession(ctx, problem, activeStages, history)
	if err != nil {
		return fmt.Errorf("EvaluateSession failed: %w", err)
	}

	type difficultyParams struct{ scale, floor float64 }
	params := map[string]difficultyParams{
		"Easy": {0.15, 0.03},
		"Hard": {0.35, 0.07},
	}
	dp, ok := params[problem.Difficulty]
	if !ok {
		dp = difficultyParams{0.25, 0.05} // Medium + unknown
	}

	var updated int
	for _, score := range eval.Scores {
		if score.Score < 0 || score.Score > 1 {
			logger.Warn("skipping out-of-range score",
				"topic", score.Topic,
				"stage", score.Stage,
				"score", score.Score,
			)
			continue
		}
		if err := store.UpsertTopicProficiency(ctx, userID, problem.Id, score.Topic, score.Stage, score.Score, dp.scale, dp.floor); err != nil {
			return fmt.Errorf("UpsertTopicProficiency failed: %w", err)
		}
		updated++
	}

	logger.Info("session evaluation complete",
		"user_id", userID,
		"problem_title", problem.Title,
		"topics_updated", updated,
	)
	return nil
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd backend && go test ./internal/evaluation/... -v
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/evaluation/
git commit -m "feat: add evaluation package with RunSession and EvaluationDispatcher interface"
```

---

### Task 4: GoroutineDispatcher + KafkaDispatcher

**Files:**
- Create: `backend/internal/evaluation/goroutine_dispatcher.go`
- Create: `backend/internal/evaluation/kafka_dispatcher.go`
- Create: `backend/internal/evaluation/kafka_dispatcher_test.go`

- [ ] **Step 1: Write failing test for KafkaDispatcher**

Create `backend/internal/evaluation/kafka_dispatcher_test.go`:

```go
package evaluation_test

import (
	"context"
	"errors"
	"testing"

	"leetgame/internal/evaluation"
	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// mockPublisher satisfies evaluation.SessionPublisher.
type mockPublisher struct {
	err error
}

func (m *mockPublisher) PublishSessionCompleted(_ context.Context, _ kafka.SessionCompletedEvent) error {
	return m.err
}

func TestKafkaDispatcher_PublishSucceeds_NoFallback(t *testing.T) {
	fallbackCalled := false
	d := evaluation.NewKafkaDispatcher(
		&mockPublisher{err: nil},
		func(_ context.Context, _ uuid.UUID, _ models.Problem, _ []string, _ []llm.ChatMessage) {
			fallbackCalled = true
		},
		testLogger,
	)

	d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory)
	assert.False(t, fallbackCalled)
}

func TestKafkaDispatcher_PublishFails_CallsFallback(t *testing.T) {
	fallbackCalled := false
	d := evaluation.NewKafkaDispatcher(
		&mockPublisher{err: errors.New("broker unavailable")},
		func(_ context.Context, _ uuid.UUID, _ models.Problem, _ []string, _ []llm.ChatMessage) {
			fallbackCalled = true
		},
		testLogger,
	)

	d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory)
	assert.True(t, fallbackCalled)
}
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && go test ./internal/evaluation/... -v -run TestKafkaDispatcher
```

Expected: FAIL — `NewKafkaDispatcher`, `SessionPublisher` not found.

- [ ] **Step 3: Create `backend/internal/evaluation/goroutine_dispatcher.go`**

```go
package evaluation

import (
	"context"
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
)

type GoroutineDispatcher struct {
	store     storage.Storage
	llmClient llm.Client
	logger    *slog.Logger
}

func NewGoroutineDispatcher(store storage.Storage, llmClient llm.Client, logger *slog.Logger) *GoroutineDispatcher {
	return &GoroutineDispatcher{store: store, llmClient: llmClient, logger: logger}
}

func (d *GoroutineDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
	RunSession(ctx, d.store, d.llmClient, d.logger, userID, problem, activeStages, history)
}
```

- [ ] **Step 4: Create `backend/internal/evaluation/kafka_dispatcher.go`**

```go
package evaluation

import (
	"context"
	"log/slog"

	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
)

// SessionPublisher is implemented by *kafka.Producer.
type SessionPublisher interface {
	PublishSessionCompleted(ctx context.Context, event kafka.SessionCompletedEvent) error
}

type KafkaDispatcher struct {
	publisher SessionPublisher
	fallback  func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage)
	logger    *slog.Logger
}

func NewKafkaDispatcher(publisher SessionPublisher, fallback func(context.Context, uuid.UUID, models.Problem, []string, []llm.ChatMessage), logger *slog.Logger) *KafkaDispatcher {
	return &KafkaDispatcher{publisher: publisher, fallback: fallback, logger: logger}
}

func (d *KafkaDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
	event := kafka.SessionCompletedEvent{
		UserID:       userID,
		Problem:      problem,
		ActiveStages: activeStages,
		History:      history,
	}
	if err := d.publisher.PublishSessionCompleted(ctx, event); err != nil {
		d.logger.Error("kafka publish failed, falling back to inline evaluation", "error", err)
		d.fallback(ctx, userID, problem, activeStages, history)
	}
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd backend && go test ./internal/evaluation/... -v
```

Expected: all 6 tests PASS (4 from Task 3 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add backend/internal/evaluation/
git commit -m "feat: add GoroutineDispatcher and KafkaDispatcher"
```

---

### Task 5: Wire dispatcher into HandlerService, server, and main

**Files:**
- Modify: `backend/internal/handlers/handler_service.go`
- Modify: `backend/internal/handlers/chat.go`
- Modify: `backend/internal/server/server.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Update `backend/internal/handlers/handler_service.go`**

Replace the entire file:

```go
package handlers

import (
	"log/slog"

	"leetgame/internal/evaluation"
	"leetgame/internal/llm"
	"leetgame/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

type HandlerService struct {
	storage    storage.Storage
	logger     *slog.Logger
	llmClient  llm.Client
	keyfunc    jwt.Keyfunc
	dispatcher evaluation.EvaluationDispatcher
}

type HandlerServiceConfig struct {
	Storage    storage.Storage
	Logger     *slog.Logger
	LLMClient  llm.Client
	Keyfunc    jwt.Keyfunc
	Dispatcher evaluation.EvaluationDispatcher
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:    cfg.Storage,
		logger:     cfg.Logger,
		llmClient:  cfg.LLMClient,
		keyfunc:    cfg.Keyfunc,
		dispatcher: cfg.Dispatcher,
	}
}
```

- [ ] **Step 2: Update `backend/internal/handlers/chat.go`**

Remove the `runSessionEvaluation` method entirely (the bottom ~60 lines starting with `func (hs *HandlerService) runSessionEvaluation`).

Replace this block inside `SetBodyStreamWriter`:
```go
if evalEnabled && result.Stage == "complete" {
    fullHistory := append(baseHistory[:len(baseHistory):len(baseHistory)], llm.ChatMessage{Role: "assistant", Content: result.Message})
    go hs.runSessionEvaluation(evalUID, evalProblem, evalActiveStages, fullHistory)
}
```

With:
```go
if evalEnabled && result.Stage == "complete" {
    fullHistory := append(baseHistory[:len(baseHistory):len(baseHistory)], llm.ChatMessage{Role: "assistant", Content: result.Message})
    evalCtx := context.WithoutCancel(streamCtx)
    go hs.dispatcher.Dispatch(evalCtx, evalUID, evalProblem, evalActiveStages, fullHistory)
}
```

Also remove the unused imports that `runSessionEvaluation` needed: `"time"` and `"leetgame/internal/models"` (check if `models` is still used elsewhere in the file — it is used for `models.Problem` in `evalProblem`, so keep it). Remove `"time"` if it was only used in `runSessionEvaluation`.

- [ ] **Step 3: Update `backend/internal/server/server.go`**

Add `Dispatcher evaluation.EvaluationDispatcher` to `Config` and pass it through to `HandlerServiceConfig`:

```go
package server

import (
	"log/slog"

	"leetgame/internal/evaluation"
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
	Dispatcher     evaluation.EvaluationDispatcher
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
		Storage:    cfg.Storage,
		Logger:     cfg.Logger,
		LLMClient:  cfg.LLMClient,
		Keyfunc:    cfg.Keyfunc,
		Dispatcher: cfg.Dispatcher,
	})
	service.RegisterRoutes(app)

	return app
}
```

- [ ] **Step 4: Update `backend/cmd/server/main.go`**

Add dispatcher initialization after the LLM client is created and before `server.New(...)`. Add these imports: `"leetgame/internal/evaluation"` and `"leetgame/internal/kafka"`.

Insert this block after the `store := processcache.New(...)` line:

```go
var dispatcher evaluation.EvaluationDispatcher
if settings.Kafka.BrokerURL != "" {
    producer, err := kafka.NewProducer(
        settings.Kafka.BrokerURL,
        settings.Kafka.Topic,
        settings.Kafka.SASLUser,
        settings.Kafka.SASLPassword,
        settings.Kafka.TLS,
    )
    if err != nil {
        slog.Error("failed to create kafka producer", "error", err)
        os.Exit(1)
    }
    defer producer.Close()
    fallback := func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
        evaluation.RunSession(ctx, store, llmClient, slog.Default(), userID, problem, activeStages, history)
    }
    dispatcher = evaluation.NewKafkaDispatcher(producer, fallback, slog.Default())
    slog.Info("kafka dispatcher enabled", "broker", settings.Kafka.BrokerURL, "topic", settings.Kafka.Topic)
} else {
    dispatcher = evaluation.NewGoroutineDispatcher(store, llmClient, slog.Default())
    slog.Info("goroutine dispatcher enabled (kafka not configured)")
}
```

Then add `Dispatcher: dispatcher` to the `server.New(...)` call:

```go
app := server.New(&server.Config{
    Storage:        store,
    Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
        Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
    })),
    LLMClient:      llmClient,
    AllowedOrigins: settings.Server.AllowedOrigins,
    Keyfunc:        kf,
    Dispatcher:     dispatcher,
})
```

Add required imports to `main.go`: `"context"`, `"leetgame/internal/evaluation"`, `"leetgame/internal/kafka"`, `"leetgame/internal/llm"`, `"leetgame/internal/models"`, `"github.com/google/uuid"`.

- [ ] **Step 5: Build and test**

```bash
cd backend && go build ./... && go test ./...
```

Expected: build succeeds, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handlers/handler_service.go backend/internal/handlers/chat.go backend/internal/server/server.go backend/cmd/server/main.go
git commit -m "feat: wire EvaluationDispatcher into HandlerService"
```

---

### Task 6: Kafka consumer

**Files:**
- Create: `backend/internal/kafka/consumer.go`
- Create: `backend/internal/kafka/consumer_test.go`

- [ ] **Step 1: Write failing tests**

Create `backend/internal/kafka/consumer_test.go`:

```go
package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"leetgame/internal/llm"
	"leetgame/internal/models"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockReader implements messageReader for tests.
type mockReader struct {
	msgs    []kafkago.Message
	pos     int
	commits []kafkago.Message
	done    chan struct{} // closed after last message is committed
}

func newMockReader(msgs []kafkago.Message) *mockReader {
	return &mockReader{msgs: msgs, done: make(chan struct{})}
}

func (m *mockReader) FetchMessage(ctx context.Context) (kafkago.Message, error) {
	if m.pos >= len(m.msgs) {
		<-ctx.Done()
		return kafkago.Message{}, ctx.Err()
	}
	msg := m.msgs[m.pos]
	m.pos++
	return msg, nil
}

func (m *mockReader) CommitMessages(_ context.Context, msgs ...kafkago.Message) error {
	m.commits = append(m.commits, msgs...)
	if len(m.commits) >= len(m.msgs) {
		select {
		case <-m.done:
		default:
			close(m.done)
		}
	}
	return nil
}

func (m *mockReader) Close() error { return nil }

func validMessage(t *testing.T) kafkago.Message {
	t.Helper()
	event := SessionCompletedEvent{
		UserID:       uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Problem:      models.Problem{Title: "Two Sum", Difficulty: "Easy"},
		ActiveStages: []string{"pattern"},
		History:      []llm.ChatMessage{{Role: "user", Content: "hash map"}},
	}
	data, err := json.Marshal(event)
	require.NoError(t, err)
	return kafkago.Message{Value: data}
}

func TestConsumer_BadJSON_CommitsAndSkips(t *testing.T) {
	r := newMockReader([]kafkago.Message{{Value: []byte("not json")}})
	handlerCalled := false
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		handlerCalled = true
		return nil
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)
	assert.False(t, handlerCalled)
}

func TestConsumer_HandlerSuccess_Commits(t *testing.T) {
	r := newMockReader([]kafkago.Message{validMessage(t)})
	handlerCalled := false
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		handlerCalled = true
		return nil
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)
	assert.True(t, handlerCalled)
}

func TestConsumer_HandlerAlwaysFails_CommitsAfterMaxRetries(t *testing.T) {
	r := newMockReader([]kafkago.Message{validMessage(t)})
	callCount := 0
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		callCount++
		return errors.New("transient error")
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)             // still committed after max retries
	assert.Equal(t, maxRetries, callCount)   // retried maxRetries times
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && go test ./internal/kafka/... -v -run TestConsumer
```

Expected: FAIL — `newConsumer`, `maxRetries` not defined.

- [ ] **Step 3: Create `backend/internal/kafka/consumer.go`**

```go
package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl/scram"
)

const maxRetries = 3

// messageReader is a subset of *kafkago.Reader used for testing.
type messageReader interface {
	FetchMessage(ctx context.Context) (kafkago.Message, error)
	CommitMessages(ctx context.Context, msgs ...kafkago.Message) error
	Close() error
}

type Consumer struct {
	reader  messageReader
	handler func(context.Context, SessionCompletedEvent) error
	logger  *slog.Logger
}

// NewConsumer creates a Consumer connected to a real Kafka broker.
func NewConsumer(brokerURL, topic, groupID, saslUser, saslPass string, useTLS bool, handler func(context.Context, SessionCompletedEvent) error, logger *slog.Logger) *Consumer {
	dialer := &kafkago.Dialer{}
	if useTLS {
		dialer.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	if saslUser != "" {
		mechanism, err := scram.Mechanism(scram.SHA256, saslUser, saslPass)
		if err != nil {
			logger.Error("failed to create SASL mechanism", "error", err)
		} else {
			dialer.SASLMechanism = mechanism
		}
	}

	r := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:     []string{brokerURL},
		GroupID:     groupID,
		Topic:       topic,
		StartOffset: kafkago.FirstOffset,
		Dialer:      dialer,
	})
	return newConsumer(r, handler, logger)
}

// newConsumer creates a Consumer with a provided reader (used in tests).
func newConsumer(reader messageReader, handler func(context.Context, SessionCompletedEvent) error, logger *slog.Logger) *Consumer {
	return &Consumer{reader: reader, handler: handler, logger: logger}
}

func (c *Consumer) Run(ctx context.Context) error {
	defer c.reader.Close()
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("failed to fetch message: %w", err)
		}
		c.process(ctx, msg)
		if ctx.Err() != nil {
			return nil
		}
	}
}

func (c *Consumer) process(ctx context.Context, msg kafkago.Message) {
	var event SessionCompletedEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		c.logger.Error("failed to deserialize event, skipping", "error", err, "offset", msg.Offset)
		c.commit(ctx, msg)
		return
	}

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if err := c.handler(ctx, event); err == nil {
			break
		} else if attempt == maxRetries {
			c.logger.Error("max retries exceeded, dropping event", "error", err, "offset", msg.Offset)
		} else {
			c.logger.Warn("handler failed, retrying", "error", err, "attempt", attempt)
		}
	}

	c.commit(ctx, msg)
}

func (c *Consumer) commit(ctx context.Context, msg kafkago.Message) {
	if err := c.reader.CommitMessages(ctx, msg); err != nil {
		c.logger.Error("failed to commit offset", "error", err)
	}
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd backend && go test ./internal/kafka/... -v -run TestConsumer
```

Expected: all 3 consumer tests PASS.

- [ ] **Step 5: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/kafka/consumer.go backend/internal/kafka/consumer_test.go
git commit -m "feat: add Kafka consumer with retry and commit logic"
```

---

### Task 7: `cmd/evaluator` binary

**Files:**
- Create: `backend/cmd/evaluator/main.go`

No unit tests — this is pure wiring. Smoke-tested via build + local docker-compose run in Task 8.

- [ ] **Step 1: Create `backend/cmd/evaluator/main.go`**

```go
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
	"leetgame/internal/evaluation"
	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/ollama"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/utils"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Error("failed to load .env file", "error", err)
	}

	cfg, err := settings.Load()
	if err != nil {
		slog.Error("failed to load settings", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(cfg.Log.Level),
	})))

	if cfg.Kafka.BrokerURL == "" {
		slog.Error("KAFKA_BROKER_URL is required")
		os.Exit(1)
	}

	pg := postgres.New(&postgres.Config{DbUrl: cfg.Storage.DbUrl})
	defer pg.Close()

	var llmClient llm.Client
	switch cfg.LLM.Provider {
	case "ollama":
		llmClient = ollama.New(cfg.LLM.OllamaURL, cfg.LLM.Model, cfg.LLM.APIKey)
	default:
		llmClient = claude.New(cfg.LLM.APIKey, cfg.LLM.Model)
	}

	logger := slog.Default()

	handler := func(ctx context.Context, event kafka.SessionCompletedEvent) error {
		return evaluation.RunSessionWithError(ctx, pg, llmClient, logger, event.UserID, event.Problem, event.ActiveStages, event.History)
	}

	consumer := kafka.NewConsumer(
		cfg.Kafka.BrokerURL,
		cfg.Kafka.Topic,
		cfg.Kafka.GroupID,
		cfg.Kafka.SASLUser,
		cfg.Kafka.SASLPassword,
		cfg.Kafka.TLS,
		handler,
		logger,
	)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	slog.Info("evaluator starting",
		"broker", cfg.Kafka.BrokerURL,
		"topic", cfg.Kafka.Topic,
		"group_id", cfg.Kafka.GroupID,
	)

	if err := consumer.Run(ctx); err != nil {
		slog.Error("consumer error", "error", err)
		os.Exit(1)
	}

	slog.Info("evaluator shutdown complete")
}
```

- [ ] **Step 2: Build both binaries**

```bash
cd backend && go build ./cmd/server && go build ./cmd/evaluator
```

Expected: both compile with no errors.

- [ ] **Step 3: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/evaluator/
git commit -m "feat: add cmd/evaluator consumer binary"
```

---

### Task 8: docker-compose + smoke test

**Files:**
- Create: `backend/docker-compose.yml`

- [ ] **Step 1: Create `backend/docker-compose.yml`**

```yaml
services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    ports:
      - "9092:9092"
    healthcheck:
      test: ["CMD", "kafka-broker-api-versions", "--bootstrap-server", "localhost:9092"]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 2: Add `KAFKA_BROKER_URL` to `.env`**

Add this line to `backend/.env` (create the file if it does not exist — do not commit it):

```
KAFKA_BROKER_URL=localhost:9092
```

- [ ] **Step 3: Start Kafka**

```bash
cd backend && docker-compose up -d
```

Expected: Kafka container starts. Wait ~15 seconds for it to become healthy.

```bash
docker-compose ps
```

Expected: `kafka` service shows `healthy` or `running`.

- [ ] **Step 4: Start the evaluator**

In a separate terminal:

```bash
cd backend && go run ./cmd/evaluator
```

Expected output:
```
level=INFO msg="evaluator starting" broker=localhost:9092 topic=session_completed group_id=evaluator
```

The evaluator should hang, waiting for messages. No errors.

- [ ] **Step 5: Start the server (separate terminal)**

```bash
cd backend && go run ./cmd/server
```

Expected: server starts on configured port, logs show `goroutine dispatcher enabled` when `KAFKA_BROKER_URL` is set it should show `kafka dispatcher enabled`.

- [ ] **Step 6: Commit**

```bash
git add backend/docker-compose.yml
git commit -m "feat: add docker-compose for local Kafka dev"
```

---

## Known Limitations

- **No event schema versioning:** `SessionCompletedEvent` embeds `models.Problem` and `llm.ChatMessage` directly. If those structs change, old unconsumed messages will fail deserialization and be skipped (logged + committed). Add a `Version int` field in a future iteration.
- **Partial score replay:** If `RunSessionWithError` fails mid-way through scoring (e.g., DB down after 2 of 5 upserts), a retry will re-run all upserts. Since `UpsertTopicProficiency` applies an exponential weighted average, this can slightly over-weight a session. Acceptable for this project.
- **kafka-go partition stall:** Not committing during retries stalls the entire partition. With `maxRetries=3` and no sleep between retries, a downed LLM clears quickly (3 attempts × ~30s timeout = ~90s stall maximum before dropping and moving on).
- **Dead-letter topic:** Messages dropped after `maxRetries` are logged but not written to a dead-letter topic. They are unrecoverable without manual intervention.
