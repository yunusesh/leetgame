# GitHub Actions CI

## Goal

Add a CI workflow that runs on every push to `main` and every PR targeting `main`, running backend tests and frontend checks in parallel.

## Trigger

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

## Jobs

### `backend`

Working directory: `backend/`

| Step | Action |
|---|---|
| Checkout | `actions/checkout@v4` |
| Setup Go | `actions/setup-go@v5`, version from `backend/go.mod`, cache keyed on `backend/go.sum` |
| Vet | `go vet ./...` |
| Test | `go test ./...` |

### `frontend`

Working directory: `frontend/`

| Step | Action |
|---|---|
| Checkout | `actions/checkout@v4` |
| Setup Node | `actions/setup-node@v4`, Node 24.x pinned, `npm` cache keyed on `frontend/package-lock.json` |
| Install | `npm ci` |
| Build | `npm run build` (runs `tsc -b && vite build` — catches type errors and broken imports) |
| Lint | `npm run lint` |

Both jobs run in parallel on `ubuntu-latest`.

## Files

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | New — single workflow with two parallel jobs |

## Out of Scope

- Deployment steps
- E2E tests
- Secret-dependent integration tests (no DB in CI)
- Per-PR preview environments
