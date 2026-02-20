# Tasks: Release Validation Test Suite

**Input**: Design documents from `/specs/010-release-tests/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable. For this feature, the deliverables ARE tests — each user story IS a test tier. No separate "tests for the tests" phase is needed; the test files themselves are the implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US6 (Smoke) is implemented before higher-priority stories because it validates the shared helper infrastructure that all other tiers depend on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the release-tests directory structure, Vitest configuration, and package.json scripts

- [x] T001 Create directory structure for release-tests: `release-tests/helpers/`, `release-tests/fixtures/`, `release-tests/smoke/`, `release-tests/install/`, `release-tests/e2e/`, `release-tests/upgrade/`, `release-tests/config/`
- [x] T002 Create Vitest configuration at `release-tests/vitest.config.ts` with 120s test/hook timeout, fork pool, sequential execution, no coverage, glob `**/*.test.ts` — per contracts/test-commands.md
- [x] T003 Update root `package.json`: add `"files"` field (`["backend/dist/", "frontend/dist/", "package.json", "README.md"]`), add `"prepublishOnly": "npm run build"` script, add six test:release scripts (`test:release`, `test:release:smoke`, `test:release:install`, `test:release:e2e`, `test:release:upgrade`, `test:release:config`) — per contracts/test-commands.md
- [x] T004 Verify `npm run build` produces `backend/dist/cli.js`, `backend/dist/hub-entry.js`, `frontend/dist/index.html` by running the build and checking output exists — this is a prerequisite for all release tests

**Checkpoint**: Directory structure exists, Vitest config works (`npx vitest --config release-tests/vitest.config.ts --passWithNoTests`), build produces expected artifacts

---

## Phase 2: Foundational Helpers (Blocking Prerequisites)

**Purpose**: Build the reusable helper modules that ALL test tiers depend on. No test files can be implemented until these are complete.

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement environment helper at `release-tests/helpers/environment.ts`: `createReleaseEnvironment()` returning `ReleaseEnvironment` interface with `tempDir`, `homeDir`, `npmPrefix`, `binDir`, `dataDir`, `env` object, and `cleanup()` method. Use `fs.mkdtemp(path.join(os.tmpdir(), 'agentide-release-'))`. Create subdirs `home/`, `npm-global/`, `npm-global/bin/`, `data/`. Set `HOME`, `npm_config_prefix`, prepend `binDir` to `PATH`. Respect `RELEASE_KEEP_TEMP` env var. — per contracts/test-helpers.md
- [x] T006 [P] Implement artifact helper at `release-tests/helpers/artifact.ts`: `packArtifact()` runs `npm pack` in project root (caches tarball path in module-level variable for reuse), `installArtifact(env, tarball)` runs `npm install -g <tarball>` with env's npm_config_prefix and verifies `agentide` binary at `env.binDir/agentide`, `verifyPackageContents(tarball)` extracts tarball and checks `backend/dist/cli.js` (shebang), `backend/dist/hub-entry.js`, `frontend/dist/index.html` exist and no `src/`, `tests/`, `specs/` dirs present. Returns `InstalledArtifact` with `tarballPath`, `binaryPath`, `version`. Supports `RELEASE_TARBALL` env var to skip pack step. — per contracts/test-helpers.md
- [x] T007 [P] Implement server helper at `release-tests/helpers/server.ts`: `startServer(opts: StartOptions)` spawns `node <binaryPath> start --port <port> [--host] [--tls] [--self-signed] [--no-auth]` with env.env, detects readiness via stdout/stderr regex `started on https?://[\w.:]+:(\d+)` (same pattern as existing `backend/tests/system/cli-e2e.test.ts`), resolves port from message, times out after 30s. `stopServer(server)` sends SIGTERM to process group (-pid), waits 5s, sends SIGKILL if alive, waits for exit event. `waitForHealth(baseUrl, timeoutMs=10000)` polls GET every 500ms until 200 or 401, rejects on timeout. — per contracts/test-helpers.md
- [x] T008 [P] Implement upgrade helper at `release-tests/helpers/upgrade.ts`: `loadUpgradeFixture(env, fixtureVersion)` copies `release-tests/fixtures/<version>.db` to `env.dataDir/c3.db`, returns path, throws if fixture missing. `verifyDatabaseIntegrity(dbPath, expectedCounts)` opens DB read-only via better-sqlite3, counts rows per table with `SELECT COUNT(*) FROM <table>`, returns `IntegrityResult[]` with per-table pass/fail. — per contracts/test-helpers.md
- [x] T009 [P] Implement report helper at `release-tests/helpers/report.ts`: `generateReport(vitestJsonPath, outputPath)` reads Vitest JSON reporter output, restructures into per-tier summary `{ tier, passed, failed, skipped, duration, failures[] }`, writes `release-tests/report.json` matching the schema in contracts/test-commands.md. `printSummary(report)` logs human-readable table to console.

**Checkpoint**: All helpers importable and type-check. Run `npx tsc --noEmit -p release-tests/tsconfig.json` (create a minimal tsconfig if needed) to verify no type errors. Helpers ready for test files to consume.

---

## Phase 3: User Story 6 — Smoke Test & Release Gate (Priority: P3, implemented first as helper validation)

**Goal**: Fast (<5 min) critical path test: pack → install → start → health → session → WebSocket → stop. Validates the entire helper stack end-to-end.

**Independent Test**: Run `npm run test:release:smoke` and verify all tests pass in under 5 minutes.

- [x] T010 [US6] Implement smoke test at `release-tests/smoke/critical-path.test.ts`: In `beforeAll`: call `packArtifact()`, `createReleaseEnvironment()`, `installArtifact(env, tarball)`, `startServer({env, binaryPath, port: 0})`. In `afterAll`: call `server.stop()`, `env.cleanup()` in try/finally. Test cases: (1) `agentide` binary exists and is executable (check `fs.accessSync` with X_OK), (2) server health endpoint responds 200 via `waitForHealth(baseUrl)`, (3) `GET /api/sessions` returns 200 with empty array, (4) `POST /api/sessions` with `{directory: env.dataDir, prompt: 'test'}` returns 201, (5) WebSocket connects to `ws://127.0.0.1:<port>` and receives a message (use `ws` package), (6) `server.stop()` exits cleanly (exit code 0 or SIGTERM). Target: all 6 tests in under 5 minutes total.
- [x] T011 [US6] Validate smoke tier timing: run `npm run test:release:smoke`, verify suite completes in under 5 minutes. If it exceeds 5 minutes, identify and optimize the slowest step (likely `npm install -g`). Document actual timing in a comment at top of `release-tests/smoke/critical-path.test.ts`.

**Checkpoint**: `npm run test:release:smoke` passes. All helpers validated end-to-end. This is the release gate — if smoke passes, the artifact is minimally viable.

---

## Phase 4: User Story 1 — Fresh Installation Verification (Priority: P1)

**Goal**: Validate that a new user can install AgentIDE from scratch via multiple methods (global npm, npx) and have a fully working system.

**Independent Test**: Run `npm run test:release:install` and verify all tests pass.

- [x] T012 [P] [US1] Implement global install test at `release-tests/install/global-install.test.ts`: In `beforeAll`: `packArtifact()`, `createReleaseEnvironment()`, `installArtifact(env, tarball)`. In `afterAll`: `env.cleanup()`. Tests: (1) `agentide` binary exists at `env.binDir/agentide`, (2) `agentide --help` spawned with env.env exits 0 and stdout contains "start" and "activate" commands, (3) `agentide --version` exits 0 and stdout matches version from `InstalledArtifact.version`, (4) start server with `startServer({env, binaryPath, port: 0})`, verify health responds 200, stop server cleanly.
- [x] T013 [P] [US1] Implement npx install test at `release-tests/install/npx-install.test.ts`: In `beforeAll`: `packArtifact()`, `createReleaseEnvironment()`. Tests: (1) spawn `npx <tarball> start --port 0` with env.env and `cwd: env.dataDir`, detect readiness via startup message regex, (2) verify health endpoint responds 200, (3) stop process and verify clean exit. Use 60s timeout for npx startup (it downloads + installs on first run).
- [x] T014 [P] [US1] Implement package contents test at `release-tests/install/package-contents.test.ts`: In `beforeAll`: `packArtifact()`. Tests: (1) extract tarball to temp dir via `tar xzf`, verify `package/backend/dist/cli.js` exists and first line contains `#!/usr/bin/env node`, (2) verify `package/backend/dist/hub-entry.js` exists, (3) verify `package/frontend/dist/index.html` exists, (4) verify NO `package/src/`, `package/tests/`, `package/specs/`, `package/.github/` directories in the tarball, (5) read `package/package.json` from extracted tarball, verify `bin.agentide` equals `./backend/dist/cli.js`, verify `name` and `version` fields present.

**Checkpoint**: `npm run test:release:install` passes. All three installation methods validated. Package contents verified.

---

## Phase 5: User Story 2 — End-to-End Workflow Validation (Priority: P1)

**Goal**: Validate core user workflows (sessions, queue, terminal, files, diffs, settings) through real server instances with real network I/O.

**Independent Test**: Run `npm run test:release:e2e` and verify all tests pass.

- [x] T015 [US2] Implement session lifecycle test at `release-tests/e2e/session-lifecycle.test.ts`: In `beforeAll`: pack, create env, install, start server. In `afterAll`: stop, cleanup. Tests: (1) `POST /api/sessions` with `{directory: env.dataDir, prompt: 'test1'}` returns 201 with session object containing `id` and `status`, (2) `GET /api/sessions` returns array including the created session, (3) create sessions exceeding default `max_concurrent_sessions` (2), verify excess sessions have `status: 'queued'`, (4) `DELETE /api/sessions/:id` returns 200, (5) `GET /api/sessions` no longer includes deleted session.
- [x] T016 [P] [US2] Implement terminal streaming test at `release-tests/e2e/terminal-streaming.test.ts`: In `beforeAll`: pack, create env, install, start server, create a session via POST. Tests: (1) connect WebSocket to `ws://127.0.0.1:<port>` using `ws` package, verify connection opens, (2) send a subscribe message for the session ID, verify acknowledgment or data received within 5s, (3) verify WebSocket `close` event fires cleanly on disconnect. Note: terminal output depends on whether `claude` CLI is available; test for WebSocket connectivity and message framing, not specific terminal content.
- [x] T017 [P] [US2] Implement file operations test at `release-tests/e2e/file-operations.test.ts`: In `beforeAll`: pack, create env, install, create a temp project dir within env with known files (`echo "hello" > test.txt`), init a git repo with one commit in the temp project dir, start server, create session pointing at temp project dir. Tests: (1) `GET /api/sessions/:id/files` returns file tree containing `test.txt`, (2) `GET /api/sessions/:id/files/test.txt` returns content containing "hello", (3) modify a file in the temp project dir and `git add` + `git commit`, then `GET /api/sessions/:id/diff` returns diff output.
- [x] T018 [P] [US2] Implement settings persistence test at `release-tests/e2e/settings-persistence.test.ts`: In `beforeAll`: pack, create env, install, start server. Tests: (1) `GET /api/settings` returns 200 with default values (`max_concurrent_sessions: 2`), (2) `POST /api/settings` with `{max_concurrent_sessions: 5}` returns 200, (3) `GET /api/settings` returns updated value (`max_concurrent_sessions: 5`), (4) stop server, start a NEW server instance in same env (same dataDir with same c3.db), (5) `GET /api/settings` on new server returns `max_concurrent_sessions: 5` (survived restart).

**Checkpoint**: `npm run test:release:e2e` passes. All core workflows validated through real HTTP and WebSocket connections.

---

## Phase 6: User Story 3 — Upgrade Path Validation (Priority: P2)

**Goal**: Verify that upgrading from version N-1 preserves all data, settings, and authentication configuration.

**Independent Test**: Run `npm run test:release:upgrade` and verify all tests pass.

- [x] T019 [US3] Create fixture generator script at `release-tests/fixtures/generate-fixture.ts`: Script that imports `initDb` and `closeDb` from `backend/src/models/db.ts` (via relative path), creates a real SQLite DB at a specified output path, seeds all 7 tables with representative data per data-model.md: settings (1 row with `max_concurrent_sessions=3, theme='light'`), sessions (3 rows: queued/active/completed statuses), workers (2 rows: 1 local, 1 remote), comments (2 rows on different sessions), panel_states (2 rows), auth_config (1 row with known JWT secret), artifacts (3 rows, 1 per session). Accept `--output <path>` CLI arg. Close DB cleanly after seeding.
- [x] T020 [US3] Generate v0.1.0 fixture database by running `npx tsx release-tests/fixtures/generate-fixture.ts --output release-tests/fixtures/v0.1.0.db`. Verify the generated file exists and contains expected row counts using `better-sqlite3` read-only check. Commit the `.db` fixture file to the repository.
- [x] T021 [US3] Implement data migration test at `release-tests/upgrade/data-migration.test.ts`: In `beforeAll`: pack, create env, install, `loadUpgradeFixture(env, 'v0.1.0')`, start server against env (server will auto-run migrations on the fixture DB). Tests: (1) server starts without errors (no crash on old schema), (2) `GET /api/sessions` returns 3 sessions with correct statuses (queued, active, completed), (3) `GET /api/settings` returns custom values from fixture (`max_concurrent_sessions: 3`), (4) `verifyDatabaseIntegrity(dbPath, {settings: 1, sessions: 3, workers: 2, comments: 2, panel_states: 2, auth_config: 1, artifacts: 3})` all pass, (5) verify new columns added by migrations exist (query `PRAGMA table_info(panel_states)` for `left_panel`, query `PRAGMA table_info(comments)` for `side`).
- [x] T022 [P] [US3] Implement config preservation test at `release-tests/upgrade/config-preservation.test.ts`: In `beforeAll`: pack, create env, install, `loadUpgradeFixture(env, 'v0.1.0')`, start server. Tests: (1) the known JWT secret from the fixture is preserved (query `auth_config` table directly via better-sqlite3 on the DB file in env.dataDir, compare to fixture value), (2) `GET /api/settings` returns the fixture's custom settings (not defaults), (3) panel_states rows from fixture are still queryable and intact.

**Checkpoint**: `npm run test:release:upgrade` passes. Database migrations verified. Data integrity confirmed for all 7 tables.

---

## Phase 7: User Story 5 — Installation Options & Configuration Matrix (Priority: P3)

**Goal**: Validate all CLI startup options (port, host, TLS, self-signed, no-auth) produce working server configurations.

**Independent Test**: Run `npm run test:release:config` and verify all tests pass.

- [x] T023 [US5] Implement port and host test at `release-tests/config/port-host.test.ts`: In `beforeAll`: pack, create env, install. Tests: (1) start server with `--port 0` (ephemeral), verify health responds on resolved port, stop, (2) start server with `--port 8765`, verify `fetch('http://127.0.0.1:8765/api/settings')` responds 200, stop, (3) start server with `--host 0.0.0.0 --port 0 --no-auth`, verify health responds when connecting to `127.0.0.1`, stop. Each test starts/stops its own server instance.
- [x] T024 [P] [US5] Implement TLS options test at `release-tests/config/tls-options.test.ts`: In `beforeAll`: pack, create env, install. Tests: (1) start server with `--tls --self-signed --port 0 --no-auth`, detect readiness from `"started on https://..."` message, verify `fetch('https://127.0.0.1:<port>/api/settings', {agent: new https.Agent({rejectUnauthorized: false})})` responds 200, stop, (2) start server with `--tls --self-signed --port 0 --no-auth`, connect WebSocket via `wss://` with `rejectUnauthorized: false`, verify connection opens, stop.
- [x] T025 [P] [US5] Implement auth options test at `release-tests/config/auth-options.test.ts`: In `beforeAll`: pack, create env, install. Tests: (1) start server with `--host 0.0.0.0 --port 0` (remote mode, auth enabled), verify `GET /api/sessions` returns 401, stop, (2) start server with `--host 0.0.0.0 --port 0 --no-auth` (remote mode, auth disabled), verify `GET /api/sessions` returns 200, stop, (3) start server with `--host 127.0.0.1 --port 0` (localhost mode), verify `GET /api/sessions` returns 200 (no auth required on localhost), stop.

**Checkpoint**: `npm run test:release:config` passes. All CLI flag combinations produce working configurations.

---

## Phase 8: User Story 4 — Backwards Compatibility / CI Integration (Priority: P2)

**Goal**: Integrate release tests into CI with a Node.js/OS compatibility matrix. The CI matrix itself IS the backwards compatibility validation — running the full release suite against Node.js 20 and 22 on Ubuntu and macOS.

**Independent Test**: Push branch, verify `test-release` CI job passes on all matrix entries.

- [x] T026 [US4] Update CI workflow at `.github/workflows/ci.yml`: Add `test-release` job with `needs: [lint-typecheck, test-backend, test-frontend, test-system]`, `runs-on: ${{ matrix.os }}`, `strategy.matrix: {node-version: [20, 22], os: [ubuntu-latest, macos-latest]}`. Steps: (1) `actions/checkout@v4`, (2) `actions/setup-node@v4` with `matrix.node-version`, (3) `npm ci`, (4) install `build-essential` on Ubuntu only (`if: runner.os == 'Linux'`), (5) `npm run build`, (6) `npm run test:release`, (7) upload `release-tests/report.json` as artifact named `release-test-report-${{ matrix.os }}-node${{ matrix.node-version }}` with 30-day retention. — per contracts/ci-workflow.md
- [x] T027 [P] [US4] Update branch protection script at `scripts/setup-branch-protection.sh`: Add `test-release` to the list of required status checks for merges to `main`.

**Checkpoint**: CI workflow is syntactically valid (`act` or push to verify). Matrix covers Node 20+22 on Ubuntu+macOS (4 combinations). Branch protection updated.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and merge preparation

- [x] T028 Run full release suite locally: `npm run build && npm run test:release` — verify all tiers pass (smoke, install, e2e, upgrade, config)
- [x] T029 Run existing test suites to verify no regressions: `npm test && npm run test:system` — ensure package.json changes (files field, scripts) don't break existing tests
- [x] T030 Run linting and type checking: `npm run lint && npm run typecheck` — ensure all new TypeScript files pass linting and type checking
- [x] T031 Verify each tier runs independently: run each `npm run test:release:<tier>` command separately, confirm each passes in isolation without requiring other tiers to run first
- [ ] T032 Push branch, wait for CI green (all jobs including new test-release matrix), rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational Helpers (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US6 Smoke (Phase 3)**: Depends on Phase 2 — validates helpers, SHOULD complete before other stories
- **US1 Install (Phase 4)**: Depends on Phase 2 (helpers). Can start after Phase 2, but recommended after Phase 3 (smoke validates helpers)
- **US2 E2E (Phase 5)**: Depends on Phase 2 (helpers). Independent of US1.
- **US3 Upgrade (Phase 6)**: Depends on Phase 2 (helpers). Needs fixture generator (T019) before tests.
- **US5 Config (Phase 7)**: Depends on Phase 2 (helpers). Independent of US1-US3.
- **US4 CI (Phase 8)**: Depends on all test tiers existing (Phases 3-7). Can be implemented in parallel with later test tiers but should be validated last.
- **Polish (Phase 9)**: Depends on all phases complete.

### User Story Dependencies

- **US6 (Smoke)**: First functional test — validates helper stack. No story dependencies.
- **US1 (Install)**: Independent. Uses helpers only.
- **US2 (E2E)**: Independent. Uses helpers only.
- **US3 (Upgrade)**: Independent. Needs fixture generator (T019) + generated fixture (T020) before test files.
- **US5 (Config)**: Independent. Uses helpers only.
- **US4 (CI)**: Depends on all test files existing to be meaningful in CI.

### Parallel Opportunities

**Within Phase 2 (Foundational)**:
- T006, T007, T008, T009 can all run in parallel (separate files, no dependencies)
- T005 should be first (other helpers may import types from environment.ts)

**Across User Stories (after Phase 3)**:
- US1 (T012-T014), US2 (T015-T018), US3 (T019-T022), US5 (T023-T025) can all be implemented in parallel
- Each story uses only the shared helpers and its own test files

**Within User Stories**:
- US1: T012, T013, T014 all parallel (separate test files)
- US2: T016, T017, T018 parallel; T015 can also be parallel but is the simplest starting point
- US3: T019 → T020 → T021+T022 (sequential for fixture generation, then parallel for tests)
- US5: T023, T024, T025 all parallel (separate test files)

---

## Parallel Example: Phase 2 (Foundational Helpers)

```bash
# These can all be implemented in parallel (separate files):
Task: "Implement artifact helper at release-tests/helpers/artifact.ts"
Task: "Implement server helper at release-tests/helpers/server.ts"
Task: "Implement upgrade helper at release-tests/helpers/upgrade.ts"
Task: "Implement report helper at release-tests/helpers/report.ts"
```

## Parallel Example: User Stories 1 + 2 + 5 (after Smoke passes)

```bash
# All independent — can run on separate threads:
Task: "Implement global install test at release-tests/install/global-install.test.ts" [US1]
Task: "Implement session lifecycle test at release-tests/e2e/session-lifecycle.test.ts" [US2]
Task: "Implement port and host test at release-tests/config/port-host.test.ts" [US5]
```

---

## Implementation Strategy

### MVP First (Smoke Test Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational Helpers (CRITICAL — blocks all stories)
3. Complete Phase 3: US6 Smoke Test
4. **STOP and VALIDATE**: Run `npm run test:release:smoke` — if it passes in under 5 minutes, the release gate is operational
5. This alone provides value: a fast, automated release go/no-go check

### Incremental Delivery

1. Setup + Helpers → Foundation ready
2. US6 Smoke → Helper stack validated, release gate operational (MVP!)
3. US1 Install → Fresh install paths verified
4. US2 E2E → Core workflows verified
5. US3 Upgrade → Data migration verified
6. US5 Config → CLI options matrix verified
7. US4 CI → Full compatibility matrix automated
8. Each tier adds confidence without breaking previous tiers

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Helpers together (Phases 1-2)
2. One developer implements Smoke (Phase 3) to validate helpers
3. Once Smoke passes:
   - Developer A: US1 Install (Phase 4)
   - Developer B: US2 E2E (Phase 5)
   - Developer C: US3 Upgrade (Phase 6) + US5 Config (Phase 7)
4. Final developer: US4 CI (Phase 8) once test files exist
5. Team validates together in Phase 9

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US6 is implemented first despite being P3 because it validates the shared helper infrastructure
- US4 (Backwards Compatibility) is primarily the CI matrix job — the tests themselves are the same tests from other stories, just run on different Node.js/OS combinations
- Every test file follows the pattern: `beforeAll` (pack, env, install, start) → tests → `afterAll` (stop, cleanup) with try/finally
- The `npm pack` step runs once and caches the tarball path — multiple test files share the same tarball
- All servers use port 0 (OS-assigned) to avoid conflicts
- Commit after each completed task or logical group (e.g., all helpers, all tests in a tier)
