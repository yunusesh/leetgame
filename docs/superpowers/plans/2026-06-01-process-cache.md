# Process Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a process-level in-memory cache for all problems so random selection, filtering, search, and tag derivation are served from memory instead of hitting Postgres on every request.

**Architecture:** A new `CachedStorage` wrapper in `internal/storage/processcache/` implements the `storage.Storage` interface and wraps the real Postgres storage. It intercepts all five problem methods and serves them from a lazily-populated, TTL-guarded in-memory slice. All other Storage methods delegate straight through. `main.go` composes them: `processcache.New(pg, time.Hour)` replaces `pg` as the storage passed to `server.New`.

**Tech Stack:** Go stdlib (`sync`, `sort`, `strings`, `math/rand`, `time`), existing `storage.Storage` interface, `models.Problem`, `types.ProblemTag`, `types.ProblemSearchResponse`

---

## File Structure

- **Create** `backend/internal/storage/processcache/process_cache.go` — `CachedStorage` struct, constructor, `getOrLoad`, `load`, `deriveTags`, `matchesProblem`, all intercepted methods, all pass-through methods
- **Create** `backend/internal/storage/processcache/process_cache_test.go` — unit tests using a stub inner storage
- **Modify** `backend/internal/storage/storage.go:12-39` — add `GetAllProblems` to the `Storage` interface
- **Modify** `backend/internal/storage/postgres/problems.go` — implement `GetAllProblems` on `Postgres`
- **Modify** `backend/cmd/server/main.go:42-44` — wrap `pg` with `processcache.New` before passing to `server.New`

---

## Task 1: Add `GetAllProblems` to the Storage interface and Postgres

`CachedStorage` needs to load all problems from its inner storage. The `Storage` interface currently has no "get all" method, so we add one.

**Files:**
- Modify: `backend/internal/storage/storage.go`
- Modify: `backend/internal/storage/postgres/problems.go`

- [ ] **Step 1: Add `GetAllProblems` to the Storage interface**

Open `backend/internal/storage/storage.go`. Add the new method to the `// problems` group:

```go
// problems
GetAllProblems(ctx context.Context) ([]models.Problem, error)
GetRandomProblem(ctx context.Context) (models.Problem, error)
GetRandomProblemFiltered(ctx context.Context, q, difficulty string, tags []string, tagMatch, excludeID string) (models.Problem, error)
GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
SearchProblems(ctx context.Context, q, difficulty string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)
GetProblemTags(ctx context.Context) ([]types.ProblemTag, error)
```

- [ ] **Step 2: Verify the build fails with the missing method**

Run from `backend/`:
```bash
go build ./...
```
Expected: compile error — `*Postgres does not implement Storage (missing GetAllProblems method)`

- [ ] **Step 3: Implement `GetAllProblems` on `Postgres`**

Add to the bottom of `backend/internal/storage/postgres/problems.go`:

```go
func (p *Postgres) GetAllProblems(ctx context.Context) ([]models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
		FROM problems
		ORDER BY leetcode_id ASC NULLS LAST`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
	})
}
```

- [ ] **Step 4: Verify the build passes**

```bash
go build ./...
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/internal/storage/storage.go backend/internal/storage/postgres/problems.go
git commit -m "feat: add GetAllProblems to Storage interface and Postgres"
```

---

## Task 2: Implement the `processcache` package

**Files:**
- Create: `backend/internal/storage/processcache/process_cache_test.go`
- Create: `backend/internal/storage/processcache/process_cache.go`

- [ ] **Step 1: Create the test file with a stub inner storage**

Create `backend/internal/storage/processcache/process_cache_test.go`:

```go
package processcache

import (
	"context"
	"testing"
	"time"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

// stubStorage implements storage.Storage minimally for testing.
// Only GetAllProblems is implemented; all other methods panic if called.
type stubStorage struct {
	problems  []models.Problem
	callCount int
}

func (s *stubStorage) GetAllProblems(_ context.Context) ([]models.Problem, error) {
	s.callCount++
	return s.problems, nil
}

// Implement the rest of storage.Storage as panics — should never be called in these tests.
func (s *stubStorage) Ping(_ context.Context) error                        { panic("unexpected") }
func (s *stubStorage) GetRandomProblem(_ context.Context) (models.Problem, error) {
	panic("unexpected")
}
func (s *stubStorage) GetRandomProblemFiltered(_ context.Context, _, _ string, _ []string, _, _ string) (models.Problem, error) {
	panic("unexpected")
}
func (s *stubStorage) GetProblemByID(_ context.Context, _ uuid.UUID) (models.Problem, error) {
	panic("unexpected")
}
func (s *stubStorage) SearchProblems(_ context.Context, _, _ string, _ []string, _ string, _, _ int) (types.ProblemSearchResponse, error) {
	panic("unexpected")
}
func (s *stubStorage) GetProblemTags(_ context.Context) ([]types.ProblemTag, error) {
	panic("unexpected")
}
func (s *stubStorage) UpsertPracticeDay(_ context.Context, _ uuid.UUID) error { panic("unexpected") }
func (s *stubStorage) GetStreak(_ context.Context, _ uuid.UUID) (int, error)  { panic("unexpected") }
func (s *stubStorage) GetUserSettings(_ context.Context, _ uuid.UUID) (models.UserSettings, error) {
	panic("unexpected")
}
func (s *stubStorage) UpsertUserSettings(_ context.Context, _ uuid.UUID, _ []string, _ bool, _ []string, _ bool) error {
	panic("unexpected")
}
func (s *stubStorage) SaveProblem(_ context.Context, _, _ uuid.UUID) error   { panic("unexpected") }
func (s *stubStorage) UnsaveProblem(_ context.Context, _, _ uuid.UUID) error { panic("unexpected") }
func (s *stubStorage) GetSavedProblems(_ context.Context, _ uuid.UUID) ([]models.Problem, error) {
	panic("unexpected")
}
func (s *stubStorage) UpsertTopicProficiency(_ context.Context, _, _ uuid.UUID, _, _ string, _, _, _ float64) error {
	panic("unexpected")
}
func (s *stubStorage) GetTopicProficiencies(_ context.Context, _ uuid.UUID) ([]models.TopicProficiency, error) {
	panic("unexpected")
}
func (s *stubStorage) GetProficiencyHistory(_ context.Context, _ uuid.UUID) ([]models.ProficiencySnapshot, error) {
	panic("unexpected")
}

// test data
var (
	id1  = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	id2  = uuid.MustParse("00000000-0000-0000-0000-000000000002")
	id3  = uuid.MustParse("00000000-0000-0000-0000-000000000003")
	lid1 = 1
	lid2 = 2
	lid3 = 3
)

var testProblems = []models.Problem{
	{Id: id1, Title: "Two Sum", Difficulty: "Easy", TopicTags: []string{"array", "hash-table"}, LeetcodeID: &lid1},
	{Id: id2, Title: "Add Two Numbers", Difficulty: "Medium", TopicTags: []string{"linked-list", "math"}, LeetcodeID: &lid2},
	{Id: id3, Title: "Longest Substring", Difficulty: "Medium", TopicTags: []string{"string", "hash-table"}, LeetcodeID: &lid3},
}

func newCache(problems []models.Problem) *CachedStorage {
	return New(&stubStorage{problems: problems}, time.Hour)
}

func TestGetProblemTags_DerivedFromProblems(t *testing.T) {
	c := newCache(testProblems)
	tags, err := c.GetProblemTags(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// expect: array=1, hash-table=2, linked-list=1, math=1, string=1 — sorted by name
	expected := []types.ProblemTag{
		{Name: "array", Count: 1},
		{Name: "hash-table", Count: 2},
		{Name: "linked-list", Count: 1},
		{Name: "math", Count: 1},
		{Name: "string", Count: 1},
	}
	if len(tags) != len(expected) {
		t.Fatalf("got %d tags, want %d", len(tags), len(expected))
	}
	for i, want := range expected {
		if tags[i].Name != want.Name || tags[i].Count != want.Count {
			t.Errorf("tag[%d]: got {%s %d}, want {%s %d}", i, tags[i].Name, tags[i].Count, want.Name, want.Count)
		}
	}
}

func TestGetRandomProblem_ReturnsAProblem(t *testing.T) {
	c := newCache(testProblems)
	p, err := c.GetRandomProblem(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Id == uuid.Nil {
		t.Error("returned problem has nil ID")
	}
}

func TestGetRandomProblem_EmptyProblems_ReturnsNotFound(t *testing.T) {
	c := newCache([]models.Problem{})
	_, err := c.GetRandomProblem(context.Background())
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestGetRandomProblemFiltered_ByDifficulty(t *testing.T) {
	c := newCache(testProblems)
	for range 20 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", "Easy", nil, "and", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Difficulty != "Easy" {
			t.Errorf("got difficulty %s, want Easy", p.Difficulty)
		}
	}
}

func TestGetRandomProblemFiltered_ByTagAnd(t *testing.T) {
	c := newCache(testProblems)
	// only id3 has both "string" AND "hash-table"... wait, id1 has array+hash-table, id3 has string+hash-table
	// filtering for "hash-table" AND "string" should only return id3
	for range 10 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", "", []string{"hash-table", "string"}, "and", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id != id3 {
			t.Errorf("expected id3, got %s", p.Id)
		}
	}
}

func TestGetRandomProblemFiltered_ByTagOr(t *testing.T) {
	c := newCache(testProblems)
	// "math" OR "array" matches id1 and id2
	seen := map[uuid.UUID]bool{}
	for range 50 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", "", []string{"math", "array"}, "or", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id != id1 && p.Id != id2 {
			t.Errorf("unexpected problem %s", p.Id)
		}
		seen[p.Id] = true
	}
	if !seen[id1] || !seen[id2] {
		t.Error("expected both id1 and id2 to appear in 50 samples")
	}
}

func TestGetRandomProblemFiltered_ExcludeID(t *testing.T) {
	c := newCache(testProblems)
	for range 20 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", "", nil, "and", id1.String())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id == id1 {
			t.Error("excluded id1 was returned")
		}
	}
}

func TestGetRandomProblemFiltered_NoMatch_ReturnsNotFound(t *testing.T) {
	c := newCache(testProblems)
	_, err := c.GetRandomProblemFiltered(context.Background(), "", "Hard", nil, "and", "")
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestGetProblemByID_Found(t *testing.T) {
	c := newCache(testProblems)
	p, err := c.GetProblemByID(context.Background(), id2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Id != id2 {
		t.Errorf("got %s, want %s", p.Id, id2)
	}
}

func TestGetProblemByID_NotFound(t *testing.T) {
	c := newCache(testProblems)
	missing := uuid.MustParse("00000000-0000-0000-0000-000000000099")
	_, err := c.GetProblemByID(context.Background(), missing)
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestSearchProblems_FilterByDifficulty(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", "Medium", nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 2 {
		t.Errorf("total: got %d, want 2", resp.Total)
	}
	for _, p := range resp.Problems {
		if p.Difficulty != "Medium" {
			t.Errorf("got difficulty %s, want Medium", p.Difficulty)
		}
	}
}

func TestSearchProblems_SortedByLeetcodeID(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", "", nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 1; i < len(resp.Problems); i++ {
		if resp.Problems[i-1].LeetcodeID != nil && resp.Problems[i].LeetcodeID != nil {
			if *resp.Problems[i-1].LeetcodeID > *resp.Problems[i].LeetcodeID {
				t.Errorf("not sorted at index %d: %d > %d", i, *resp.Problems[i-1].LeetcodeID, *resp.Problems[i].LeetcodeID)
			}
		}
	}
}

func TestSearchProblems_Pagination(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", "", nil, "and", 2, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
	if len(resp.Problems) != 1 {
		t.Errorf("page 2 size: got %d, want 1", len(resp.Problems))
	}
}

func TestSearchProblems_PageBeyondEnd_ReturnsEmpty(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", "", nil, "and", 99, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Problems) != 0 {
		t.Errorf("expected empty problems, got %d", len(resp.Problems))
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
}

func TestSearchProblems_TitleSubstringMatch(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "two", "", nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 1 || resp.Problems[0].Id != id1 {
		t.Errorf("expected id1 for query 'two', got total=%d", resp.Total)
	}
}

func TestCacheHit_LoadsOnce(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Hour)

	for range 5 {
		if _, err := c.GetRandomProblem(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if stub.callCount != 1 {
		t.Errorf("GetAllProblems called %d times, want 1", stub.callCount)
	}
}

func TestCacheExpiry_ReloadsAfterTTL(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Millisecond)

	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if stub.callCount != 2 {
		t.Errorf("GetAllProblems called %d times after expiry, want 2", stub.callCount)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && go test ./internal/storage/processcache/...
```
Expected: compile error — package `processcache` does not exist yet

- [ ] **Step 3: Create `process_cache.go`**

Create `backend/internal/storage/processcache/process_cache.go`:

```go
package processcache

import (
	"context"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"leetgame/internal/models"
	"leetgame/internal/storage"
	"leetgame/internal/types"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	"github.com/google/uuid"
)

type CachedStorage struct {
	inner    storage.Storage
	ttl      time.Duration
	mu       sync.RWMutex
	problems []models.Problem
	byID     map[uuid.UUID]models.Problem
	tags     []types.ProblemTag
	loadedAt time.Time
}

func New(inner storage.Storage, ttl time.Duration) *CachedStorage {
	return &CachedStorage{inner: inner, ttl: ttl}
}

func (c *CachedStorage) getOrLoad(ctx context.Context) ([]models.Problem, map[uuid.UUID]models.Problem, []types.ProblemTag, error) {
	c.mu.RLock()
	if !c.loadedAt.IsZero() && time.Since(c.loadedAt) < c.ttl {
		problems, byID, tags := c.problems, c.byID, c.tags
		c.mu.RUnlock()
		return problems, byID, tags, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.loadedAt.IsZero() && time.Since(c.loadedAt) < c.ttl {
		return c.problems, c.byID, c.tags, nil
	}
	return c.load(ctx)
}

func (c *CachedStorage) load(ctx context.Context) ([]models.Problem, map[uuid.UUID]models.Problem, []types.ProblemTag, error) {
	problems, err := c.inner.GetAllProblems(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	byID := make(map[uuid.UUID]models.Problem, len(problems))
	for _, p := range problems {
		byID[p.Id] = p
	}
	tags := deriveTags(problems)
	c.problems = problems
	c.byID = byID
	c.tags = tags
	c.loadedAt = time.Now()
	return problems, byID, tags, nil
}

func deriveTags(problems []models.Problem) []types.ProblemTag {
	counts := make(map[string]int)
	for _, p := range problems {
		for _, tag := range p.TopicTags {
			counts[tag]++
		}
	}
	tags := make([]types.ProblemTag, 0, len(counts))
	for name, count := range counts {
		tags = append(tags, types.ProblemTag{Name: name, Count: count})
	}
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})
	return tags
}

func matchesProblem(p models.Problem, q, difficulty string, tags []string, tagMatch, excludeID string) bool {
	if excludeID != "" && p.Id.String() == excludeID {
		return false
	}
	if q != "" && !strings.Contains(strings.ToLower(p.Title), strings.ToLower(q)) {
		return false
	}
	if difficulty != "" && p.Difficulty != difficulty {
		return false
	}
	if len(tags) == 0 {
		return true
	}
	switch tagMatch {
	case "or":
		for _, tag := range tags {
			for _, pt := range p.TopicTags {
				if pt == tag {
					return true
				}
			}
		}
		return false
	default: // "and"
		for _, tag := range tags {
			found := false
			for _, pt := range p.TopicTags {
				if pt == tag {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
}

// --- intercepted methods ---

func (c *CachedStorage) GetAllProblems(ctx context.Context) ([]models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	return problems, err
}

func (c *CachedStorage) GetRandomProblem(ctx context.Context) (models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	if len(problems) == 0 {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{}))
	}
	return problems[rand.Intn(len(problems))], nil
}

func (c *CachedStorage) GetRandomProblemFiltered(ctx context.Context, q, difficulty string, tags []string, tagMatch, excludeID string) (models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	filtered := make([]models.Problem, 0)
	for _, p := range problems {
		if matchesProblem(p, q, difficulty, tags, tagMatch, excludeID) {
			filtered = append(filtered, p)
		}
	}
	if len(filtered) == 0 {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{}))
	}
	return filtered[rand.Intn(len(filtered))], nil
}

func (c *CachedStorage) GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error) {
	_, byID, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	p, ok := byID[id]
	if !ok {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{"id": id.String()}))
	}
	return p, nil
}

func (c *CachedStorage) SearchProblems(ctx context.Context, q, difficulty string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return types.ProblemSearchResponse{}, err
	}
	filtered := make([]models.Problem, 0)
	for _, p := range problems {
		if matchesProblem(p, q, difficulty, tags, tagMatch, "") {
			filtered = append(filtered, p)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].LeetcodeID == nil {
			return false
		}
		if filtered[j].LeetcodeID == nil {
			return true
		}
		return *filtered[i].LeetcodeID < *filtered[j].LeetcodeID
	})
	total := len(filtered)
	start := (page - 1) * pageSize
	if start >= total {
		return types.ProblemSearchResponse{
			Problems: []models.Problem{},
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		}, nil
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return types.ProblemSearchResponse{
		Problems: filtered[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (c *CachedStorage) GetProblemTags(ctx context.Context) ([]types.ProblemTag, error) {
	_, _, tags, err := c.getOrLoad(ctx)
	return tags, err
}

// --- pass-through methods ---

func (c *CachedStorage) Ping(ctx context.Context) error {
	return c.inner.Ping(ctx)
}

func (c *CachedStorage) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	return c.inner.UpsertPracticeDay(ctx, userID)
}

func (c *CachedStorage) GetStreak(ctx context.Context, userID uuid.UUID) (int, error) {
	return c.inner.GetStreak(ctx, userID)
}

func (c *CachedStorage) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	return c.inner.GetUserSettings(ctx, userID)
}

func (c *CachedStorage) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, activeTopics []string, tourDone bool) error {
	return c.inner.UpsertUserSettings(ctx, userID, activeStages, hideTitle, activeTopics, tourDone)
}

func (c *CachedStorage) SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	return c.inner.SaveProblem(ctx, userID, problemID)
}

func (c *CachedStorage) UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	return c.inner.UnsaveProblem(ctx, userID, problemID)
}

func (c *CachedStorage) GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error) {
	return c.inner.GetSavedProblems(ctx, userID)
}

func (c *CachedStorage) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error {
	return c.inner.UpsertTopicProficiency(ctx, userID, problemID, topic, stage, sessionScore, scale, floor)
}

func (c *CachedStorage) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	return c.inner.GetTopicProficiencies(ctx, userID)
}

func (c *CachedStorage) GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error) {
	return c.inner.GetProficiencyHistory(ctx, userID)
}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && go test ./internal/storage/processcache/... -v
```
Expected: all tests pass

- [ ] **Step 5: Verify full build still passes**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/internal/storage/processcache/
git commit -m "feat: add process-level problem cache wrapping Storage interface"
```

---

## Task 3: Wire the cache in `main.go`

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add the import**

In `backend/cmd/server/main.go`, add to the import block:

```go
"leetgame/internal/storage/processcache"
```

- [ ] **Step 2: Wrap `pg` with `processcache.New`**

Replace:

```go
app := server.New(&server.Config{
    Storage: pg,
```

With:

```go
store := processcache.New(pg, time.Hour)

app := server.New(&server.Config{
    Storage: store,
```

Also add `"time"` to the import block if not already present.

- [ ] **Step 3: Build and verify**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat: wire process cache in main — problems served from memory with 1h TTL"
```
