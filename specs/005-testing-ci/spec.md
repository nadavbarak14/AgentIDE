# Feature Specification: Testing & CI Hardening

**Feature Branch**: `005-testing-ci`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description: "we need real testing here. main should be protected branch, merge only from PR, after rebase and CI, we need to make sure we have good unit and system tests, coverage and regression"

## Current State Assessment

- **191 test cases** across backend (124) and frontend (67), but **no coverage reporting**
- CI pipeline runs lint + typecheck + backend tests + frontend build — **frontend tests are not run in CI**
- **No branch protection** on `main` — direct pushes allowed
- **System test directories exist but are empty** — no end-to-end tests
- **No coverage thresholds** — regressions in coverage go undetected
- Frontend tests focus on logic/state — **no React component rendering tests**
- Test files named by version (v5-features, v6-features…) — organically grown, not structured by module

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Protected Main Branch with PR-Only Merges (Priority: P1)

The `main` branch is protected: no direct pushes, all changes come through pull requests. PRs require CI to pass (lint, typecheck, all tests, coverage thresholds) before merge. Merge strategy is rebase-merge (linear history). At least one approval is recommended but not enforced for solo development.

**Why this priority**: Without branch protection, anyone (or any automation) can push broken code directly to `main`. This is the foundation — all other testing improvements are meaningless if they can be bypassed.

**Independent Test**: Try to push directly to `main` — GitHub rejects it. Create a PR, CI runs. If CI fails, the merge button is disabled. Fix the issue, CI passes, rebase-merge succeeds. `main` history is linear.

**Acceptance Scenarios**:

1. **Given** a developer tries to push directly to `main`, **When** the push is attempted, **Then** GitHub rejects it with a branch protection error
2. **Given** a PR is opened against `main`, **When** CI has not yet completed, **Then** the merge button is disabled
3. **Given** a PR is opened and CI fails, **When** the developer views the PR, **Then** the merge button remains disabled with a "checks failing" indicator
4. **Given** a PR is opened and CI passes, **When** the developer views the PR, **Then** the merge button is enabled for rebase-merge
5. **Given** a PR is merged, **When** viewing `main` history, **Then** commits are linear (no merge commits from PRs)

---

### User Story 2 — CI Pipeline Runs All Tests with Coverage (Priority: P1)

The GitHub Actions CI pipeline runs the complete test suite: backend unit tests, backend integration tests, frontend unit tests, and coverage collection. Coverage reports are generated and uploaded as artifacts. If coverage drops below the threshold, CI fails.

**Why this priority**: The current CI skips frontend tests entirely and collects no coverage data. Without running all tests in CI, regressions slip through. Without coverage tracking, test quality degrades silently over time.

**Independent Test**: Push a branch with a failing frontend test — CI fails. Push a branch that removes tests (dropping coverage below threshold) — CI fails. Push a branch where all tests pass and coverage is above threshold — CI succeeds and coverage report is available as an artifact.

**Acceptance Scenarios**:

1. **Given** a PR is opened, **When** CI runs, **Then** backend unit tests, backend integration tests, and frontend unit tests all execute
2. **Given** all tests pass, **When** CI completes, **Then** a coverage report (lcov + text summary) is generated and uploaded as a GitHub Actions artifact
3. **Given** a PR removes test coverage below the threshold, **When** CI runs coverage check, **Then** CI fails with a clear message showing which thresholds were violated
4. **Given** CI passes, **When** the developer checks the workflow summary, **Then** a coverage summary (lines, branches, functions, statements) is visible in the CI output
5. **Given** a frontend test fails, **When** CI runs, **Then** the pipeline fails (not just backend tests)

---

### User Story 3 — Coverage Thresholds Prevent Regression (Priority: P1)

Vitest coverage is configured in both backend and frontend workspaces with `@vitest/coverage-v8`. Coverage thresholds are set at realistic levels based on current coverage, then ratcheted up as tests improve. Source files are explicitly included/excluded to avoid inflated numbers from generated code.

**Why this priority**: Coverage thresholds are the automated guard against test regression. Without them, every PR could reduce coverage without anyone noticing.

**Independent Test**: Run `npm run test:coverage` locally. Coverage report appears in `coverage/` directory with per-file breakdown. Remove a test file — coverage drops below threshold — vitest exits with non-zero code. Restore the test — passes again.

**Acceptance Scenarios**:

1. **Given** vitest coverage is configured, **When** `npm run test:coverage` runs in backend/, **Then** an lcov + text report is generated in `backend/coverage/`
2. **Given** vitest coverage is configured, **When** `npm run test:coverage` runs in frontend/, **Then** an lcov + text report is generated in `frontend/coverage/`
3. **Given** coverage thresholds are set, **When** a PR drops line coverage below the threshold, **Then** vitest exits non-zero and reports which files/metrics failed
4. **Given** the project source, **When** coverage runs, **Then** only meaningful source files are included (not test files, not config files, not generated code)
5. **Given** current coverage levels, **When** thresholds are first set, **Then** they are set at or slightly below current levels (realistic floor, not aspirational)

---

### User Story 4 — System Tests Validate End-to-End Workflows (Priority: P2)

System tests exercise real backend workflows: starting the server, making HTTP requests, verifying WebSocket messages, and testing the full session lifecycle (create → queue → activate → complete). These run in CI as a separate job with longer timeouts.

**Why this priority**: Unit and integration tests mock boundaries. System tests catch integration bugs that only appear when real components interact — database migrations, WebSocket handshakes, session state machines, file watchers.

**Independent Test**: Run `npm run test:system` from root. The test suite starts a real server on a random port, creates sessions via the API, verifies WebSocket events fire, and confirms the session lifecycle works end-to-end. All system tests pass in CI.

**Acceptance Scenarios**:

1. **Given** the system test suite, **When** `npm run test:system` runs, **Then** a real Express server starts on a random port with a fresh test database
2. **Given** a running test server, **When** a session is created via POST /api/sessions, **Then** the session appears in GET /api/sessions with status "queued" or "active"
3. **Given** an active session, **When** the session completes, **Then** GET /api/sessions/:id returns status "completed" and the session is removed from the active queue
4. **Given** the server is running, **When** a WebSocket client connects, **Then** it receives real-time session update messages
5. **Given** system tests exist, **When** CI runs, **Then** system tests execute as a separate CI job (can run in parallel with unit tests)
6. **Given** a system test needs more time, **When** it runs, **Then** it has a 60-second timeout (not the default 30s)

---

### User Story 5 — Frontend Tests Cover Component Rendering (Priority: P2)

Frontend tests are expanded to include React component rendering tests using React Testing Library. Key components (SessionCard, DiffViewer header, FileViewer tab bar) are tested for correct rendering given various props. This catches visual regressions that logic-only tests miss.

**Why this priority**: Current frontend tests only test utility functions and state logic. Components can break (wrong props, missing conditionals, broken JSX) without any test catching it. Rendering tests are the cheapest way to catch these.

**Independent Test**: Run frontend tests. Component rendering tests verify: SessionCard renders title and status badge, DiffViewer file list renders file names, FileViewer tab bar shows tabs with modified indicators. A broken component (e.g., missing prop) fails the test.

**Acceptance Scenarios**:

1. **Given** a SessionCard component, **When** rendered with a session object, **Then** the test verifies the title, status badge, and working directory are displayed
2. **Given** a FileViewer tab bar, **When** rendered with tabs including a modified file, **Then** the test verifies the modified indicator (yellow dot) is present
3. **Given** frontend rendering tests, **When** CI runs frontend tests, **Then** component rendering tests execute alongside existing logic tests
4. **Given** a component change that breaks rendering, **When** tests run, **Then** the rendering test fails with a clear assertion message

---

### User Story 6 — Test Organization and Regression Suite (Priority: P3)

Tests are reorganized from version-named files (v5-features, v6-features…) into module-named files that match the source they test. A regression test file captures bugs that were found and fixed, ensuring they don't recur. Test helpers are extracted into shared utilities.

**Why this priority**: Version-named test files become confusing as the project grows — "which v is the comment test in?" Module-named files are self-documenting. A regression file prevents known bugs from recurring.

**Independent Test**: Look at the test directory structure — files are named after the modules they test (diff-viewer.test.ts, file-viewer.test.ts, session-card.test.ts). A regression.test.ts file exists with labeled test cases referencing the original bug.

**Acceptance Scenarios**:

1. **Given** the test directory, **When** a developer looks for tests for DiffViewer, **Then** they find `diff-viewer.test.ts` (not scattered across v5, v6, v7, v9 files)
2. **Given** a bug is found and fixed, **When** a regression test is added, **Then** it is labeled with a description of the original bug and the fix
3. **Given** test helpers are shared, **When** a new test needs a mock session or comment, **Then** it imports from a shared `test-utils.ts` file
4. **Given** old v*-features test files, **When** reorganization is complete, **Then** old files are removed and tests are distributed to module-named files

---

### Edge Cases

- What happens if coverage thresholds are too aggressive and block legitimate PRs? Start with thresholds slightly below current coverage levels, then ratchet up incrementally.
- What happens if system tests are flaky due to port conflicts? Use random port allocation (port 0) and retry logic.
- What happens if branch protection blocks the initial setup PR? Temporarily disable protection, merge the PR that sets up protection, then re-enable. Or use admin bypass for the first merge.
- What happens if the CI coverage step is slow? Run coverage only on PR (not on push to main), or run backend and frontend coverage in parallel CI jobs.
- What happens when a test file is reorganized but old imports reference it? Update all imports atomically in the reorganization PR. Use `tsc --noEmit` to catch broken imports.

## Clarifications

### Session 2026-02-18

- Q: What merge strategy for PRs? → A: Rebase-merge for linear history on `main`.
- Q: What coverage tool? → A: `@vitest/coverage-v8` (native Vitest integration, V8-based — fast, no extra config).
- Q: What coverage thresholds to start with? → A: Measure current coverage first, then set thresholds at current level minus 2% as a floor. Ratchet up over time.
- Q: Should system tests run in the same CI job or separate? → A: Separate job — they have longer timeouts and can run in parallel with unit tests.
- Q: Should we require PR approvals? → A: Not enforced (solo development), but recommended. Branch protection focuses on CI passing.
