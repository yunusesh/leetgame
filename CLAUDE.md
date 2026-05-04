# leetgame

## Backend

The backend follows the same patterns as [go-chat](../go-chat/backend). When in doubt, consult that codebase.

### Project Layout

```
backend/
├── cmd/server/main.go          # entry point — wires everything, starts/stops server
├── internal/
│   ├── constants/              # one file per domain (e.g. routes.go, postgres.go)
│   ├── handlers/               # HTTP layer: handler_service.go, routes.go, one file per resource
│   ├── middleware/             # middleware factories returning fiber.Handler
│   ├── models/                 # DB-mapped entity structs, one file per entity
│   ├── plugins/                # WebSocket feature plugins + container.go registry
│   ├── server/server.go        # fiber.App factory (createFiberApp, setupMiddleware, RegisterRoutes)
│   ├── settings/               # one file per config domain; root Settings struct in settings.go
│   ├── storage/
│   │   ├── storage.go          # Storage interface
│   │   └── postgres/           # Postgres struct, one file per resource domain
│   ├── types/                  # composite, partial-update, and query-option types (not DB-mapped)
│   ├── utils/                  # pure utility functions (jwt, retry, slog)
│   ├── xcontext/               # typed Fiber context accessors using unexported struct keys
│   └── xerrors/                # HTTP and Postgres error helpers
```

### Settings

- Root `Settings` struct with nested sub-structs, each in its own file in `package settings`
- Library: `github.com/caarlos0/env/v11` — use `env:"KEY"`, `envDefault:"val"`, `envPrefix:"PREFIX_"`, `,required`
- `settings.Load()` returns `(Settings, error)`; failure in `main.go` calls `os.Exit(1)`

### Constants

- One file per domain in `package constants`
- Exported PascalCase constants; unexported camelCase
- Route strings live in `constants/routes.go` — use them in both middleware and route registration

### Models

- One file per entity in `package models`
- All fields have both `json` and `db` struct tags (snake_case for both, matching DB column names)
- IDs: `github.com/google/uuid.UUID`; timestamps: `time.Time`; no pointer fields
- Validation method: `func (m Model) Validate() map[string]string` — empty map means valid

### Types Package vs Models

- `models` = structs that map 1:1 to DB tables
- `types` = composite results (`BulkResult[T]`), partial updates (pointer fields for PATCH), query options (`query` tags for Fiber's `QueryParser`), JOIN results that embed a model

### Storage Layer

- `storage.Storage` interface in `internal/storage/storage.go`, grouped by domain with inline comments
- `Postgres` struct in `internal/storage/postgres/postgres.go` — constructor calls `os.Exit(1)` on failure
- Methods split into one file per domain (`messages.go`, `profiles.go`, etc.)
- SQL is a `const string` at the top of each function
- All queries wrapped in `utils.Retry(ctx, func(ctx context.Context) (T, error) {...})`
- Multi-row: `pgx.CollectRows` + `pgx.RowToStructByName[T]`; single-row: `pgx.CollectOneRow`
- Mutations: `Pool.Exec`; check `ct.RowsAffected() == 0` → return `utils.CreateNonRetryableError(xerrors.NotFoundError(...))`
- Bulk: `pgx.Batch` + `Pool.SendBatch`
- Dynamic queries: `github.com/Masterminds/squirrel` with `squirrel.Dollar`
- Check PG constraint violations with `xerrors.IsUniqueViolation` / `xerrors.IsForeignKeyViolation` and named constants from `constants/postgres.go`

### Handlers

- `HandlerService` struct with unexported fields; parallel `HandlerServiceConfig` struct with exported fields
- Constructor: `NewService(*HandlerServiceConfig) *HandlerService`
- Route registration: `func (hs *HandlerService) RegisterRoutes(app *fiber.App)`
- All handlers are methods on `*HandlerService` with signature `func (hs *HandlerService) Name(c *fiber.Ctx) error`
- Request flow: get user ID via `xcontext.GetUserId(c)` → parse params/body → validate → call storage → return JSON
- Inline unexported `request`/`response` structs defined inside the handler function
- Return errors directly — the global `ErrorHandler` in `xerrors` catches them
- Receiver name: `hs`

### Middleware

- Standalone functions returning `fiber.Handler` (factory pattern: `func SetXxx() fiber.Handler`)
- Applied via `api.Use(...)` inside route groups in `RegisterRoutes`

### Error Handling (xerrors)

- `HTTPError` struct implements `error`; returned by value (not pointer) from constructor functions
- Constructors: `InternalServerError()`, `BadRequestError(msg)`, `NotFoundError(entity, args)`, `InvalidJSON()`, `ConflictError(entity, key, val)`, `UnprocessableEntityError(map[string]string)`
- Global `ErrorHandler` registered as `fiber.Config.ErrorHandler` — handles `HTTPError`, `*fiber.Error`, and unknown errors
- Storage errors that must not be retried: wrap in `utils.CreateNonRetryableError(xerrors.SomeError(...))`

### Context (xcontext)

- Use unexported struct types (not strings) as `Locals` keys
- Pattern: `SetXxx(c *fiber.Ctx, val T)` + `GetXxx(c *fiber.Ctx) (T, error)` — callers return `err` immediately

### Utils

- `utils.Retry[T]` — retries up to 2 times with 100ms delay; respects ctx; unwraps `*NonRetryableError`
- `utils.MustParseSlogLevel(string) slog.Leveler` — panics on bad input
- `utils.GetUserIdFromToken(*jwt.Token) (uuid.UUID, error)` — extracts `sub` claim

### Logging

- Always use `log/slog` (never `fmt.Printf` or `log.Printf`)
- Loggers passed via config structs as `*slog.Logger`
- Global default set once in `main.go` via `slog.SetDefault(...)`

### Naming Conventions

| Thing | Convention |
|---|---|
| Files | `snake_case.go`, named after primary type or domain |
| Structs/Types | PascalCase; config structs named `XxxConfig` |
| Constructors | `New(*Config)` for top-level, `NewXxx(*XxxConfig)` for named types |
| Receiver names | Short initials: `hs` (HandlerService), `p` (Postgres) |
| Local IDs | `uid`, `rid`, `mid`; string forms: `uidStr`, `ridStr` |
| Request/response | `req`/`resp` or inline `request`/`response` structs |
| WebSocket message types | SCREAMING_SNAKE_CASE strings |
| Storage methods | Verb + resource: `CreateRoom`, `GetRoomsByUserId`, `DeleteMessageById` |

### Key Dependencies

| Package | Purpose |
|---|---|
| `github.com/gofiber/fiber/v2` | HTTP framework |
| `github.com/jackc/pgx/v5` | Postgres driver (pgxpool, row scanning) |
| `github.com/jackc/pgerrcode` | PG error code constants |
| `github.com/Masterminds/squirrel` | SQL query builder (dynamic queries only) |
| `github.com/google/uuid` | UUID type and generation |
| `github.com/caarlos0/env/v11` | Struct-based env var parsing |
| `github.com/joho/godotenv` | `.env` file loading |
| `github.com/goccy/go-json` | Fast JSON encoder wired into Fiber globally |
| `log/slog` | Structured logging (stdlib) |
