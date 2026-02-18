# Implementation Plan: Testing & CI Hardening

**Branch**: `005-testing-ci` | **Date**: 2026-02-18 | **Spec**: `specs/005-testing-ci/spec.md`
**Input**: Feature specification from `/specs/005-testing-ci/spec.md`

## Summary

Harden the project's testing and CI pipeline to enforce quality gates on `main`. Six changes: (1) add `@vitest/coverage-v8` with measure-then-set thresholds to both workspaces, (2) restructure CI from a single job to 4 parallel jobs that run all tests (including frontend) with coverage, (3) protect `main` branch — PR-only, rebase-merge, CI-required, (4) write backend system tests exercising the full Express+DB+WebSocket stack, (5) add frontend component rendering tests via React Testing Library, (6) reorganize frontend tests from version-named to module-named files with a regression suite.

**Current state**: 191 test cases across 13 files. CI runs backend tests only. No coverage. No branch protection. Empty system test directories. Frontend tests are logic-only (no rendering).

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Vitest 2.1.0, React 18, Express 4, better-sqlite3, supertest, @testing-library/react, @testing-library/jest-dom, ws 8
**New Dependencies**: `@vitest/coverage-v8` (devDependency, both workspaces)
**Storage**: SQLite (better-sqlite3) with WAL mode — no schema changes
**Testing**: Vitest (backend: node env, frontend: jsdom env), supertest for HTTP, ws for WebSocket client
**Target Platform**: GitHub Actions CI (ubuntu-latest runners), Node.js 20 LTS
**Project Type**: Web application (backend + frontend npm workspaces)
**Performance Goals**: CI pipeline completes in <5 minutes (parallel jobs)
**Constraints**: No external CI services (Codecov, etc.) — self-contained GitHub Actions artifacts
**Scale/Scope**: ~3,500 LOC across backend+frontend, 191 existing tests, 2 workspaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | This IS the testing improvement — adds coverage thresholds, system tests, component tests, regression suite |
| II. UX-First Design | N/A | Infrastructure change, no user-facing UX changes |
| III. UI Quality & Consistency | N/A | No UI changes |
| IV. Simplicity | PASS | Native Vitest coverage plugin, standard GitHub branch protection, minimal new abstractions |
| V. CI/CD Pipeline & Autonomous Merge | PASS | Core focus — enforces PR-only merges, CI-required, rebase strategy, all tests in pipeline |
| VI. Frontend Plugin Quality | PASS | `@vitest/coverage-v8` is the official Vitest coverage provider, actively maintained |
| VII. Backend Security & Correctness | PASS | Branch protection prevents unauthorized changes to `main` |
| VIII. Observability & Logging | PASS | Coverage reports provide visibility into test quality; CI logs show test results |

**Post-Phase 1 re-check**: All principles still PASS. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/005-testing-ci/
├── plan.md              # This file
├── research.md          # Phase 0 output — 9 technical decisions
├── data-model.md        # Phase 1 output — no data model changes (infrastructure feature)
├── quickstart.md        # Phase 1 output — verification steps
├── contracts/           # Phase 1 output — CI workflow contract (YAML schema)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci.yml                              # MODIFY: 4 parallel jobs, coverage, frontend tests

backend/
├── vitest.config.ts                        # MODIFY: add coverage provider + thresholds
├── vitest.system.config.ts                 # NO CHANGE (already has 60s timeout, system/ glob)
├── package.json                            # MODIFY: add test:coverage script, @vitest/coverage-v8
└── tests/
    └── system/
        ├── test-server.ts                  # CREATE: shared test server factory
        ├── server-lifecycle.test.ts         # CREATE: HTTP + session lifecycle system tests
        └── websocket.test.ts               # CREATE: WebSocket event system tests

frontend/
├── vitest.config.ts                        # MODIFY: add coverage provider + thresholds
├── package.json                            # MODIFY: add test:coverage script, @vitest/coverage-v8
└── tests/
    ├── test-utils.ts                       # CREATE: shared mock factories
    └── unit/
        ├── components/
        │   └── session-card.test.tsx        # CREATE: SessionCard rendering tests
        ├── diff-parser.test.ts             # KEEP (already module-named)
        ├── api.test.ts                     # KEEP (already module-named)
        ├── diff-viewer.test.ts             # CREATE: reorganized from v5/v6/v7/v9
        ├── file-viewer.test.ts             # CREATE: reorganized from v7/v9
        ├── session-grid.test.ts            # CREATE: reorganized from v5/v6/v8
        ├── comments.test.ts                # CREATE: reorganized from v7/v8/v9
        ├── regression.test.ts              # CREATE: regression test suite
        ├── v5-features.test.ts             # DELETE after reorganization
        ├── v6-features.test.ts             # DELETE after reorganization
        ├── v7-features.test.ts             # DELETE after reorganization
        ├── v8-multy-ux.test.ts             # DELETE after reorganization
        └── v9-ux-polish.test.ts            # DELETE after reorganization

scripts/
└── setup-branch-protection.sh              # CREATE: one-time GitHub branch protection setup

package.json                                # MODIFY: add test:coverage root script
```

**Structure Decision**: Existing web application structure with backend/ and frontend/ workspaces. No new workspaces or directories beyond what's listed. System tests go in the existing (empty) `backend/tests/system/` directory. Frontend component tests get a `components/` subdirectory under the existing `tests/unit/`.

## Implementation Approach

### What's Already In Place

- **Vitest 2.1.0** configured in both workspaces with separate configs
- **System test config** exists at `backend/vitest.system.config.ts` (60s timeout, `tests/system/**/*.test.ts` glob)
- **`npm run test:system`** script exists in `backend/package.json`
- **Integration test patterns**: `createTestDb()` for in-memory SQLite, `createMockPtySpawner()` for fake PTY, supertest for HTTP
- **FakePtySpawner** class with event simulation in `backend/tests/unit/session-lifecycle.test.ts`
- **Route factories**: `createSessionsRouter(repo, sessionManager)`, `createSettingsRouter(repo)`, etc. — composable for test servers
- **WebSocket setup**: `setupWebSocket(server, repo, sessionManager, ptySpawner)` — attachable to test HTTP server
- **React Testing Library** + `@testing-library/jest-dom` already installed in frontend
- **Frontend test setup** (`frontend/tests/setup.ts`) imports jest-dom matchers
- **coverage/** in `.gitignore` — ready for coverage output

### Phase 1: Coverage Infrastructure (US3)

Install `@vitest/coverage-v8` in both workspaces. Add coverage configuration to vitest configs. Measure current coverage, set thresholds at `current - 2%`.

**Backend vitest.config.ts** — add to `test` block:
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.d.ts'],
  thresholds: { lines: TBD, branches: TBD, functions: TBD, statements: TBD }
}
```

**Frontend vitest.config.ts** — same pattern, include `src/**/*.{ts,tsx}`, exclude `src/vite-env.d.ts`.

### Phase 2: CI Pipeline Enhancement (US2)

Restructure `.github/workflows/ci.yml` from 1 sequential job → 4 parallel jobs:

| Job | Steps | Duration |
|-----|-------|----------|
| `lint-typecheck` | checkout → node 20 → npm ci → lint → tsc (both) | ~1 min |
| `test-backend` | checkout → node 20 → build-essential → npm ci → vitest --coverage → upload artifact | ~2 min |
| `test-frontend` | checkout → node 20 → npm ci → vitest --coverage → vite build → upload artifact | ~1.5 min |
| `test-system` | checkout → node 20 → build-essential → npm ci → vitest system | ~2 min |

`test-system` depends on `test-backend` (sequential). All others run in parallel.

### Phase 3: Branch Protection (US1)

One-time script using `gh api repos/{owner}/{repo}/branches/main/protection` to set:
- Required status checks: `lint-typecheck`, `test-backend`, `test-frontend`
- Strict: branch must be up to date before merging
- Linear history required (rebase-merge only)
- No force pushes, no deletions
- No review requirement (solo dev)

### Phase 4: System Tests (US4)

**test-server.ts** — factory that:
1. Creates in-memory SQLite via `createTestDb()`
2. Creates `FakePtySpawner` (reuse from session-lifecycle.test.ts)
3. Wires up all route factories + WebSocket on an Express app
4. Listens on port 0 (random), returns `{ app, server, port, db, close() }`

**server-lifecycle.test.ts** — tests:
- Server responds to root/health endpoint
- POST /api/sessions creates session with correct defaults
- GET /api/sessions lists sessions
- Full lifecycle: create → queue → activate → complete
- Multiple sessions queue with FIFO ordering
- Settings CRUD: GET → PATCH → GET
- Comments workflow: create → list → mark sent → verify

**websocket.test.ts** — tests:
- WebSocket client connects to `/ws/sessions/:id`
- Session events (creation, status change) emit WebSocket messages
- Uses `ws` package as test client

### Phase 5: Frontend Component Tests (US5)

**session-card.test.tsx** — renders `SessionCard` with React Testing Library:
- Renders title and working directory
- Shows correct status badge (active/queued/completed/failed)
- Shows needs_input "!" indicator when true
- Shows pin indicator when locked
- Fires callback on action button clicks

Components like DiffViewer and FileViewer depend heavily on Monaco Editor which doesn't work in jsdom. Tests for those are limited to logic (already covered) or deferred to Playwright.

### Phase 6: Test Reorganization (US6)

Move tests from v*-features files into module-named files:
- v5 DiffViewer tests → `diff-viewer.test.ts`
- v5/v6 SessionGrid/overflow tests → `session-grid.test.ts`
- v7 FileViewer save/comment tests → `file-viewer.test.ts`
- v7/v8/v9 comment tests → `comments.test.ts`
- v8 multy-ux pin/focus tests → `session-grid.test.ts`

Extract shared mock factories into `frontend/tests/test-utils.ts`:
- `createMockSession(overrides?)` → Session with sensible defaults
- `createMockComment(overrides?)` → CommentData with sensible defaults

Create `regression.test.ts` with labeled tests for known fixes.

## Notes

- Branch protection is configured via GitHub API, not in-repo — the script is for reproducibility and documentation
- Coverage thresholds are measured-then-set — T005 runs coverage first, then commits thresholds
- System tests reuse existing `FakePtySpawner` and `createTestDb()` — no mocking framework needed
- Frontend component tests are limited to jsdom-compatible components (SessionCard, SessionGrid) — Monaco-dependent components need Playwright
- The test reorganization (Phase 6) is a separate concern from infrastructure (Phases 1-3) — could be a separate PR if needed
- `@vitest/coverage-v8` is devDependency only — zero production impact
- No new runtime dependencies
