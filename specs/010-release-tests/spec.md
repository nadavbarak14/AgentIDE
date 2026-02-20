# Feature Specification: Release Validation Test Suite

**Feature Branch**: `010-release-tests`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "we need to have real life release tests, that includes real testing, also E2E, integration, backwards compatibility, we need to support upgrading, installing, all kind of options"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fresh Installation Verification (Priority: P1)

A release engineer runs the release validation suite to confirm that a new user can install AgentIDE from scratch and have a fully working system. The suite installs the package in a clean environment, starts the server, verifies the UI loads, creates a session, and confirms terminal interaction works end-to-end.

**Why this priority**: Installation is the very first experience a user has. If installation is broken, nothing else matters. This is the most critical gate for any release.

**Independent Test**: Can be fully tested by running the install validation suite in an isolated environment and verifying the `agentide` binary starts, serves the dashboard, and responds to API calls.

**Acceptance Scenarios**:

1. **Given** a clean environment with only Node.js 20 LTS installed, **When** the user runs `npm install -g agentide`, **Then** the CLI binary `agentide` is available on PATH and `agentide --help` displays usage information.
2. **Given** AgentIDE is installed globally, **When** the user runs `agentide start`, **Then** the server starts on the default port, the dashboard UI loads in a browser, and the health endpoint responds successfully.
3. **Given** the server is running, **When** a session is created via the UI or API pointing to a valid project directory, **Then** the session enters the active state and the terminal view streams output.
4. **Given** a clean environment, **When** the user installs via `npx agentide start` (without global install), **Then** the server starts correctly with the same behavior as a global install.

---

### User Story 2 - End-to-End Workflow Validation (Priority: P1)

A release engineer validates that the core user workflows function correctly in a production-like environment. This covers the complete journey from starting the server through creating sessions, interacting with terminals, viewing files and diffs, managing the session queue, and using settings — all through the actual UI and real network connections.

**Why this priority**: These are the daily workflows users rely on. Broken core workflows mean the product is unusable even if it installs correctly.

**Independent Test**: Can be tested by starting a real server instance and exercising each workflow through HTTP/WebSocket calls (or browser automation) against the running system.

**Acceptance Scenarios**:

1. **Given** a running AgentIDE server, **When** a user creates multiple sessions exceeding the concurrency limit, **Then** excess sessions are queued and automatically activated as slots become available.
2. **Given** a session with file changes, **When** a user opens the file viewer and diff viewer, **Then** the correct file contents and diffs are displayed accurately.
3. **Given** an active session, **When** a user interacts with the terminal (sends input), **Then** the terminal responds in real-time via WebSocket.
4. **Given** a running server, **When** the user modifies settings (e.g., max concurrent sessions), **Then** the settings persist across server restarts and take effect immediately.
5. **Given** a running server in remote mode with TLS enabled, **When** a user accesses the dashboard, **Then** the connection is encrypted and authentication is enforced.

---

### User Story 3 - Upgrade Path Validation (Priority: P2)

A release engineer verifies that existing users can upgrade from a previous version to the new version without data loss, configuration breakage, or downtime beyond the restart. The upgrade suite installs the previous version, seeds data (sessions, settings, comments, panel states), upgrades to the new version, and confirms everything still works.

**Why this priority**: Existing users upgrading is the most common path after the initial release. Data loss or broken upgrades erode trust and generate support burden.

**Independent Test**: Can be tested by installing version N-1, populating the database with representative data, upgrading to version N, and verifying all data is intact and all features function.

**Acceptance Scenarios**:

1. **Given** AgentIDE version N-1 is installed with existing sessions, settings, and comments in the database, **When** the user upgrades to version N via `npm install -g agentide@latest`, **Then** the server starts without errors and all previously stored data is accessible.
2. **Given** an upgrade from version N-1 to version N, **When** the database schema has changed, **Then** migrations run automatically on first server start and preserve all existing data.
3. **Given** a user has custom settings (port, host, TLS configuration) from version N-1, **When** upgrading to version N, **Then** the server respects all previous configuration without requiring reconfiguration.
4. **Given** a user upgrades from version N-1, **When** the license key format or validation logic has changed, **Then** existing valid license keys continue to work without reactivation.

---

### User Story 4 - Backwards Compatibility Validation (Priority: P2)

A release engineer confirms that the new version maintains compatibility with supported environments, Node.js versions, operating systems, and client behaviors. The suite runs the product against a matrix of supported configurations and verifies consistent behavior.

**Why this priority**: Users run AgentIDE on diverse systems. Compatibility regressions silently break users who don't report issues, leading to churn.

**Independent Test**: Can be tested by running the core validation suite against each entry in the compatibility matrix (Node.js versions, OS variants) and comparing results.

**Acceptance Scenarios**:

1. **Given** the new release, **When** installed and run on Node.js 20 LTS and Node.js 22 LTS, **Then** all core functionality works identically on both versions.
2. **Given** the new release, **When** installed on macOS, Linux (Ubuntu/Debian), and Windows (WSL), **Then** the server starts, sessions function, and terminal I/O works on all platforms.
3. **Given** a database file created by version N-1, **When** opened by version N, **Then** no data corruption occurs and all queries return correct results.
4. **Given** a client (browser) using the version N-1 frontend cached locally, **When** the backend is upgraded to version N, **Then** the API remains backwards-compatible for one minor version (graceful degradation, not hard errors).

---

### User Story 5 - Installation Options & Configuration Matrix (Priority: P3)

A release engineer validates that all documented installation methods and startup configuration options work correctly. This covers global install, npx, local install, various CLI flags (port, host, TLS, self-signed, no-auth), and environment variable overrides.

**Why this priority**: Users discover the product through different channels and have diverse deployment needs. Broken install paths mean lost users at the funnel top.

**Independent Test**: Can be tested by iterating over each installation method and CLI flag combination and verifying the server starts and behaves correctly.

**Acceptance Scenarios**:

1. **Given** a fresh environment, **When** AgentIDE is installed via `npm install -g`, `npx`, or local `npm install`, **Then** each method produces a working `agentide` binary that can start the server.
2. **Given** the server is started with `--port 8080 --host 0.0.0.0`, **When** a client connects on port 8080, **Then** the dashboard loads and functions correctly.
3. **Given** the server is started with `--tls --self-signed`, **When** a client connects via HTTPS, **Then** the connection is encrypted and the dashboard loads (with expected self-signed certificate warning).
4. **Given** the server is started with `--no-auth` in remote mode, **When** a client connects without authentication, **Then** the dashboard loads without requiring license activation.

---

### User Story 6 - Release Smoke Test & Regression Gate (Priority: P3)

A release engineer runs a fast smoke test suite (under 5 minutes) as a final release gate. This suite exercises the critical path — install, start, create session, verify terminal, stop — and fails the release if any step breaks. This serves as the automated go/no-go check before publishing.

**Why this priority**: A fast, reliable release gate prevents obvious regressions from reaching users. It complements the more thorough suites above with a rapid feedback loop.

**Independent Test**: Can be tested by running the smoke suite and checking the pass/fail result within the time budget.

**Acceptance Scenarios**:

1. **Given** a built release artifact, **When** the smoke test suite runs, **Then** it completes in under 5 minutes.
2. **Given** the smoke suite is integrated into the release pipeline, **When** any smoke test fails, **Then** the release is blocked and a clear error report identifies the failure.
3. **Given** a passing smoke suite, **When** the release proceeds, **Then** the release artifact matches exactly what was tested (same build, same hash).

---

### Edge Cases

- What happens when upgrading across multiple major versions (N-3 to N)?
- How does the system handle a corrupt or partially-written database during upgrade?
- What happens when Node.js is not installed or is below the minimum supported version?
- What happens when the install target directory has restricted permissions?
- How does the system behave when upgrading while the server is still running?
- What happens when a release test environment has no network access (offline install from tarball)?
- How does the system handle port conflicts during installation validation?
- What happens when the previous version's database uses a schema that requires destructive migration?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The release validation suite MUST be runnable as a single command that orchestrates all test tiers.
- **FR-002**: The suite MUST support running individual test tiers independently (install, E2E, upgrade, compatibility, smoke).
- **FR-003**: The suite MUST test fresh installation in an isolated environment that does not inherit the development workspace's dependencies or configuration.
- **FR-004**: The suite MUST validate end-to-end user workflows using real server instances, real network connections, and real file system operations (no mocks for external boundaries).
- **FR-005**: The suite MUST test upgrade paths from the most recent published version to the current build.
- **FR-006**: The suite MUST verify database migrations preserve all existing data during upgrades.
- **FR-007**: The suite MUST run against a compatibility matrix of at least Node.js 20 LTS and Node.js 22 LTS.
- **FR-008**: The suite MUST validate all CLI startup options (port, host, TLS, self-signed, no-auth) produce working server configurations.
- **FR-009**: The suite MUST include a fast smoke test tier that completes in under 5 minutes for use as a release gate.
- **FR-010**: The suite MUST produce a structured test report indicating pass/fail status per test tier, with failure details sufficient to diagnose issues without re-running.
- **FR-011**: The suite MUST clean up all resources (processes, temp directories, ports) after completion, even on test failure.
- **FR-012**: The suite MUST be runnable in CI environments (headless, no interactive prompts, no GUI dependencies).
- **FR-013**: The suite MUST verify that the installed package contains all required files and the binary resolves all imports correctly.
- **FR-014**: The suite MUST test that server graceful shutdown works (sessions cleaned up, database closed, port released).
- **FR-015**: The suite MUST validate backwards compatibility of the API for at least one prior minor version.
- **FR-016**: The suite MUST test WebSocket connectivity and real-time terminal streaming as part of E2E validation.

### Key Entities

- **Release Artifact**: The built npm package ready for publishing; tested as-is without modification.
- **Test Environment**: An isolated filesystem and process space where release tests execute; mimics a real user's machine.
- **Compatibility Matrix**: The set of supported Node.js versions, operating systems, and configuration combinations tested per release.
- **Test Report**: Structured output capturing per-tier pass/fail results, timing, and failure diagnostics in both machine-readable and human-readable formats.
- **Upgrade Fixture**: A snapshot of a previous version's database and configuration used to validate upgrade paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All release validation tests pass before any version is published, with zero manual intervention required.
- **SC-002**: The smoke test tier completes in under 5 minutes, enabling rapid release iteration.
- **SC-003**: The full release validation suite (all tiers) completes in under 30 minutes.
- **SC-004**: Upgrade tests verify data integrity for 100% of database tables and persisted settings.
- **SC-005**: The suite catches installation and upgrade regressions before they reach users, reducing post-release critical bugs by at least 80%.
- **SC-006**: The compatibility matrix covers at least 2 Node.js LTS versions and 2 operating system families.
- **SC-007**: Every release test tier can be run independently with a single command, requiring no manual setup steps.
- **SC-008**: Test failure reports clearly identify the root cause in 90% of cases without requiring manual investigation or re-running.

## Assumptions

- The release artifact is an npm package (tarball) that can be installed globally via `npm install -g`.
- The minimum supported Node.js version is 20 LTS; the test matrix covers 20 and 22 LTS.
- macOS, Linux (Ubuntu/Debian), and Windows (via WSL) are the supported platforms; native Windows support is not in scope.
- The previous version for upgrade testing is always the most recently published npm version (N-1); multi-version upgrade jumps (N-3 to N) are documented as edge cases but not tested automatically in the initial implementation.
- API/WebSocket-level testing is sufficient for core E2E validation; browser automation (e.g., Playwright) may be added later but is not required for the initial release.
- The release validation suite runs in CI but can also be run locally by developers.
- Offline/air-gapped installation testing is out of scope for the initial implementation.
- The suite uses temporary directories and ephemeral ports to avoid conflicts with the developer's environment.
