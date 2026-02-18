# Tasks: Testing & CI Hardening

**Input**: Design documents from `/specs/005-testing-ci/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US1-US3 (all P1) have natural dependencies: coverage config → CI pipeline → branch protection. US4-US6 are independent of each other.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- All paths relative to repository root: `/home/ubuntu/projects/ClaudeQueue`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the single new dependency (`@vitest/coverage-v8`) and add the root-level coverage script. No configuration yet — just make the tools available.

- [X] T001 [P] Install `@vitest/coverage-v8` as devDependency in backend workspace — run `npm install -D @vitest/coverage-v8 --workspace=backend` from repo root. Verify it appears in `backend/package.json` devDependencies.
- [X] T002 [P] Install `@vitest/coverage-v8` as devDependency in frontend workspace — run `npm install -D @vitest/coverage-v8 --workspace=frontend` from repo root. Verify it appears in `frontend/package.json` devDependencies.
- [X] T003 [P] Add `test:coverage` script to backend/package.json — add `"test:coverage": "vitest run --coverage"` to the scripts section. Verify `npm run test:coverage --workspace=backend` executes without error (coverage report prints to stdout, no thresholds yet).
- [X] T004 [P] Add `test:coverage` script to frontend/package.json — add `"test:coverage": "vitest run --coverage"` to the scripts section. Verify `npm run test:coverage --workspace=frontend` executes without error.
- [X] T005 Add root-level `test:coverage` script to package.json — add `"test:coverage": "npm run test:coverage --workspaces"` to the root package.json scripts section. Verify `npm run test:coverage` from repo root runs both workspace coverage reports sequentially.

**Checkpoint**: `@vitest/coverage-v8` installed in both workspaces. `npm run test:coverage` works from root, backend, and frontend. No thresholds yet — just reporting.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configure coverage providers and measure current levels to set thresholds. This MUST complete before CI can enforce coverage gates (US2) and before branch protection references CI jobs (US1).

**⚠️ CRITICAL**: US2 (CI) and US1 (branch protection) cannot begin until coverage is configured.

- [X] T006 [P] Configure coverage provider in backend/vitest.config.ts — add `coverage` block inside `defineConfig({ test: { ... } })` with: `provider: 'v8'`, `reporter: ['text', 'lcov']`, `reportsDirectory: './coverage'`, `include: ['src/**/*.ts']`, `exclude: ['src/**/*.d.ts']`. Do NOT add thresholds yet. Run `npm run test:coverage --workspace=backend` to verify lcov.info is generated in `backend/coverage/`.
- [X] T007 [P] Configure coverage provider in frontend/vitest.config.ts — add `coverage` block inside `defineConfig({ test: { ... } })` with: `provider: 'v8'`, `reporter: ['text', 'lcov']`, `reportsDirectory: './coverage'`, `include: ['src/**/*.{ts,tsx}']`, `exclude: ['src/vite-env.d.ts']`. Do NOT add thresholds yet. Run `npm run test:coverage --workspace=frontend` to verify lcov.info is generated in `frontend/coverage/`.
- [X] T008 Measure current coverage and set thresholds in both vitest configs — run `npm run test:coverage` from root and record the line, branch, function, and statement percentages for each workspace. Then add `thresholds` to both `backend/vitest.config.ts` and `frontend/vitest.config.ts` set at `measured value - 2` (rounded down to nearest integer). Run `npm run test:coverage` again to verify thresholds pass. If any metric is below 5%, set that threshold to 0 (avoid blocking on untestable generated code).

**Checkpoint**: Both workspaces have coverage configured with realistic thresholds. `npm run test:coverage` passes. Coverage reports exist in `backend/coverage/` and `frontend/coverage/`.

---

## Phase 3: User Story 3 — Coverage Thresholds Prevent Regression (Priority: P1) 🎯 MVP

**Goal**: Coverage thresholds are enforced locally and will be enforced in CI. Removing tests causes vitest to fail.

**Independent Test**: Remove a backend test file temporarily → `npm run test:coverage --workspace=backend` exits non-zero with threshold violation message → restore the file → passes again.

*No additional tasks needed — Phase 2 already implements the full US3 functionality. This phase serves as the validation checkpoint.*

**Checkpoint**: US3 acceptance scenarios 1-5 are all satisfied by T006-T008. Coverage configured, thresholds set, meaningful source files included/excluded.

---

## Phase 4: User Story 2 — CI Pipeline Runs All Tests with Coverage (Priority: P1)

**Goal**: GitHub Actions CI runs 4 parallel jobs: lint-typecheck, test-backend (with coverage), test-frontend (with coverage + build), test-system. Coverage artifacts uploaded.

**Independent Test**: Push a branch, open a PR. Verify 4 CI jobs appear. Introduce a failing frontend test → CI fails. Fix it → CI passes. Download coverage artifact from the workflow summary.

### Implementation for User Story 2

- [X] T009 [US2] Rewrite `.github/workflows/ci.yml` with 4 parallel jobs — replace the single `ci` job with the structure from `contracts/ci-workflow.yml`:

  **Job `lint-typecheck`**: `runs-on: ubuntu-latest` → `actions/checkout@v4` → `actions/setup-node@v4` (node-version: 20, cache: npm) → `npm ci` → `npm run lint --workspaces --if-present` → `npx tsc --noEmit` in backend/ → `npx tsc --noEmit` in frontend/

  **Job `test-backend`**: `runs-on: ubuntu-latest` → checkout → setup-node → `sudo apt-get update && sudo apt-get install -y build-essential` → `npm ci` → `cd backend && npx vitest run --coverage` → `actions/upload-artifact@v4` with name `backend-coverage`, path `backend/coverage/`

  **Job `test-frontend`**: `runs-on: ubuntu-latest` → checkout → setup-node → `npm ci` → `cd frontend && npx vitest run --coverage` → `cd frontend && npx vite build` → `actions/upload-artifact@v4` with name `frontend-coverage`, path `frontend/coverage/`

  **Job `test-system`**: `needs: [test-backend]` → `runs-on: ubuntu-latest` → checkout → setup-node → `sudo apt-get update && sudo apt-get install -y build-essential` → `npm ci` → `cd backend && npx vitest run --config vitest.system.config.ts`

  Triggers: `on: push: branches: [main]` and `on: pull_request`.

- [ ] T010 [US2] Verify CI works — push the `005-testing-ci` branch, open a draft PR against `main`. Verify: (1) all 4 jobs appear in GitHub Actions, (2) `lint-typecheck` passes, (3) `test-backend` passes and uploads coverage artifact, (4) `test-frontend` runs frontend tests (not just build) and uploads coverage artifact, (5) `test-system` runs (passes even with 0 system tests). Fix any CI failures before proceeding.

**Checkpoint**: PR shows 4 CI jobs. All pass. Coverage artifacts downloadable from workflow summary. Frontend tests execute in CI for the first time.

---

## Phase 5: User Story 1 — Protected Main Branch with PR-Only Merges (Priority: P1)

**Goal**: `main` is protected — no direct pushes, CI required, rebase-merge only, linear history enforced.

**Independent Test**: Try `git push origin main` directly → rejected. Open a PR → CI runs → merge enabled only after all checks pass → merged via rebase.

### Implementation for User Story 1

- [X] T011 [US1] Create branch protection setup script at scripts/setup-branch-protection.sh — the script must:
  1. Check that `gh` CLI is installed and authenticated (`gh auth status`)
  2. Detect the repo owner/name via `gh repo view --json owner,name`
  3. PUT branch protection rules to `repos/{owner}/{repo}/branches/main/protection` using `gh api` with the exact payload from `contracts/branch-protection.json`: required status checks (`lint-typecheck`, `test-backend`, `test-frontend` with strict=true), enforce_admins=true, required_pull_request_reviews=null, restrictions=null, required_linear_history=true, allow_force_pushes=false, allow_deletions=false
  4. Configure the repo to allow only rebase-merge: `gh api repos/{owner}/{repo} -X PATCH -f allow_merge_commit=false -f allow_squash_merge=false -f allow_rebase_merge=true`
  5. Print success confirmation with the protection rules applied
  6. Make the script executable (`chmod +x`)

- [ ] T012 [US1] Run the branch protection script and verify — execute `scripts/setup-branch-protection.sh`. Verify via `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'` that the 3 required checks are listed. Verify `gh api repos/{owner}/{repo} --jq '.allow_rebase_merge'` returns `true` and the other two merge strategies return `false`.

**Checkpoint**: `main` is protected. Direct pushes rejected. PRs require lint-typecheck + test-backend + test-frontend to pass. Only rebase-merge allowed.

---

## Phase 6: User Story 4 — System Tests Validate End-to-End Workflows (Priority: P2)

**Goal**: Backend system tests exercise the full Express server + SQLite + WebSocket stack via real HTTP requests against a test server running on a random port.

**Independent Test**: Run `npm run test:system` from repo root. Tests start a real server, create sessions, verify lifecycle, check WebSocket events. All pass locally and in CI.

### Implementation for User Story 4

- [X] T013 [US4] Create system test server helper at backend/tests/system/test-server.ts — export a `createTestServer()` async function that:
  1. Calls `createTestDb()` from `../../src/models/db.js` to get an in-memory SQLite database
  2. Creates a `Repository` from `../../src/models/repository.js`
  3. Creates a mock PTY spawner (reuse the `createMockPtySpawner` pattern from `backend/tests/integration/api-sessions.test.ts` — the spawner extends EventEmitter, has `spawn()` returning `{ pid, sessionId, write: ()=>{}, resize: ()=>{}, kill: ()=>{ emit exit } }`, and `spawnContinue = spawn`)
  4. Creates `QueueManager(repo)` and `SessionManager(repo, ptySpawner, queueManager)`
  5. Creates an Express app with `express.json()` middleware and registers ALL route factories: `createSettingsRouter(repo)`, `createSessionsRouter(repo, sessionManager)`, `createFilesRouter(repo)` (skip if it requires real filesystem — wrap in try/catch)
  6. Creates `http.createServer(app)` and calls `setupWebSocket(server, repo, sessionManager, ptySpawner)` from `../../src/api/websocket.js`
  7. Starts listening on port 0 (random) and resolves with `{ app, server, port, repo, sessionManager, ptySpawner, close() }` where `close()` stops the server, destroys sessionManager, and calls `closeDb()`
  8. Export a `getBaseUrl(port: number)` helper that returns `http://localhost:${port}`

- [X] T014 [US4] Create session lifecycle system tests at backend/tests/system/server-lifecycle.test.ts — using `createTestServer()`:
  - `describe('Server Lifecycle')`:
    - `beforeAll`: call `createTestServer()`, store server context
    - `afterAll`: call `close()`
  - **Test**: `GET /api/settings` returns 200 with default settings (maxConcurrentSessions, gridLayout, theme)
  - **Test**: `POST /api/sessions` with `{ workingDirectory: '/tmp/test', title: 'System Test' }` returns 201 with session id and status
  - **Test**: `GET /api/sessions` returns array containing the created session
  - **Test**: `GET /api/sessions/:id` returns the specific session with correct fields
  - **Test**: Session activation — create a session, verify it transitions to 'active' status (may need to wait for QueueManager dispatch event — use a small `setTimeout` or poll)
  - **Test**: Settings CRUD — `PATCH /api/settings` with `{ maxConcurrentSessions: 5 }` returns 200, then `GET /api/settings` shows the updated value
  - **Test**: Comments workflow — `POST /api/sessions/:id/comments` with `{ filePath: 'test.ts', startLine: 1, endLine: 1, codeSnippet: 'const x = 1', commentText: 'test comment' }` → `GET /api/sessions/:id/comments` returns the comment with status 'pending' → `POST /api/sessions/:id/comments/send` marks as sent → `GET` returns status 'sent'
  - Use `fetch` or `supertest` with `getBaseUrl(port)` for all requests

- [X] T015 [US4] Create WebSocket system tests at backend/tests/system/websocket.test.ts — using `createTestServer()` and the `ws` package:
  - `describe('WebSocket Events')`:
    - `beforeAll`: create test server, create a session via POST (need session ID for WS URL)
    - `afterAll`: close server
  - **Test**: WebSocket client connects to `ws://localhost:${port}/ws/sessions/${sessionId}` — connection opens without error, receives initial session data message
  - **Test**: Session status change triggers WebSocket message — create a session, connect WS, trigger a status change (e.g., send input), verify a message is received with updated session data
  - Use `Promise` wrappers with timeouts (5s) for async WS message assertions: `new Promise((resolve, reject) => { ws.on('message', (data) => { resolve(JSON.parse(data)) }); setTimeout(() => reject(new Error('timeout')), 5000) })`
  - Clean up WS connections in `afterEach`

- [ ] T016 [US4] Verify system tests pass locally and in CI — run `npm run test:system` from repo root (or `cd backend && npx vitest run --config vitest.system.config.ts`). All system tests should pass with the 60s timeout. Push the branch and verify the `test-system` CI job runs the new tests and passes.

**Checkpoint**: `npm run test:system` passes. Real Express server starts, HTTP + WebSocket interactions work, session lifecycle and comments workflow validated end-to-end. CI `test-system` job runs them.

---

## Phase 7: User Story 5 — Frontend Tests Cover Component Rendering (Priority: P2)

**Goal**: Frontend tests include React component rendering tests using React Testing Library. SessionCard is tested for correct rendering of title, status, working directory, and needs_input indicator.

**Independent Test**: Run `npm run test:frontend`. Component rendering tests execute alongside existing logic tests. Break a SessionCard prop → test fails with clear assertion.

### Implementation for User Story 5

- [X] T017 [P] [US5] Create shared test mock factories at frontend/tests/test-utils.ts — export:
  - `createMockSession(overrides?: Partial<Session>): Session` — returns a Session with defaults from `data-model.md`: id `'test-session-1'`, status `'active'`, workingDirectory `'/tmp/test'`, title `'Test Session'`, pid `12345`, needsInput `false`, lock `false`, etc. Uses spread to apply overrides.
  - `createMockComment(overrides?: Partial<CommentData>): CommentData` — returns a CommentData with defaults from `data-model.md`: id `'test-comment-1'`, filePath `'src/index.ts'`, startLine `10`, endLine `10`, status `'pending'`, side `'new'`, etc.
  - Import types from `../src/services/api`

- [X] T018 [US5] Create SessionCard rendering tests at frontend/tests/unit/components/session-card.test.tsx — import `SessionCard` from `../../../src/components/SessionCard`, import `render`, `screen`, `fireEvent` from `@testing-library/react`, import `createMockSession` from `../../test-utils`:
  - **Test**: Renders session title — `render(<SessionCard session={createMockSession({ title: 'My Session' })} />)` → `expect(screen.getByText('My Session')).toBeInTheDocument()`
  - **Test**: Renders working directory — create session with workingDirectory `/home/user/project` → verify text is in document
  - **Test**: Shows status text for active session — create session with `status: 'active'` → verify 'active' text appears (case-insensitive)
  - **Test**: Shows status text for queued session — create session with `status: 'queued'` → verify 'queued' text appears
  - **Test**: Shows needs_input indicator when needsInput is true — create session with `needsInput: true` → verify the "!" indicator element exists (look for text content "!" or a specific test id/class)
  - **Test**: Does not show needs_input indicator when needsInput is false — create session with `needsInput: false` → verify no "!" indicator
  - **Note**: If SessionCard requires context providers (e.g., router), wrap in necessary providers. If it requires callback props (onContinue, onKill, etc.), pass `vi.fn()` stubs.

- [ ] T019 [US5] Verify component tests run in CI — push the branch and verify `test-frontend` CI job includes the new component tests in its vitest output. The tests should appear in the test results alongside existing unit tests.

**Checkpoint**: `npm run test:frontend` passes with component rendering tests. SessionCard renders correctly for various session states. CI runs them.

---

## Phase 8: User Story 6 — Test Organization and Regression Suite (Priority: P3)

**Goal**: Frontend tests reorganized from version-named files (v5-v9) into module-named files. Shared mock factories used. Regression test file captures known bug fixes.

**Independent Test**: `ls frontend/tests/unit/` shows module-named files (diff-viewer.test.ts, session-grid.test.ts, etc.) — no v*-features.test.ts files remain. `npm run test:frontend` passes. Coverage thresholds still met.

### Implementation for User Story 6

- [X] T020 [US6] Reorganize v5-v9 frontend test files into module-named files — for each of the 5 files (`v5-features.test.ts`, `v6-features.test.ts`, `v7-features.test.ts`, `v8-multy-ux.test.ts`, `v9-ux-polish.test.ts`):
  1. Read the file and categorize each `describe`/`it` block by the component or module it tests
  2. Create or append to module-named target files:
     - DiffViewer tests (word wrap, overflow, layout, inline comments, code snippet extraction) → `frontend/tests/unit/diff-viewer.test.ts`
     - FileViewer tests (save button, comments, zone widgets, unsaved guard) → `frontend/tests/unit/file-viewer.test.ts`
     - SessionGrid/SessionCard tests (overflow strip, collapse, amber indicator, pin switching, focus session, rebuildDisplay) → `frontend/tests/unit/session-grid.test.ts`
     - Comment logic tests (ephemeral delete, side-aware display, edit state, Send All) → `frontend/tests/unit/comments.test.ts`
  3. Update imports in moved tests to use `createMockSession` and `createMockComment` from `../../test-utils` where applicable (replace inline mock objects)
  4. Keep `diff-parser.test.ts` and `api.test.ts` as-is (already module-named)
  5. Delete the now-empty v*-features files
  6. Run `npm run test:frontend` to verify all 67+ tests still pass
  7. Run `npm run test:coverage --workspace=frontend` to verify coverage thresholds still met

- [X] T021 [US6] Create regression test file at frontend/tests/unit/regression.test.ts — create the file with:
  - A header comment: `// Regression tests — captures known bugs that were fixed. Each test prevents the bug from recurring.`
  - **Test**: `// Regression: old-side comments must match old column line numbers, not new — fixed in 004-ux-polish` — verify that a comment with `side: 'old'` and `startLine: 5` only matches when the old column line number is 5 (not when the new column line number is 5)
  - **Test**: `// Regression: overflow bar must show amber background when sessions need input — fixed in 004-ux-polish` — verify the overflow indicator logic returns true when at least one overflow session has `needsInput: true`
  - **Test**: `// Regression: modified file tabs must require close confirmation — fixed in 004-ux-polish` — verify that `isModified: true` triggers the close guard logic
  - Import `createMockSession`, `createMockComment` from shared test-utils

- [X] T022 [US6] Verify reorganization completeness — run the following checks:
  1. `ls frontend/tests/unit/v*.test.ts` returns nothing (all v*-features files deleted)
  2. `ls frontend/tests/unit/` shows: `api.test.ts`, `comments.test.ts`, `diff-parser.test.ts`, `diff-viewer.test.ts`, `file-viewer.test.ts`, `regression.test.ts`, `session-grid.test.ts`, plus `components/` directory
  3. `npm test` from repo root — all tests pass (backend + frontend)
  4. `npm run test:coverage` — thresholds still met
  5. `npm run lint` — no lint errors

**Checkpoint**: Test files are module-named. No v*-features files remain. Shared test-utils used. Regression suite captures 3 known bug fixes. All tests pass, coverage maintained.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and merge.

- [X] T023 Run full validation suite from repo root: `npm test && npm run lint && npm run test:coverage && npm run test:system` — all tests pass, coverage thresholds met, no lint errors, system tests pass
- [X] T024 Run type checking: `npx tsc --noEmit` in both backend/ and frontend/ — no type errors
- [ ] T025 Push branch `005-testing-ci`, create PR to `main` via `gh pr create` with summary of all changes (coverage config, CI restructure, branch protection script, system tests, component tests, test reorganization)
- [ ] T026 Verify all 4 CI jobs pass on the PR (lint-typecheck, test-backend, test-frontend, test-system)
- [ ] T027 Run branch protection setup script: `scripts/setup-branch-protection.sh` — apply protection rules to `main` (must run BEFORE rebase-merge so protection is active after merge)
- [ ] T028 Rebase-merge PR to `main` after CI is green (Principle V) — use `gh pr merge --rebase`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (needs @vitest/coverage-v8 installed)
- **US3 (Phase 3)**: Validation only — covered by Phase 2
- **US2 (Phase 4)**: Depends on Phase 2 (needs coverage scripts for CI to call)
- **US1 (Phase 5)**: Depends on Phase 4 (needs CI job names for required checks)
- **US4 (Phase 6)**: Depends on Phase 4 (needs CI to run system tests), independent of US1
- **US5 (Phase 7)**: Independent — can start after Phase 1 (only needs @testing-library already installed)
- **US6 (Phase 8)**: Independent — can start after Phase 7 (needs test-utils from T017)
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

- **US3 (P1, Coverage)**: Foundation — no dependencies on other stories
- **US2 (P1, CI)**: Depends on US3 (needs `test:coverage` scripts)
- **US1 (P1, Branch Protection)**: Depends on US2 (needs CI job names)
- **US4 (P2, System Tests)**: Depends on US2 (CI must be able to run them) — but implementation is independent
- **US5 (P2, Component Tests)**: Independent of all other stories — only needs existing dependencies
- **US6 (P3, Reorganization)**: Depends on US5 (needs test-utils.ts from T017) — otherwise independent

### Within Each Phase

- T001, T002, T003, T004: All parallel (different workspaces, different files)
- T006, T007: Parallel (different vitest configs)
- T008: Sequential after T006+T007 (needs coverage output to measure)
- T013, T017: Parallel (different workspaces, no dependency)
- T014, T015: Sequential after T013 (need test-server helper)
- T018: Sequential after T017 (needs test-utils)
- T020: Sequential after T017 (needs test-utils for imports)

### Parallel Opportunities

- **T001 + T002 + T003 + T004**: All in parallel (install + scripts, 4 different files)
- **T006 + T007**: In parallel (two vitest configs)
- **T013 + T017**: In parallel after Phase 2 (backend system helper + frontend test utils)
- **T014 + T018**: Could overlap if T013 and T017 are done (different workspaces)
- **US4 (Phase 6) + US5 (Phase 7)**: Can proceed in parallel after Phase 4
- **T020 + T014/T015**: Could overlap (frontend reorg + backend system tests)

---

## Parallel Example: Setup Phase

```bash
# Launch all 4 setup tasks in parallel (different files):
Task: "Install @vitest/coverage-v8 in backend workspace"
Task: "Install @vitest/coverage-v8 in frontend workspace"
Task: "Add test:coverage script to backend/package.json"
Task: "Add test:coverage script to frontend/package.json"
```

## Parallel Example: US4 + US5

```bash
# After Phase 4 (CI), launch system tests and component tests in parallel:
Task: "Create test-server helper in backend/tests/system/test-server.ts"    # US4
Task: "Create mock factories in frontend/tests/test-utils.ts"               # US5
# Then:
Task: "Create server-lifecycle tests in backend/tests/system/"              # US4
Task: "Create SessionCard rendering tests in frontend/tests/unit/components/" # US5
```

---

## Implementation Strategy

### MVP First (US3 → US2 → US1)

1. Complete Phase 1: Setup (install dependencies)
2. Complete Phase 2: Foundational (coverage config + thresholds)
3. **STOP and VALIDATE**: `npm run test:coverage` passes with thresholds
4. Complete Phase 4: US2 (CI pipeline)
5. **STOP and VALIDATE**: Push PR, all 4 CI jobs pass
6. Complete Phase 5: US1 (branch protection)
7. **STOP and VALIDATE**: Direct push to `main` rejected, PR merge works

### Incremental Delivery

1. US3 + US2 + US1 → CI + branch protection in place → **Foundation secure**
2. Add US4 (system tests) → Real backend validation → **Backend confidence**
3. Add US5 (component tests) → Rendering validation → **Frontend confidence**
4. Add US6 (reorganization) → Clean test structure → **Maintainability**
5. Each increment adds value without breaking previous work

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US3 is implemented entirely in Phase 2 (Foundational) because coverage config is a prerequisite for CI
- Branch protection (US1) is applied AFTER CI is verified working (Phase 5, T027) to avoid locking out the setup PR
- System tests reuse existing `createTestDb()`, `createMockPtySpawner()`, and route factory patterns from integration tests
- Frontend component tests may need context providers (router, etc.) — wrap as needed during T018
- Test reorganization (US6) is the lowest priority and can be deferred to a follow-up PR if needed
- The `test-system` CI job is NOT a required check for branch protection (may have 0 tests initially)
- `coverage/` is already in `.gitignore` — no risk of committing coverage reports
