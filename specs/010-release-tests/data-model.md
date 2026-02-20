# Data Model: Release Validation Test Suite

**Branch**: `010-release-tests` | **Date**: 2026-02-20

## No Database Schema Changes

This feature adds test infrastructure only. No production database tables are created or modified.

## Entity: Test Environment

An ephemeral, isolated environment created per test run that simulates a real user's machine.

| Field | Type | Description |
|-------|------|-------------|
| tempDir | string | Root temp directory for the test run |
| homeDir | string | Isolated HOME directory (`tempDir/home`) |
| npmPrefix | string | Isolated npm global prefix (`tempDir/npm-global`) |
| binDir | string | Path to installed binaries (`npmPrefix/bin`) |
| dataDir | string | Working directory where `c3.db` lives |
| port | number | Ephemeral port assigned by OS (0 → resolved) |
| serverProcess | ChildProcess | The running `agentide` process |
| baseUrl | string | Resolved `http://127.0.0.1:<port>` |

**Lifecycle**:
```
create tempDir → install artifact → start server → run tests → stop server → cleanup tempDir
```

## Entity: Release Artifact

The npm tarball produced by `npm pack` representing the publishable package.

| Field | Type | Description |
|-------|------|-------------|
| tarballPath | string | Absolute path to `.tgz` file from `npm pack` |
| version | string | Version from package.json |
| expectedFiles | string[] | Files that must exist in the tarball |

**Validation checks**:
- `backend/dist/cli.js` exists and is executable
- `backend/dist/hub-entry.js` exists
- `frontend/dist/index.html` exists
- No `src/`, `tests/`, `specs/`, `node_modules/` directories present

## Entity: Upgrade Fixture

A pre-populated SQLite database representing a specific prior schema version.

| Field | Type | Description |
|-------|------|-------------|
| fixtureFile | string | Path in `release-tests/fixtures/` (e.g., `v0.1.0.db`) |
| schemaVersion | string | The version this fixture represents |
| seedData | object | Known data seeded into each table |

**Seed data per table**:

| Table | Seed Records | Purpose |
|-------|-------------|---------|
| settings | 1 row (id=1, custom values) | Verify settings survive upgrade |
| sessions | 3 rows (queued, active, completed) | Verify all states survive |
| workers | 1 local + 1 remote worker | Verify worker config survives |
| comments | 2 comments on different sessions | Verify comments survive |
| panel_states | 2 panel configs | Verify panel layout survives |
| auth_config | 1 row with JWT secret | Verify auth config survives |
| artifacts | 1 artifact per session | Verify artifacts survive |

## Entity: Test Report

Structured output from a release test run.

| Field | Type | Description |
|-------|------|-------------|
| tier | string | `smoke`, `install`, `e2e`, `upgrade`, `compatibility`, `config` |
| passed | number | Count of passing tests |
| failed | number | Count of failing tests |
| skipped | number | Count of skipped tests |
| duration | number | Total time in milliseconds |
| failures | FailureDetail[] | Array of failure objects |

**FailureDetail**:

| Field | Type | Description |
|-------|------|-------------|
| testName | string | Full test name including describe blocks |
| error | string | Error message |
| stack | string | Stack trace |
| duration | number | Time this test took before failing |

## Entity: Compatibility Matrix Entry

A single configuration in the test matrix.

| Field | Type | Description |
|-------|------|-------------|
| nodeVersion | string | e.g., `20`, `22` |
| os | string | e.g., `ubuntu-latest`, `macos-latest` |
| installMethod | string | `global`, `npx`, `local` |
