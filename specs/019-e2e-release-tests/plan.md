# Implementation Plan: E2E Release Tests

**Branch**: `019-e2e-release-tests` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-e2e-release-tests/spec.md`

## Summary

Add browser-level end-to-end tests to the release test suite using Playwright, validating the acceptance scenarios from feature specs 001 (session grid), 002 (IDE panels), 004 (UX polish), and 016 (zoom controls). Tests run against a real packed/installed server with a real browser in headless mode, reusing the existing release test helper infrastructure. A shared server instance across all test files keeps total runtime under 5 minutes.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: `@playwright/test` (new dev dependency), existing release test helpers
**Storage**: N/A — tests use ephemeral temp directories with SQLite (via the real server)
**Testing**: Playwright Test Runner (browser E2E), Vitest (existing unit/integration/release)
**Target Platform**: Linux (CI), macOS/Linux (local development)
**Project Type**: Web application — tests exercise the full-stack (Express backend + React frontend)
**Performance Goals**: Full browser E2E suite completes in under 5 minutes headless
**Constraints**: Single Chromium browser, headless by default, screenshot/trace on failure
**Scale/Scope**: 6 test files covering ~20 acceptance scenarios from 4 feature specs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | This feature IS the testing improvement — adds browser-level E2E coverage for existing features |
| II. UX-First Design | N/A | No user-facing changes (test infrastructure only) |
| III. UI Quality & Consistency | PASS | Adding `data-testid` attributes to components doesn't change visual behavior |
| IV. Simplicity | PASS | Reuses existing helpers, minimal new code; Playwright is the industry standard |
| V. CI/CD Pipeline | PASS | New `test:release:browser` script integrates into existing release test structure |
| VI. Frontend Plugin Quality | PASS | Playwright is actively maintained, MIT licensed, TypeScript-native |
| VII. Backend Security | N/A | No backend changes |
| VIII. Observability | N/A | Tests produce screenshots/traces for debugging failures |

**Post-Design Re-check**: All gates still pass. The design adds one dev dependency (`@playwright/test`), reuses existing helpers, and follows the established test structure patterns.

## Project Structure

### Documentation (this feature)

```text
specs/019-e2e-release-tests/
├── plan.md              # This file
├── research.md          # Phase 0: tool selection, architecture decisions
├── data-model.md        # Phase 1: test fixture entities, data-testid additions
├── quickstart.md        # Phase 1: setup and running instructions
├── contracts/           # Phase 1: fixture interfaces, cleanup contracts
│   └── test-fixtures.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
release-tests/
├── browser/                        # NEW — Playwright browser E2E tests
│   ├── playwright.config.ts        # Playwright configuration
│   ├── global-setup.ts             # Server startup (pack → install → start)
│   ├── global-teardown.ts          # Server shutdown and cleanup
│   ├── fixtures.ts                 # Shared test fixtures (git repos, cleanup helpers)
│   ├── session-lifecycle.spec.ts   # P1: Create, queue, auto-activate, kill
│   ├── file-browser.spec.ts        # P1: Files panel, file tree, editor
│   ├── git-diff.spec.ts            # P2: Git panel, diff rendering, colors
│   ├── zoom-shortcuts.spec.ts      # P2: Zoom controls, Ctrl+. chords
│   ├── panel-persistence.spec.ts   # P3: Panel state across session switches
│   └── diff-comments.spec.ts       # P3: Comment add/edit/delete
├── helpers/                        # EXISTING — reused by browser tests
│   ├── environment.ts
│   ├── server.ts
│   ├── artifact.ts
│   └── ...
├── e2e/                            # EXISTING — API-level E2E (unchanged)
├── smoke/                          # EXISTING (unchanged)
├── install/                        # EXISTING (unchanged)
├── upgrade/                        # EXISTING (unchanged)
└── config/                         # EXISTING (unchanged)

frontend/src/
├── components/
│   ├── SessionCard.tsx             # MODIFIED — add data-testid attributes
│   ├── SessionGrid.tsx             # MODIFIED — add data-testid attributes
│   ├── SessionQueue.tsx            # MODIFIED — add data-testid attributes
│   ├── FileTree.tsx                # MODIFIED — add data-testid attributes
│   ├── FileViewer.tsx              # MODIFIED — add data-testid attributes
│   └── DiffViewer.tsx              # MODIFIED — add data-testid attributes
└── pages/
    └── Dashboard.tsx               # MODIFIED — add data-testid to sidebar toggle
```

**Structure Decision**: Tests live in `release-tests/browser/` alongside the existing `release-tests/e2e/` (API-level). This keeps browser tests separate from API tests since they use different runners (Playwright vs Vitest) but share the same helper infrastructure. Frontend components receive minimal `data-testid` additions for reliable selectors.

## Implementation Phases

### Phase A: Infrastructure Setup

1. Install `@playwright/test` as a dev dependency
2. Install Chromium browser binary (`npx playwright install chromium`)
3. Create `playwright.config.ts` with headless defaults, screenshot-on-failure, trace-on-failure
4. Create `global-setup.ts` reusing existing helpers: `packArtifact()` → `createReleaseEnvironment()` → `installArtifact()` → `startServer()` → `waitForHealth()` → write server info to temp file
5. Create `global-teardown.ts`: read server info → `server.stop()` → `env.cleanup()`
6. Create `fixtures.ts` with shared helpers: `cleanupSessions()`, `createTestSession()`, `createGitFixture()`
7. Add npm scripts: `test:release:browser`, `test:release:all`
8. Verify the infrastructure works with a minimal smoke test (navigate to `/`, verify page loads)

### Phase B: Frontend data-testid Additions

Add `data-testid` attributes to these components (non-breaking, visual behavior unchanged):

| Component | Attribute | Purpose |
|-----------|-----------|---------|
| SessionGrid.tsx | `session-grid` | Grid container identification |
| SessionQueue.tsx | `new-session-form` | Form targeting |
| SessionQueue.tsx | `create-session-btn` | Create button click |
| SessionQueue.tsx | `session-title-input` | Title input |
| SessionCard.tsx | `files-btn` | Files panel toggle |
| SessionCard.tsx | `git-btn` | Git panel toggle |
| FileTree.tsx | `file-tree` | File tree container |
| FileViewer.tsx | `file-viewer` | Editor container |
| DiffViewer.tsx | `diff-viewer` | Diff container |
| DiffViewer.tsx | `diff-file-list` | Changed files list |
| DiffViewer.tsx | `comment-input` | Comment textarea |
| DiffViewer.tsx | `add-comment-btn` | Add Comment button |
| SessionGrid.tsx | `overflow-bar` | More Sessions section |
| Dashboard.tsx | `sidebar-toggle` | New Session sidebar button |

### Phase C: P1 Tests — Session Lifecycle & File Browser

**session-lifecycle.spec.ts**:
- Test: Create session via sidebar form → verify session card appears in grid
- Test: Create 3 sessions (max 2 concurrent) → verify 3rd enters overflow/queue
- Test: Kill active session → verify queued session auto-activates within 3s
- Test: Kill session via X button → verify card removed from grid
- Test: Empty state — no sessions, grid shows appropriate content

**file-browser.spec.ts**:
- Test: Open Files panel via button → file tree appears with project structure
- Test: Click file in tree → editor opens with correct content
- Test: Close Files panel → panel collapses, terminal reclaims space
- Test: Navigate file tree directories → expand/collapse works

### Phase D: P2 Tests — Git Diff & Zoom

**git-diff.spec.ts** (requires git fixture):
- Test: Open Git panel → changed files list appears
- Test: Click changed file → side-by-side diff renders
- Test: Diff colors — additions green, deletions red
- Test: Multiple changed files — switching between them

**zoom-shortcuts.spec.ts**:
- Test: Click zoom button → session fills grid (only one card visible)
- Test: Click unzoom → original multi-session layout restored
- Test: Ctrl+. Z keyboard chord → toggles zoom
- Test: Ctrl+. K → kills focused session
- Test: Ctrl+. Tab → cycles focus to next session

### Phase E: P3 Tests — Persistence & Comments

**panel-persistence.spec.ts**:
- Test: Open Files panel on session A, switch to B, switch back to A → Files panel restored
- Test: Session A has Git panel, session B has no panels → each maintains its own state
- Test: Refresh page → panel state restored

**diff-comments.spec.ts** (requires git fixture):
- Test: Click "+" gutter icon → inline comment input appears
- Test: Type comment and click Add → comment saved and displayed inline
- Test: Click edit on comment → text becomes editable
- Test: Click delete on comment → comment removed

### Phase F: CI Integration & Validation

1. Update existing unit tests for components that received `data-testid` additions
2. Run full release test suite to verify no regressions
3. Run browser E2E suite end-to-end in headless mode
4. Verify screenshot/trace output on simulated failure
5. Verify `test:release:all` runs both suites sequentially

## Complexity Tracking

No constitution violations. All design decisions use the simplest available approach:
- Single new dependency (`@playwright/test`) — well-maintained, widely adopted
- Reuses all existing helpers — no duplication
- `data-testid` additions are non-breaking, no visual changes
- Chromium-only (no multi-browser complexity) — sufficient for release validation
