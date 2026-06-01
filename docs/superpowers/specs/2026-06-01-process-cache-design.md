# Process Cache Implementation Design

## Goal

Add a process-level in-memory cache for static, non-user-specific data so the backend avoids redundant DB queries on hot paths. The first (and currently only) domain cached is problems.

## Architecture

A new `CachedStorage` wrapper in `internal/storage/processcache/` implements the `storage.Storage` interface and wraps the real `postgres.Postgres` storage. It intercepts problem-related methods and serves them from an in-memory cache. All other methods delegate straight through to the inner storage. Handlers and the server config never change — they see only `storage.Storage`.

```
postgres.Postgres  →  processcache.CachedStorage  →  handlers
      (inner)              (storage.Storage)
```

`main.go` composes them:

```go
pg := postgres.New(...)
store := processcache.New(pg, time.Hour)
app := server.New(&server.Config{Storage: store, ...})
```

## Package Layout

```
internal/storage/processcache/
    process_cache.go
```

## The Struct

```go
type CachedStorage struct {
    inner    storage.Storage
    ttl      time.Duration
    mu       sync.RWMutex
    problems []models.Problem
    byID     map[uuid.UUID]models.Problem
    tags     []types.ProblemTag
    loadedAt time.Time
}

func New(inner storage.Storage, ttl time.Duration) *CachedStorage
```

- `inner` — delegate for pass-throughs and cache population
- `ttl` — how long the cached problems are valid (1 hour in production)
- `problems` — full slice of all problems
- `byID` — map for O(1) ID lookups
- `tags` — derived from `problems` at load time; no separate DB query
- `loadedAt` — zero value means cache is unpopulated

## Cache Load and TTL

The cache is **lazy**: it is populated on the first request that needs it, and repopulated on the first request after TTL expiry. There is no background goroutine.

`getOrLoad(ctx)` checks under a read lock first. If the cache is valid, it returns immediately. If stale or empty, it acquires a write lock and double-checks before loading — this prevents multiple concurrent goroutines from all triggering a reload simultaneously.

`load(ctx)` fetches all problems from `inner` with a single `SELECT *`, builds `byID`, derives `tags` (unnest `topic_tags`, count per tag, sort by name ASC), and sets `loadedAt`.

## Intercepted Methods

All five problem methods are served entirely from the in-memory cache after `getOrLoad`:

| Method | In-memory operation |
|---|---|
| `GetRandomProblem` | `rand.Intn(len(problems))` |
| `GetRandomProblemFiltered` | filter slice in Go, `rand.Intn(len(filtered))` |
| `GetProblemByID` | `byID[id]` map lookup |
| `SearchProblems` | filter + sort by `leetcode_id ASC NULLS LAST` + paginate + count |
| `GetProblemTags` | return cached `tags` slice |

Filtering logic for `GetRandomProblemFiltered` and `SearchProblems` replicates the existing Postgres behaviour:
- `q`: case-insensitive substring match on `title`
- `difficulty`: exact match
- `tags` with `and`: all tags must be present in `topic_tags`
- `tags` with `or`: at least one tag must be present
- `excludeID`: skip problem with that ID

`SearchProblems` returns `types.ProblemSearchResponse` with the correct `Total`, `Page`, and `PageSize` fields derived from the filtered slice.

`GetProblemByID` returns `xerrors.NotFoundError` if the ID is not in `byID`.

`GetRandomProblem` and `GetRandomProblemFiltered` return `xerrors.NotFoundError` (wrapped in `utils.CreateNonRetryableError`) if no matching problems exist — matching existing Postgres behaviour.

## Pass-Through Methods

All non-problem methods delegate directly to `inner` with no caching:

- `Ping`
- `UpsertPracticeDay`, `GetStreak`
- `GetUserSettings`, `UpsertUserSettings`
- `SaveProblem`, `UnsaveProblem`, `GetSavedProblems`
- `UpsertTopicProficiency`, `GetTopicProficiencies`, `GetProficiencyHistory`

## Extending the Cache

To cache a new domain in future, add fields to `CachedStorage` for the data, a separate `loadedAt`-equivalent and `mu` if the TTL differs, and intercept the relevant `Storage` methods. The wrapper pattern scales to multiple domains without structural changes.

## Error Handling

- If `load` fails (DB error), `getOrLoad` returns the error and the cache remains unpopulated. The next request will retry.
- If the cache is stale and `load` fails, the stale data is **not** served — the error is returned. This keeps behaviour consistent and avoids serving outdated data silently.
