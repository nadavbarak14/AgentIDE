# Research: E2E Release Tests

**Branch**: `019-e2e-release-tests` | **Date**: 2026-02-23

## R1: Browser Automation Tool Selection

**Decision**: Playwright

**Rationale**:
- Industry-standard browser automation for Node.js/TypeScript projects
- Native async/await API matches the existing test codebase style
- Built-in headless mode, screenshot on failure, trace recording
- First-class TypeScript support
- The frontend already has a `"test:system": "playwright test"` script in package.json (but Playwright is not yet installed as a dependency)
- Vitest integration available via `@playwright/test` or standalone — we'll use Playwright's native test runner for browser tests since it has better browser lifecycle management than Vitest

**Alternatives considered**:
- **Cypress**: Heavier, uses its own test runner, less flexible for headless CI, poor multi-tab support
- **Puppeteer**: Lower-level, no built-in test runner, less ergonomic assertions
- **Vitest + jsdom**: Already used for unit tests, but jsdom doesn't render real CSS/layout — cannot test visual layout, zoom transitions, or panel sizing

## R2: Test Architecture — Extending Release Test Helpers

**Decision**: Create a new `release-tests/browser/` directory using Playwright's native test runner, reusing the existing artifact/environment/server helpers via a shared Playwright fixture.

**Rationale**:
- Existing release tests use Vitest with `pool: 'forks'` (process isolation) — Playwright has its own parallelism model that conflicts with Vitest forks
- Playwright's native `@playwright/test` runner provides better browser lifecycle management (launch once, share across tests), automatic screenshot/trace on failure, and HTML reporter
- The existing helpers (`packArtifact`, `createReleaseEnvironment`, `installArtifact`, `startServer`, `waitForHealth`) can be imported directly into Playwright fixtures
- A shared Playwright fixture handles the server lifecycle (start before all tests, stop after) so browser tests don't each pay the 10-30s startup cost

**Alternatives considered**:
- **Vitest + Playwright**: Possible via `vitest-playwright` but adds complexity; Vitest's fork pool doesn't align well with Playwright's browser pool
- **Standalone scripts**: Too fragile, no assertion library, no parallelism

## R3: Existing Selector Strategy

**Decision**: Use a combination of existing `data-testid` attributes, `title` attributes, text content selectors, and add new `data-testid` attributes to key interactive elements.

**Rationale**:
- Only 2 `data-testid` attributes exist: `zoom-button` and `close-button` (both in SessionCard.tsx)
- Many buttons use `title` attributes (80+ unique titles) — Playwright's `page.getByTitle()` is reliable for these
- Text-based selectors (`page.getByText()`, `page.getByRole('button', { name: '...' })`) work for buttons with visible labels
- New `data-testid` attributes needed for elements without unique titles/text:
  - Session grid container
  - Individual session cards (already have `data-session-id` attribute)
  - Files panel container
  - Git panel container
  - File tree items
  - Diff viewer container
  - Comment input areas
  - New Session form elements
  - Overflow/more sessions bar

## R4: Test Data Setup — Git Diff Fixtures

**Decision**: Create test fixture directories with pre-staged git changes for diff testing. Use the existing `createReleaseEnvironment` to set up isolated directories, then initialize a git repo with known changes.

**Rationale**:
- Diff viewer tests need a session with a real working directory containing uncommitted git changes
- The test setup will: (1) create a temp directory, (2) `git init`, (3) create initial files and commit, (4) modify files to create a diff
- This is deterministic and doesn't depend on any external state
- The session API accepts `workingDirectory` so the test can point a session at this fixture

**Alternatives considered**:
- **Pre-built fixture repos**: Fragile, tied to specific git versions
- **Mock API responses**: Violates constitution principle I (real behavior, not mocks)

## R5: Server Sharing Across Browser Tests

**Decision**: Use a Playwright global setup/teardown that starts one server instance and shares it across all browser test files.

**Rationale**:
- Server startup takes 10-30 seconds (pack + install + start + health check)
- Running this per test file would push the suite well beyond the 5-minute budget
- Playwright's `globalSetup` runs once before all tests, `globalTeardown` runs once after
- The server URL is passed to tests via environment variable or Playwright's `use.baseURL`
- Tests achieve isolation through API cleanup (delete all sessions) in `beforeEach`, not separate server instances

**Alternatives considered**:
- **Per-file server**: Too slow (6 test files × 30s = 3 min just for startup)
- **Per-test server**: Impossibly slow
- **Shared server via Vitest**: Vitest's fork pool makes sharing state across files difficult

## R6: CI Integration

**Decision**: Add a new npm script `test:release:browser` that runs Playwright tests. This runs separately from the Vitest-based release tests. Both can be invoked from a parent `test:release:all` script.

**Rationale**:
- Playwright has its own test runner (`npx playwright test`) with different configuration
- Keeping it as a separate script allows running browser tests independently
- CI can run Vitest release tests and Playwright browser tests in parallel if needed
- The existing `test:release` continues to work unchanged

**Alternatives considered**:
- **Merge into Vitest config**: Incompatible runner architectures
- **Replace existing e2e**: Would lose the fast API-level tests which are still valuable
