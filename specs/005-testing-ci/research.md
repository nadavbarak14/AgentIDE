# Research: Testing & CI Hardening

## Decision 1: Coverage Tool — @vitest/coverage-v8

**Decision**: Use `@vitest/coverage-v8` for coverage collection in both backend and frontend workspaces.
**Rationale**: Native Vitest plugin, zero additional config beyond `vitest.config.ts`. Uses V8's built-in code coverage (fast, no source transform overhead). Generates lcov (for CI artifact upload) and text (for terminal summary) reports. Already the standard choice for Vitest projects.
**Alternatives considered**: (1) `@vitest/coverage-istanbul` — slower, requires code instrumentation, better for edge cases with decorators/generators but not needed here. (2) `c8` standalone — works but requires separate tooling outside Vitest. (3) `nyc` — Jest/Mocha ecosystem, not designed for Vitest.

## Decision 2: Coverage Thresholds — Measure-Then-Set

**Decision**: Run coverage once to measure current levels, then set thresholds at `current - 2%` as a floor. Ratchet up as tests improve.
**Rationale**: Aspirational thresholds (e.g., 80%) that the codebase doesn't meet today will block all PRs immediately. Setting thresholds at the current level minus a small buffer prevents regression while allowing gradual improvement. The buffer accounts for minor fluctuations from refactoring.
**Alternatives considered**: (1) Fixed 80% threshold — would fail immediately, blocking all work. (2) No thresholds, just reporting — doesn't prevent regression. (3) Per-file thresholds — too granular to maintain, adds friction.

## Decision 3: Branch Protection Configuration

**Decision**: Configure via GitHub CLI (`gh api`): require status checks (CI), require linear history (rebase-merge), no force pushes, no deletions. Do not require approvals (solo dev).
**Rationale**: Branch protection is configured via GitHub's API, not in-repo config files. Using `gh api` in a setup script makes it reproducible. Linear history (rebase-merge) keeps `main` clean and bisectable. Approvals add friction for solo development without proportional benefit.
**Implementation**: A one-time setup script using `gh api repos/{owner}/{repo}/branches/main/protection`.
**Alternatives considered**: (1) GitHub UI manual setup — not reproducible, easy to misconfigure. (2) Terraform/Pulumi — over-engineering for a single repo. (3) Branch ruleset (newer GitHub feature) — more flexible but more complex to configure.

## Decision 4: CI Pipeline Structure — Parallel Jobs

**Decision**: Split CI into 3 parallel jobs: (1) `lint-typecheck` (lint + tsc), (2) `test-backend` (unit + integration + coverage), (3) `test-frontend` (unit + coverage + build). Add a separate `test-system` job that depends on backend passing.
**Rationale**: Parallel jobs reduce total CI time. Lint/typecheck is fast and independent. Backend and frontend tests are independent. System tests depend on backend correctness. Each job has its own failure status visible in the PR checks.
**Alternatives considered**: (1) Single sequential job (current) — slow, one failure blocks everything. (2) Matrix strategy — doesn't fit well, the workspaces have different setups. (3) Separate workflows per workspace — harder to manage required checks.

## Decision 5: System Test Architecture

**Decision**: System tests start a real Express server on a random port with an in-memory SQLite database, make HTTP requests via `supertest` or `fetch`, and verify responses and side effects. Use a mock PTY spawner (already exists) to avoid needing the real `claude` binary.
**Rationale**: System tests should exercise real HTTP routing, middleware, database queries, and WebSocket connections — the full stack minus the external CLI dependency. The mock PTY spawner already exists in integration tests and simulates process lifecycle. Random port + in-memory DB prevents test pollution.
**Alternatives considered**: (1) Real `claude` binary — not available in CI, flaky, slow. (2) Docker-based tests — heavy, slow startup, not needed for this app. (3) Playwright browser tests — too heavy for backend-focused system tests; could add later for UI.

## Decision 6: Frontend Test Reorganization Strategy

**Decision**: Reorganize incrementally — create module-named test files, move tests from v*-features files, then delete the empty v* files. Do this in a single PR to avoid partial states.
**Rationale**: Big-bang reorganization risks merge conflicts with in-flight work. But since tests are the only consumers of themselves (no imports between test files), the reorganization is safe to do atomically. Module-named files (diff-viewer.test.ts, session-card.test.ts) make it obvious where to add new tests.
**Alternatives considered**: (1) Keep v*-features naming — confusing, doesn't scale. (2) Gradual migration (new tests in new files, old files untouched) — leads to split test locations. (3) One test file per component — too granular for small components.

## Decision 7: CI Coverage Reporting

**Decision**: Generate lcov reports, upload as GitHub Actions artifacts. Print text summary to CI logs. Do not use external services (Codecov, Coveralls) — keep it self-contained.
**Rationale**: Lcov is the universal coverage format (compatible with IDE plugins, CI tools). GitHub Actions artifacts are free and accessible from the PR page. Text summary in logs gives quick feedback without clicking through artifacts. External services add cost and third-party dependency.
**Alternatives considered**: (1) Codecov — adds third-party dependency, requires token management. (2) GitHub Actions coverage comment bot — adds complexity, coverage visible in logs is sufficient. (3) Badge in README — cosmetic, doesn't prevent regression.

## Decision 8: Merge Strategy — Rebase-Merge

**Decision**: Configure the repository to allow only rebase-merge (disable merge commits and squash-merge) via branch protection settings.
**Rationale**: Rebase-merge creates linear history on `main`, making `git log`, `git bisect`, and `git blame` straightforward. Each commit from the feature branch appears individually on `main`, preserving granular history. Squash-merge loses individual commits; merge commits create non-linear history.
**Alternatives considered**: (1) Squash-merge — simpler history but loses individual commit detail, bad for multi-commit features. (2) Merge commits — clutters history, makes bisect harder. (3) Allow all strategies — inconsistent history.

## Decision 9: System Test Scope

**Decision**: System tests cover: (1) server startup and health check, (2) session CRUD lifecycle (create → queue → activate → complete), (3) settings CRUD, (4) WebSocket connection and event streaming, (5) comment workflow (create → list → send → ephemeral delete). Do NOT cover: file system operations (file watcher, artifact detection), remote workers, or real terminal interaction.
**Rationale**: Focus on the core state machine (sessions) and data flows (comments, settings) that are most likely to break across component boundaries. File system and remote workers involve external dependencies that are hard to test reliably in CI.
**Alternatives considered**: (1) Full E2E including file system — flaky in CI, slow. (2) Only session lifecycle — misses important cross-cutting concerns. (3) Including Playwright browser tests — too heavy for initial system test suite; can add later.
