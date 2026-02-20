# Implementation Plan: Release Validation Test Suite

**Branch**: `010-release-tests` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-release-tests/spec.md`

## Summary

Add a comprehensive release validation test suite that tests AgentIDE as a real user would experience it — packed as an npm tarball, installed in an isolated environment, and exercised through real server instances with real network I/O. The suite covers six tiers: smoke (critical path gate), install (fresh install methods), E2E (full workflow validation), upgrade (N-1 → N data migration), config (CLI options matrix), and compatibility (Node.js/OS matrix via CI). Tests live in a new top-level `release-tests/` directory with shared helpers for environment isolation, artifact packing, server lifecycle, and database fixture management. The suite integrates into CI as a matrix job running after all existing tests pass.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Vitest 2.1.0 (test runner), better-sqlite3 (fixture verification), ws (WebSocket testing)
**New Dependencies**: None — all existing project dependencies suffice
**Storage**: SQLite fixture files in `release-tests/fixtures/` (read-only test data, not production)
**Testing**: Vitest with dedicated `release-tests/vitest.config.ts` (120s timeout, fork pool, no coverage)
**Target Platform**: Linux (CI primary), macOS (CI secondary), developer machines (local)
**Project Type**: Test infrastructure addition to existing web application
**Performance Goals**: Smoke tier < 5 minutes, full suite < 30 minutes
**Constraints**: No Docker dependency, no interactive prompts, headless CI compatible, ephemeral ports only
**Scale/Scope**: ~20-30 test cases across 6 tiers, 6 helper modules, 1 fixture DB, 1 CI job addition

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | This feature IS comprehensive testing — real servers, real installs, real network I/O, no mocks at external boundaries |
| II. UX-First Design | PASS | Tests validate actual user workflows: install, start, create session, interact with terminal |
| III. UI Quality & Consistency | N/A | No UI changes; release tests validate existing UI loads correctly |
| IV. Simplicity | PASS | Flat directory structure, reusable helpers, no abstractions beyond what's needed; follows existing system test patterns |
| V. CI/CD Pipeline | PASS | Adds CI job; runs after existing jobs; matrix for Node.js/OS coverage; required status check |
| VI. Frontend Plugin Quality | N/A | No frontend dependencies added |
| VII. Backend Security | PASS | Tests validate TLS, auth, and license enforcement work correctly in installed product |
| VIII. Observability & Logging | N/A | Test infrastructure; production logging validated by E2E tests observing server output |

**Post-Phase 1 re-check**: All gates still PASS. No new dependencies, no architectural violations. The `release-tests/` directory adds a third top-level test location (alongside `backend/tests/` and `frontend/tests/`) which is justified because release tests span both workspaces and test the packaged artifact, not individual workspace code.

## Project Structure

### Documentation (this feature)

```text
specs/010-release-tests/
├── plan.md                    # This file
├── spec.md                    # Feature specification
├── research.md                # Phase 0: research decisions
├── data-model.md              # Phase 1: entity definitions
├── quickstart.md              # Phase 1: developer guide
├── contracts/
│   ├── test-commands.md       # npm scripts and Vitest config contract
│   ├── ci-workflow.md         # CI job definition contract
│   └── test-helpers.md        # Helper function contracts
├── checklists/
│   └── requirements.md        # Spec quality checklist
└── tasks.md                   # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
release-tests/                          # CREATE — new top-level directory
├── vitest.config.ts                    # CREATE — Vitest config (120s timeout, fork pool)
├── helpers/
│   ├── environment.ts                  # CREATE — createReleaseEnvironment()
│   ├── artifact.ts                     # CREATE — packAndInstall(), verifyPackageContents()
│   ├── server.ts                       # CREATE — startServer(), waitForHealth(), stopServer()
│   ├── upgrade.ts                      # CREATE — loadUpgradeFixture(), verifyDatabaseIntegrity()
│   └── report.ts                       # CREATE — generateReport(), summarizeResults()
├── fixtures/
│   ├── generate-fixture.ts             # CREATE — script to generate DB fixtures from current schema
│   └── v0.1.0.db                       # CREATE — initial upgrade fixture (generated)
├── smoke/
│   └── critical-path.test.ts           # CREATE — pack → install → start → health → session → stop
├── install/
│   ├── global-install.test.ts          # CREATE — npm install -g from tarball
│   ├── npx-install.test.ts             # CREATE — npx execution test
│   └── package-contents.test.ts        # CREATE — tarball file verification
├── e2e/
│   ├── session-lifecycle.test.ts       # CREATE — session CRUD + queue + activation
│   ├── terminal-streaming.test.ts      # CREATE — WebSocket terminal I/O
│   ├── file-operations.test.ts         # CREATE — file viewer + diff viewer APIs
│   └── settings-persistence.test.ts    # CREATE — settings CRUD + restart persistence
├── upgrade/
│   ├── data-migration.test.ts          # CREATE — schema migration + data integrity
│   └── config-preservation.test.ts     # CREATE — settings + license survive upgrade
└── config/
    ├── port-host.test.ts               # CREATE — --port and --host CLI options
    ├── tls-options.test.ts             # CREATE — --tls, --self-signed, --cert, --key
    └── auth-options.test.ts            # CREATE — --no-auth in remote mode

package.json                            # MODIFY — add test:release scripts, add "files" field
.github/workflows/ci.yml               # MODIFY — add test-release matrix job
```

**Structure Decision**: Release tests live in a new top-level `release-tests/` directory rather than inside `backend/tests/` because they test the entire packaged product (backend + frontend combined), span both workspaces, and operate on the npm tarball rather than source code. This mirrors how the existing project separates `backend/` and `frontend/` concerns — release tests are a third concern.

## Implementation Approach

### Phase 1: Test Infrastructure & Helpers (Foundation)

Build the reusable helpers that all test tiers depend on. These are the primitives for environment isolation, artifact management, and server lifecycle.

**1.1 Vitest Configuration** (`release-tests/vitest.config.ts`)
- 120s test timeout (install cycles are slow)
- Fork pool for process isolation
- Sequential execution (shared port space)
- No coverage (behavior validation, not code coverage)
- Glob: `**/*.test.ts` under `release-tests/`

**1.2 Environment Helper** (`release-tests/helpers/environment.ts`)
- `createReleaseEnvironment()` → temp dir with isolated HOME, npm prefix, PATH
- Sets `HOME`, `npm_config_prefix`, prepends `binDir` to PATH
- `cleanup()` removes temp tree; respects `RELEASE_KEEP_TEMP` for debugging
- Pattern borrowed from existing `cli-e2e.test.ts` temp dir approach

**1.3 Artifact Helper** (`release-tests/helpers/artifact.ts`)
- `packArtifact()` → runs `npm pack` in project root, returns tarball path
- `installArtifact(env, tarball)` → runs `npm install -g <tarball>` in isolated env
- `verifyPackageContents(tarball)` → extracts and checks required files exist
- Caches tarball path across tests in same run (pack once, install many)

**1.4 Server Helper** (`release-tests/helpers/server.ts`)
- `startServer(opts)` → spawns `node <binary> start [flags]` with env vars
- Readiness detection via stdout regex `started on https?://[\w.:]+:(\d+)` (same as cli-e2e.test.ts)
- `stopServer(server)` → SIGTERM, 5s grace, SIGKILL, wait for exit
- `waitForHealth(baseUrl)` → polls GET endpoint until 200/401, timeout 10s

**1.5 Upgrade Helper** (`release-tests/helpers/upgrade.ts`)
- `loadUpgradeFixture(env, version)` → copies fixture DB to env's data dir
- `verifyDatabaseIntegrity(dbPath, expected)` → counts rows per table, compares
- Uses better-sqlite3 read-only to avoid accidentally modifying fixtures

**1.6 Report Helper** (`release-tests/helpers/report.ts`)
- `generateReport(results)` → writes `release-tests/report.json`
- Consumes Vitest's JSON output, restructures into per-tier summary
- Human-readable console summary printed at end

**1.7 Package.json Updates** (root `package.json`)
- Add scripts: `test:release`, `test:release:smoke`, `test:release:install`, `test:release:e2e`, `test:release:upgrade`, `test:release:config`
- Add `"files"` field: `["backend/dist/", "frontend/dist/", "package.json", "README.md"]`
- Add `"prepublishOnly": "npm run build"` to ensure fresh build before pack

### Phase 2: Smoke Test Tier (US6 — Release Gate)

The smoke tier is the fast feedback loop. Implement it first because it validates the entire helper stack end-to-end and serves as the template for all other tiers.

**2.1 Critical Path Test** (`release-tests/smoke/critical-path.test.ts`)

```
describe('Release Smoke Test')
  beforeAll: pack artifact, create env, install, start server
  afterAll: stop server, cleanup env

  test: agentide binary exists and is executable
  test: server health endpoint responds 200
  test: GET /api/sessions returns empty array
  test: POST /api/sessions creates a session
  test: WebSocket connects and receives messages
  test: server shuts down cleanly (SIGTERM → exit 0)
```

Target: all 6 tests pass in under 5 minutes total.

### Phase 3: Install Tier (US1 — Fresh Installation)

**3.1 Global Install Test** (`release-tests/install/global-install.test.ts`)
- Install tarball via `npm install -g`
- Verify `agentide` binary on PATH
- Verify `agentide --help` exits 0 with usage text
- Verify `agentide --version` matches package.json version
- Start server, verify health, stop

**3.2 Npx Install Test** (`release-tests/install/npx-install.test.ts`)
- Run `npx <tarball> start --port 0` in isolated env
- Verify server starts and health responds
- Stop and verify clean exit

**3.3 Package Contents Test** (`release-tests/install/package-contents.test.ts`)
- Extract tarball, verify file tree:
  - `package/backend/dist/cli.js` exists and has shebang
  - `package/backend/dist/hub-entry.js` exists
  - `package/frontend/dist/index.html` exists
  - No `src/`, `tests/`, `specs/`, `.github/` directories
- Verify `package.json` in tarball has correct `bin`, `version`, `name`

### Phase 4: E2E Tier (US2 — Workflow Validation)

**4.1 Session Lifecycle Test** (`release-tests/e2e/session-lifecycle.test.ts`)
- Start server in installed env
- POST session → verify 201 + session in active/queued state
- POST multiple sessions → verify queue behavior (excess queued)
- GET sessions → verify list returns all
- DELETE session → verify removal
- Verify completed session cleanup

**4.2 Terminal Streaming Test** (`release-tests/e2e/terminal-streaming.test.ts`)
- Start server, create session
- Connect WebSocket to server
- Send input message, verify output received
- Verify binary data handling (terminal escape codes)
- Disconnect, verify clean close

**4.3 File Operations Test** (`release-tests/e2e/file-operations.test.ts`)
- Start server, create session pointing at a temp project dir with known files
- GET `/api/sessions/:id/files` → verify file tree
- GET `/api/sessions/:id/files/:path` → verify file content
- Create a git repo with a commit in the temp dir
- GET `/api/sessions/:id/diff` → verify diff output

**4.4 Settings Persistence Test** (`release-tests/e2e/settings-persistence.test.ts`)
- Start server
- GET `/api/settings` → note defaults
- PUT `/api/settings` with custom values (max_concurrent_sessions=5)
- GET `/api/settings` → verify persisted
- Stop server, restart
- GET `/api/settings` → verify values survived restart

### Phase 5: Upgrade Tier (US3 — Upgrade Path)

**5.1 Fixture Generator** (`release-tests/fixtures/generate-fixture.ts`)
- Script that creates a fresh in-memory DB using current schema
- Seeds all tables with representative data (counts from data-model.md)
- Writes to `release-tests/fixtures/v{version}.db`
- Run manually when schema changes

**5.2 Data Migration Test** (`release-tests/upgrade/data-migration.test.ts`)
- Copy v0.1.0 fixture to temp env
- Start new server against it
- Verify server starts without errors
- Verify all tables queryable via API:
  - GET /api/sessions → 3 sessions with correct states
  - GET /api/settings → custom values preserved
  - GET /api/sessions/:id/comments → comments preserved
- Verify row counts match fixture seed data

**5.3 Config Preservation Test** (`release-tests/upgrade/config-preservation.test.ts`)
- Copy fixture with known auth_config (JWT secret, license data)
- Start new server
- Verify JWT secret unchanged (authentication still works with old tokens)
- Verify license data accessible
- Verify panel states preserved

### Phase 6: Config Tier (US5 — CLI Options Matrix)

**6.1 Port & Host Test** (`release-tests/config/port-host.test.ts`)
- Start with `--port 0` → verify ephemeral port works
- Start with `--port 8765` → verify specific port
- Start with `--host 127.0.0.1` → verify localhost binding
- Start with `--host 0.0.0.0` → verify all-interfaces binding (connect from 127.0.0.1)

**6.2 TLS Options Test** (`release-tests/config/tls-options.test.ts`)
- Start with `--tls --self-signed` → verify HTTPS, verify cert is self-signed
- Verify HTTP redirect or rejection when TLS enabled
- Verify WebSocket upgrades to WSS

**6.3 Auth Options Test** (`release-tests/config/auth-options.test.ts`)
- Start with `--host 0.0.0.0` (remote mode) → verify auth required (401 on protected routes)
- Start with `--host 0.0.0.0 --no-auth` → verify auth bypassed (200 on protected routes)
- Start with `--host 127.0.0.1` (localhost) → verify no auth required regardless

### Phase 7: CI Integration (US4 + US6)

**7.1 CI Workflow Update** (`.github/workflows/ci.yml`)
- Add `test-release` job after all existing jobs
- Matrix: `node-version: [20, 22]` × `os: [ubuntu-latest, macos-latest]`
- Steps: checkout → setup-node → npm ci → build-essential (linux only) → npm run build → npm run test:release
- Upload report artifact
- Add to branch protection required checks

## Notes

- **No browser automation initially**: All E2E tests use HTTP/WebSocket calls, not Playwright. The frontend is validated by confirming the static files are served (GET / returns HTML). Playwright can be added as a separate tier later.
- **Tarball caching**: `npm pack` runs once per test suite invocation and the tarball path is shared across all tiers via a module-level variable. This avoids repacking for every test file.
- **Port allocation**: All servers use port 0 (OS-assigned) to avoid conflicts. The actual port is parsed from the startup log message.
- **Process cleanup**: Every test's `afterAll` block uses try/finally to ensure server processes are killed and temp dirs are cleaned, even on assertion failures. Process groups are killed with negative PID to handle the node → agentide process tree.
- **Fixture versioning**: The v0.1.0 fixture is generated once and committed. When schema changes ship, a new fixture is generated for the new version and the upgrade test matrix expands to test the latest fixture → current version path.
- **The `"private": true` field** in package.json stays for now. `npm pack` works regardless of this field — it only blocks `npm publish`. The release tests validate the pack/install experience without actually publishing.
- **macOS CI**: `build-essential` is not needed on macOS; better-sqlite3 and node-pty compile with Xcode command-line tools pre-installed on GitHub Actions macOS runners.
