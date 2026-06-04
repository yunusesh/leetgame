# Kafka Integration Design

## Goal

Add Kafka as the transport for session evaluation events. When a chat session completes, the web server publishes a `session_completed` event; a new standalone evaluator binary consumes it and writes proficiency scores. If Kafka is not configured, the app falls back to the existing goroutine behavior.

## Architecture

Two binaries share a single Kafka topic:

- **`cmd/server`** — publishes `SessionCompletedEvent` when a session completes with an authenticated user. If `KAFKA_BROKER_URL` is unset, falls back to the existing goroutine evaluation path.
- **`cmd/evaluator`** — long-running consumer binary. Reads events, runs `EvaluateSession` via LLM, writes proficiency scores to Postgres.

The evaluation logic (`runSessionEvaluation`) is extracted from `HandlerService` into `internal/evaluation` as a standalone `RunSession` function, shared by both the fallback goroutine and the evaluator binary.

The web server dispatches via an `EvaluationDispatcher` interface — `HandlerService` is unaware of Kafka.

**Local dev:** docker-compose single-node Kafka (KRaft mode, no Zookeeper).  
**Production:** Upstash Kafka free tier (SASL/SCRAM over TLS), Render background worker for `cmd/evaluator`.

## Package Structure

```
backend/
├── cmd/
│   ├── server/main.go           # modified: init dispatcher, pass to HandlerService
│   └── evaluator/main.go        # new: consumer binary entry point
├── internal/
│   ├── evaluation/
│   │   ├── evaluation.go        # new: RunSession(), RunSessionWithError(), EvaluationDispatcher interface
│   │   ├── goroutine_dispatcher.go  # new: GoroutineDispatcher (fallback)
│   │   └── kafka_dispatcher.go  # new: KafkaDispatcher (Kafka path + fallback)
│   ├── kafka/
│   │   ├── producer.go          # new: Producer, PublishSessionCompleted
│   │   ├── consumer.go          # new: Consumer, Run
│   │   └── events.go            # new: SessionCompletedEvent
│   └── settings/
│       └── kafka.go             # new: Kafka settings struct
├── docker-compose.yml           # new: local Kafka (KRaft)
```

## Event Schema

```go
// internal/kafka/events.go — package kafka
type SessionCompletedEvent struct {
    UserID       uuid.UUID         `json:"user_id"`
    Problem      models.Problem    `json:"problem"`
    ActiveStages []string          `json:"active_stages"`
    History      []llm.ChatMessage `json:"history"`
}
```

These are exactly the four values `runSessionEvaluation` already receives. No transformation needed on either side.

**Known gap:** no `Version` field. If `models.Problem` or `llm.ChatMessage` fields change, old unconsumed messages may fail deserialization. The consumer commits and logs on deserialization failure (permanent skip), preventing poison-pill stalls. Schema versioning is not implemented in this iteration.

## Settings

`internal/settings/kafka.go` — `package settings`:

```go
type Kafka struct {
    BrokerURL    string `env:"BROKER_URL"  envDefault:""`
    Topic        string `env:"TOPIC"       envDefault:"session_completed"`
    GroupID      string `env:"GROUP_ID"    envDefault:"evaluator"`
    TLS          bool   `env:"TLS"         envDefault:"false"`
    SASLUser     string `env:"SASL_USER"   envDefault:""`
    SASLPassword string `env:"SASL_PASSWORD" envDefault:""`
}
```

With `envPrefix:"KAFKA_"` on the root `Settings` struct. `BrokerURL` empty = Kafka disabled.

**Local env vars:**
```
KAFKA_BROKER_URL=localhost:9092
```

**Production env vars (Upstash):**
```
KAFKA_BROKER_URL=<upstash-broker-endpoint>
KAFKA_TLS=true
KAFKA_SASL_USER=<upstash-username>
KAFKA_SASL_PASSWORD=<upstash-password>
```

## EvaluationDispatcher Interface

`internal/evaluation/evaluation.go` — `package evaluation`:

```go
type EvaluationDispatcher interface {
    Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage)
}
```

`HandlerService` holds a `dispatcher EvaluationDispatcher` field (unexported). `HandlerServiceConfig` gains a `Dispatcher EvaluationDispatcher` field. `cmd/server/main.go` selects the implementation at startup.

### Chat handler change

```go
if evalEnabled && result.Stage == "complete" {
    evalCtx := context.WithoutCancel(streamCtx) // detach from request lifetime
    go hs.dispatcher.Dispatch(evalCtx, evalUID, evalProblem, evalActiveStages, fullHistory)
}
```

`context.WithoutCancel` (Go 1.21) prevents the request context cancellation from killing the goroutine after the HTTP handler returns.

## GoroutineDispatcher

`internal/evaluation/goroutine_dispatcher.go`:

```go
type GoroutineDispatcher struct {
    storage storage.Storage
    llm     llm.Client
    logger  *slog.Logger
}

func (d *GoroutineDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
    RunSession(ctx, d.storage, d.llm, d.logger, userID, problem, activeStages, history)
}
```

Used when `KAFKA_BROKER_URL` is unset. Identical behavior to the current `runSessionEvaluation` goroutine.

## KafkaDispatcher

`internal/evaluation/kafka_dispatcher.go`:

```go
type KafkaDispatcher struct {
    producer *kafka.Producer
    fallback func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage)
    logger   *slog.Logger
}

func (d *KafkaDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
    event := kafka.SessionCompletedEvent{
        UserID:       userID,
        Problem:      problem,
        ActiveStages: activeStages,
        History:      history,
    }
    if err := d.producer.PublishSessionCompleted(ctx, event); err != nil {
        d.logger.Error("kafka publish failed, falling back to inline evaluation", "error", err)
        d.fallback(ctx, userID, problem, activeStages, history)
    }
}
```

`fallback` is wired in `main.go` as `evaluation.RunSession` partially applied with storage/llm/logger. This keeps `internal/kafka` free of imports to `internal/storage` and `internal/llm`.

## Producer

`internal/kafka/producer.go` — `package kafka`:

```go
type Producer struct {
    writer *kafka.Writer
}

func NewProducer(brokerURL, topic, saslUser, saslPass string, useTLS bool) *Producer
func (p *Producer) PublishSessionCompleted(ctx context.Context, event SessionCompletedEvent) error
func (p *Producer) Close() error
```

`PublishSessionCompleted` marshals the event to JSON and calls `writer.WriteMessages` synchronously (waits for broker ack). On error, returns the error — `KafkaDispatcher` handles the fallback.

TLS and SASL/SCRAM configured via `kafka.Dialer` when `useTLS=true` and credentials are non-empty.

## Consumer

`internal/kafka/consumer.go` — `package kafka`:

```go
type Consumer struct {
    reader  *kafka.Reader
    handler func(ctx context.Context, event SessionCompletedEvent) error
    logger  *slog.Logger
}

func NewConsumer(brokerURL, topic, groupID, saslUser, saslPass string, useTLS bool, handler func(context.Context, SessionCompletedEvent) error, logger *slog.Logger) *Consumer
func (c *Consumer) Run(ctx context.Context) error
```

`handler` is wired in `cmd/evaluator/main.go` — decouples the consumer from evaluation logic.

### Commit strategy

`Run` loop per message:

| Outcome | Action |
|---|---|
| Deserialization failure | Log + commit (permanent skip, prevents poison-pill) |
| `handler` returns nil | Commit |
| `handler` returns transient error (LLM timeout, DB error) | Do not commit; increment retry count |
| Retry count ≥ 5 | Log drop + commit (prevents consumer stall) |

**Known constraint:** `kafka-go` consumer group mode stalls the entire partition while a message is unacknowledged. A transient LLM outage will block all subsequent messages on that partition until the outage resolves or the retry cap is hit.

## Evaluator Binary

`cmd/evaluator/main.go`:

1. `settings.Load()` — same as server
2. Connect Postgres (`postgres.New(...)`)
3. Construct LLM client (Claude or Ollama based on settings, same as server)
4. Define handler: `func(ctx, event) error { return evaluation.RunSessionWithError(...) }`
5. `kafka.NewConsumer(..., handler, logger)`
6. `ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)`
7. `consumer.Run(ctx)` — blocks until signal
8. `stop()`, `consumer.Close()`

`evaluation.RunSession` is split into `RunSession` (logs errors, no return) for the goroutine dispatcher and `RunSessionWithError` (returns error) for the consumer handler so the consumer can apply its retry/commit logic.

## Local Dev

`docker-compose.yml` in `backend/`:

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
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    ports:
      - "9092:9092"
```

Run with `docker-compose up -d`. Set `KAFKA_BROKER_URL=localhost:9092` in `.env`. Unset to use goroutine fallback without docker-compose.

## Production Deployment

1. Create free Kafka cluster on Upstash. Copy broker URL, username, password.
2. Add env vars to both Render services (web + evaluator background worker): `KAFKA_BROKER_URL`, `KAFKA_TLS=true`, `KAFKA_SASL_USER`, `KAFKA_SASL_PASSWORD`.
3. Add `cmd/evaluator` as a Render Background Worker service, start command: `go run ./cmd/evaluator`.
4. Topic `session_completed` is created automatically by the producer on first publish (or pre-create via Upstash dashboard with 3 partitions).

## Dependencies

Add to `go.mod`:
```
github.com/segmentio/kafka-go
```
