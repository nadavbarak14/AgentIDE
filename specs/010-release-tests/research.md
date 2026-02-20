# Research: Release Validation Test Suite

**Branch**: `010-release-tests` | **Date**: 2026-02-20

## R1: Test Framework for Release Tests

**Decision**: Vitest with a dedicated `vitest.release.config.ts` configuration

**Rationale**: The project already uses Vitest for unit, integration, and system tests. Adding a new release test tier follows the established pattern (unit → integration → system → release). A separate config allows independent timeouts (120s+ for install/upgrade tests), separate glob patterns (`release-tests/**/*.test.ts`), and no coverage instrumentation (release tests validate behavior, not coverage).

**Alternatives considered**:
- **Jest**: Rejected — project is standardized on Vitest; no reason to introduce a second framework
- **Shell scripts**: Rejected — no structured reporting, hard to maintain, no test isolation
- **Playwright alone**: Rejected — overkill for initial API-level validation; can be added later for UI regression

## R2: Release Artifact Strategy

**Decision**: Use `npm pack` to create a tarball, install it in an isolated temp directory via `npm install -g <tarball>`, then test the installed binary

**Rationale**: This is the closest simulation to what a real user experiences. `npm pack` produces the exact artifact that `npm publish` would upload. Installing from the tarball validates the `"files"` field, `"bin"` mapping, and dependency resolution. Existing system tests use `tsx src/cli.ts` (TypeScript source), which doesn't catch build/packaging issues.

**Alternatives considered**:
- **Test from source via tsx**: Rejected — doesn't validate the built artifact; misses packaging bugs
- **Docker-based isolation**: Rejected — heavyweight, slow, requires Docker in CI; temp directories with isolated `HOME` and `PATH` achieve sufficient isolation
- **npm link**: Rejected — doesn't test the actual npm install experience; symlinks can mask missing files

## R3: Isolated Test Environment Strategy

**Decision**: Create temporary directories per test run with isolated `HOME`, `PATH`, and npm prefix; use ephemeral ports (port 0) for all server instances

**Rationale**: The existing `cli-e2e.test.ts` already demonstrates this pattern — spawning the CLI in a temp dir with custom environment. Release tests extend this to full install/upgrade scenarios. Ephemeral ports prevent conflicts between parallel test runs and the developer's own server instances.

**Implementation details**:
- Temp dir created via `fs.mkdtemp(path.join(os.tmpdir(), 'agentide-release-'))`
- Set `HOME` to temp dir (isolates `~/.agentide/license.key` and `c3.db`)
- Set `npm_config_prefix` to temp dir (isolates global npm installs)
- Prepend `<prefix>/bin` to `PATH` so the installed `agentide` binary is found
- Clean up temp dir in `afterAll` even on test failure (try/finally)

## R4: Upgrade Testing Strategy

**Decision**: Maintain versioned database fixture files (SQLite snapshots) representing known schema states; test upgrade by copying fixture to temp dir, running new version against it

**Rationale**: True N-1 → N testing would require publishing N-1 to npm first, which creates a chicken-and-egg problem. Instead, fixtures capture the database state at known schema versions. This is deterministic, fast, and doesn't depend on external npm registry state.

**Fixture approach**:
- Store fixture DBs in `release-tests/fixtures/` (e.g., `v0.1.0-schema.db`)
- Each fixture contains all tables with representative seed data (sessions, settings, comments, panel states, auth config)
- Test copies fixture to temp dir, starts new server against it, verifies all data survives
- Fixture generation script creates a fresh DB using the schema from a tagged version

**Alternatives considered**:
- **Install real N-1 from npm**: Rejected — requires prior publish; fragile in early pre-1.0 development
- **Git-based schema replay**: Rejected — overly complex; direct DB fixtures are simpler and more reliable
- **In-memory schema simulation**: Rejected — doesn't test real file I/O and WAL mode behavior

## R5: Compatibility Matrix Strategy

**Decision**: Node.js version matrix handled via CI matrix strategy; OS matrix handled via CI `runs-on` parameter; local tests run against current environment only

**Rationale**: Testing against multiple Node.js versions and OSes requires different runtime environments. CI matrix jobs are the standard approach — each matrix entry runs the full release suite. Locally, developers test against their current environment; CI provides the cross-matrix guarantee.

**Matrix**:
- Node.js: 20 LTS, 22 LTS
- OS: `ubuntu-latest`, `macos-latest` (Windows WSL deferred — requires self-hosted runner)

## R6: Test Report Format

**Decision**: Vitest's built-in JSON reporter (`--reporter=json`) plus a custom summary script

**Rationale**: Vitest's JSON output already captures per-test pass/fail, duration, and error details. A thin wrapper script parses this into a human-readable summary table (tier | passed | failed | duration) for CI output and release notes. No need for a custom reporter.

## R7: Smoke Test Tier Design

**Decision**: A subset of release tests tagged/filtered as `smoke` that exercises: pack → install → start → health check → create session → WebSocket connect → stop

**Rationale**: The smoke tier reuses the same test infrastructure as the full release suite but runs only the critical path. Vitest's `--testNamePattern` or a separate config file can select smoke tests. This avoids maintaining two test frameworks while providing the fast release gate.

## R8: Package Configuration for Publishing

**Decision**: Add `"files"` field to root `package.json`; add `prepublishOnly` script; keep `"private": true` for now (removed only at release time)

**Rationale**: The `"files"` field whitelist ensures only built artifacts ship (no source, no tests, no specs). The `prepublishOnly` script runs `npm run build` automatically. The release tests themselves validate that the packed tarball contains the expected files.

**Files to include**: `backend/dist/`, `frontend/dist/`, `package.json`, `README.md`, `LICENSE`
