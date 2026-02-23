# Tasks: E2E Release Tests

**Input**: Design documents from `/specs/019-e2e-release-tests/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: This feature IS a testing feature — the deliverables are test files themselves. Each user story produces a Playwright spec file that validates acceptance scenarios from prior feature specs. The constitution's testing mandate (Principle I) is fulfilled by the tests being the primary output.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Test files**: `release-tests/browser/` (new Playwright directory)
- **Frontend components**: `frontend/src/components/`, `frontend/src/pages/`
- **Existing helpers**: `release-tests/helpers/` (reused, not modified)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Playwright, create configuration, and establish the test runner infrastructure

- [ ] T001 Install `@playwright/test` as a dev dependency and install Chromium browser binary in root `package.json`
- [ ] T002 Create Playwright configuration in `release-tests/browser/playwright.config.ts` with headless defaults, screenshot-on-failure, trace-on-failure, 60s test timeout, Chromium-only project, globalSetup and globalTeardown paths
- [ ] T003 Create global setup in `release-tests/browser/global-setup.ts` that reuses existing helpers: `packArtifact()` → `createReleaseEnvironment()` → `installArtifact()` → `startServer()` → `waitForHealth()` → writes server info (baseURL, dataDir, env paths) to a temp `.server-info.json` file
- [ ] T004 Create global teardown in `release-tests/browser/global-teardown.ts` that reads `.server-info.json`, stops the server, cleans up the environment, and removes the info file
- [ ] T005 Create shared fixtures in `release-tests/browser/fixtures.ts` with: `cleanupSessions(baseURL)` helper that DELETEs all sessions via API, `createTestSession(baseURL, opts)` helper that POSTs a new session, `createGitFixture(dataDir)` helper that creates a temp git repo with known files and uncommitted modifications per the default fixture in contracts/test-fixtures.md
- [ ] T006 Add npm scripts to root `package.json`: `"test:release:browser"` runs `npx playwright test --config release-tests/browser/playwright.config.ts`, `"test:release:all"` runs `npm run test:release && npm run test:release:browser`
- [ ] T007 Create a minimal smoke spec in `release-tests/browser/smoke.spec.ts` that navigates to `/`, waits for the page to load, and verifies the dashboard renders (session grid visible) — validates the entire infrastructure chain works

**Checkpoint**: Playwright infrastructure is operational — `npm run test:release:browser` runs and the smoke spec passes against a real packed server.

---

## Phase 2: Foundational (data-testid Attributes)

**Purpose**: Add `data-testid` attributes to frontend components so Playwright tests have reliable selectors. All additions are non-breaking — no visual or behavioral changes.

**⚠️ CRITICAL**: Browser test specs in later phases depend on these selectors being present.

- [ ] T008 [P] Add `data-testid="session-grid"` to the grid container and `data-testid="overflow-bar"` to the "More Sessions" collapsible section in `frontend/src/components/SessionGrid.tsx`
- [ ] T009 [P] Add `data-testid="new-session-form"` to the form element, `data-testid="session-title-input"` to the title text input, and `data-testid="create-session-btn"` to the Create Session button in `frontend/src/components/SessionQueue.tsx`
- [ ] T010 [P] Add `data-testid="files-btn"` to the Files panel toggle button and `data-testid="git-btn"` to the Git panel toggle button in the toolbar section of `frontend/src/components/SessionCard.tsx`
- [ ] T011 [P] Add `data-testid="file-tree"` to the tree container element in `frontend/src/components/FileTree.tsx`
- [ ] T012 [P] Add `data-testid="file-viewer"` to the editor container element in `frontend/src/components/FileViewer.tsx`
- [ ] T013 [P] Add `data-testid="diff-viewer"` to the diff container, `data-testid="diff-file-list"` to the changed files list, `data-testid="comment-input"` to the comment textarea, and `data-testid="add-comment-btn"` to the Add Comment button in `frontend/src/components/DiffViewer.tsx`
- [ ] T014 [P] Add `data-testid="sidebar-toggle"` to the New Session / Close sidebar toggle button in `frontend/src/pages/Dashboard.tsx`
- [ ] T015 Run existing unit tests (`npm test`) to verify all `data-testid` additions cause no regressions, and rebuild the frontend (`npm run build --workspace=frontend`) to verify the build succeeds

**Checkpoint**: All selectors are in place, existing tests pass, frontend builds cleanly. Test specs can now reference these `data-testid` attributes.

---

## Phase 3: User Story 1 — Session Lifecycle E2E Validation (Priority: P1) 🎯 MVP

**Goal**: Validate session creation, queuing, auto-activation, and termination through real browser interaction against a real server.

**Independent Test**: Run `npx playwright test session-lifecycle` — all tests pass.

### Implementation

- [ ] T016 [US1] Create `release-tests/browser/session-lifecycle.spec.ts` with test: "creates a session via sidebar form and it appears in the grid" — open sidebar (`data-testid="sidebar-toggle"`), fill title input (`data-testid="session-title-input"`), set working directory via project picker, click Create Session (`data-testid="create-session-btn"`), verify a session card with the title appears in `data-testid="session-grid"`
- [ ] T017 [US1] Add test to `release-tests/browser/session-lifecycle.spec.ts`: "queues 3rd session when max concurrent is 2" — create 3 sessions (2 via API for speed + 1 via UI), verify first 2 appear in `session-grid` and 3rd appears in `overflow-bar`
- [ ] T018 [US1] Add test to `release-tests/browser/session-lifecycle.spec.ts`: "auto-activates queued session when active session is killed" — create 3 sessions (2 active + 1 queued), kill one active session via `data-testid="close-button"`, wait up to 3 seconds, verify the previously queued session now appears in the active grid
- [ ] T019 [US1] Add test to `release-tests/browser/session-lifecycle.spec.ts`: "kills session via X button and removes it from grid" — create 1 session, click `data-testid="close-button"`, verify the session card is removed from the grid
- [ ] T020 [US1] Add test to `release-tests/browser/session-lifecycle.spec.ts`: "shows empty state when no sessions exist" — ensure no sessions exist (cleanup), navigate to `/`, verify the grid shows appropriate empty content (no session cards)

**Checkpoint**: Session lifecycle E2E tests pass — creation, queuing, auto-activation, killing, and empty state all validated through the browser.

---

## Phase 4: User Story 2 — File Browser & Editor E2E Validation (Priority: P1)

**Goal**: Validate the Files panel opens, displays the project file tree, and file selection shows content in the editor.

**Independent Test**: Run `npx playwright test file-browser` — all tests pass.

### Implementation

- [ ] T021 [US2] Create `release-tests/browser/file-browser.spec.ts` with `beforeEach` that creates a session pointed at a temp directory with known files (e.g., `README.md`, `src/index.ts`) via API, navigates to `/`, and selects that session
- [ ] T022 [US2] Add test to `release-tests/browser/file-browser.spec.ts`: "opens Files panel and displays file tree" — click `data-testid="files-btn"` on the session card, verify `data-testid="file-tree"` becomes visible, verify the known files (README.md, src/) appear in the tree
- [ ] T023 [US2] Add test to `release-tests/browser/file-browser.spec.ts`: "clicking a file opens it in the editor" — with Files panel open, click on `README.md` in the file tree, verify `data-testid="file-viewer"` becomes visible, verify the editor contains the expected file content
- [ ] T024 [US2] Add test to `release-tests/browser/file-browser.spec.ts`: "closing Files panel collapses it" — with Files panel open, click `data-testid="files-btn"` again to toggle off, verify `data-testid="file-tree"` is no longer visible

**Checkpoint**: File browser E2E tests pass — panel open/close, file tree display, and file content rendering all validated.

---

## Phase 5: User Story 3 — Git Diff Viewer E2E Validation (Priority: P2)

**Goal**: Validate the Git panel shows changed files and renders diffs correctly with proper color coding.

**Independent Test**: Run `npx playwright test git-diff` — all tests pass.

### Implementation

- [ ] T025 [US3] Create `release-tests/browser/git-diff.spec.ts` with `beforeEach` that uses `createGitFixture()` to set up a git repo with known uncommitted changes, creates a session pointed at that repo via API, navigates to `/`, and selects that session
- [ ] T026 [US3] Add test to `release-tests/browser/git-diff.spec.ts`: "opens Git panel and shows changed files" — click `data-testid="git-btn"`, verify `data-testid="diff-viewer"` becomes visible, verify `data-testid="diff-file-list"` contains the modified files (README.md, src/index.ts)
- [ ] T027 [US3] Add test to `release-tests/browser/git-diff.spec.ts`: "clicking a changed file shows side-by-side diff" — click on README.md in the file list, verify the diff area shows two columns (old on left, new on right), verify the diff content matches the known modifications
- [ ] T028 [US3] Add test to `release-tests/browser/git-diff.spec.ts`: "additions shown in green, deletions in red" — with a diff displayed, verify elements with added content have green-tinted background (check computed styles or CSS classes containing 'green'), verify elements with deleted content have red-tinted background

**Checkpoint**: Git diff E2E tests pass — changed files list, side-by-side rendering, and color coding all validated.

---

## Phase 6: User Story 4 — Session Zoom & Keyboard Shortcuts E2E Validation (Priority: P2)

**Goal**: Validate zoom controls expand/collapse sessions in the grid, and Ctrl+. chord shortcuts work correctly.

**Independent Test**: Run `npx playwright test zoom-shortcuts` — all tests pass.

### Implementation

- [ ] T029 [US4] Create `release-tests/browser/zoom-shortcuts.spec.ts` with `beforeEach` that creates 2 sessions via API, navigates to `/`, and waits for both session cards to appear in the grid
- [ ] T030 [US4] Add test to `release-tests/browser/zoom-shortcuts.spec.ts`: "clicking zoom button expands session to fill grid" — click `data-testid="zoom-button"` on the first session card, verify only one session card is visible in the grid area, verify the zoom button shows the zoomed icon (`⧉`)
- [ ] T031 [US4] Add test to `release-tests/browser/zoom-shortcuts.spec.ts`: "clicking unzoom restores multi-session grid" — zoom a session, then click the zoom button again, verify both session cards are visible in the grid
- [ ] T032 [US4] Add test to `release-tests/browser/zoom-shortcuts.spec.ts`: "Ctrl+. Z chord toggles zoom" — press `Control+.` then `z` (chord sequence), verify session zooms, repeat the chord, verify session unzooms
- [ ] T033 [US4] Add test to `release-tests/browser/zoom-shortcuts.spec.ts`: "Ctrl+. K chord kills focused session" — press `Control+.` then `k`, verify the focused session is removed from the grid
- [ ] T034 [US4] Add test to `release-tests/browser/zoom-shortcuts.spec.ts`: "Ctrl+. Tab chord cycles to next session" — verify initial focused session, press `Control+.` then `Tab`, verify focus moved to the other session (different session card now has focus styling)

**Checkpoint**: Zoom and keyboard shortcut E2E tests pass — zoom/unzoom buttons, Ctrl+. Z/K/Tab chords all validated.

---

## Phase 7: User Story 5 — Panel State Persistence E2E Validation (Priority: P3)

**Goal**: Validate panel state persists when switching between sessions and after page refresh.

**Independent Test**: Run `npx playwright test panel-persistence` — all tests pass.

### Implementation

- [ ] T035 [US5] Create `release-tests/browser/panel-persistence.spec.ts` with `beforeEach` that creates 2 sessions (A and B) via API, navigates to `/`, and waits for both to appear in the grid
- [ ] T036 [US5] Add test to `release-tests/browser/panel-persistence.spec.ts`: "panel state preserved across session switches" — click session A, open Files panel (`data-testid="files-btn"`), verify file tree visible, click session B, verify file tree is NOT visible, click session A again, verify file tree IS visible again
- [ ] T037 [US5] Add test to `release-tests/browser/panel-persistence.spec.ts`: "each session maintains independent panel state" — open Git panel on session A (`data-testid="git-btn"`), switch to session B (no panels open), switch between A and B multiple times, verify A always shows Git panel and B always shows no panels
- [ ] T038 [US5] Add test to `release-tests/browser/panel-persistence.spec.ts`: "panel state survives page refresh" — open Files panel on session A, call `page.reload()`, wait for dashboard to load, verify Files panel is still open on session A

**Checkpoint**: Panel persistence E2E tests pass — cross-session switching and page refresh both validated.

---

## Phase 8: User Story 6 — Diff Comment Workflow E2E Validation (Priority: P3)

**Goal**: Validate the inline comment workflow on git diffs: add, edit, and delete comments.

**Independent Test**: Run `npx playwright test diff-comments` — all tests pass.

### Implementation

- [ ] T039 [US6] Create `release-tests/browser/diff-comments.spec.ts` with `beforeEach` that uses `createGitFixture()`, creates a session pointed at the repo, navigates to `/`, selects the session, opens the Git panel, and clicks a changed file to display the diff
- [ ] T040 [US6] Add test to `release-tests/browser/diff-comments.spec.ts`: "clicking + gutter icon opens inline comment input" — locate a "+" icon in the diff gutter (add-comment button on a diff line), click it, verify `data-testid="comment-input"` becomes visible below the line
- [ ] T041 [US6] Add test to `release-tests/browser/diff-comments.spec.ts`: "typing and adding a comment saves it inline" — open a comment input, type "Test comment" into `data-testid="comment-input"`, click `data-testid="add-comment-btn"`, verify the comment text "Test comment" appears in the diff area as a saved comment
- [ ] T042 [US6] Add test to `release-tests/browser/diff-comments.spec.ts`: "editing a comment makes it editable" — add a comment, locate the edit button on the saved comment, click it, verify the comment text becomes editable (input/textarea appears with existing text)
- [ ] T043 [US6] Add test to `release-tests/browser/diff-comments.spec.ts`: "deleting a comment removes it" — add a comment, locate the delete button on the saved comment, click it, verify the comment is no longer visible in the diff area

**Checkpoint**: Diff comment E2E tests pass — add, edit, and delete workflows all validated through the browser.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, CI integration, and cleanup

- [ ] T044 Run the full browser E2E suite end-to-end in headless mode (`npm run test:release:browser`) and verify all spec files pass
- [ ] T045 Run the full release test suite (`npm run test:release:all`) to verify browser tests and existing API-level tests both pass without interference
- [ ] T046 Run existing unit and integration tests (`npm test && npm run lint`) to verify no regressions from `data-testid` additions
- [ ] T047 Verify screenshot and trace artifacts are generated on simulated test failure (temporarily break a test, run suite, confirm output in `test-results/`, then revert)
- [ ] T048 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (Playwright installed) — BLOCKS all test spec phases
- **US1 (Phase 3)**: Depends on Phase 1 + Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 1 + Phase 2 completion — independent of US1
- **US3 (Phase 5)**: Depends on Phase 1 + Phase 2 + `createGitFixture` from T005
- **US4 (Phase 6)**: Depends on Phase 1 + Phase 2 completion — independent of US1-3
- **US5 (Phase 7)**: Depends on Phase 1 + Phase 2 completion — independent but benefits from US2 patterns (Files panel)
- **US6 (Phase 8)**: Depends on Phase 1 + Phase 2 + `createGitFixture` from T005 — benefits from US3 patterns (Git panel)
- **Polish (Phase 9)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Independent — session lifecycle tests only need the sidebar and session grid
- **US2 (P1)**: Independent — file browser tests only need sessions and the Files panel
- **US3 (P2)**: Independent — needs git fixture but no dependency on other user stories
- **US4 (P2)**: Independent — zoom tests only need multiple sessions
- **US5 (P3)**: Independent — panel persistence tests only need sessions and panel toggles
- **US6 (P3)**: Independent — comment tests need git fixture and diff display but no other stories

### Within Each User Story

1. Create spec file with `beforeEach` setup
2. Add individual test cases sequentially (later tests may build on setup patterns from earlier ones)
3. Run spec file independently to validate

### Parallel Opportunities

- All Phase 2 tasks (T008–T014) are [P] — different frontend files
- US1 and US2 can run in parallel (different spec files, no shared state beyond the server)
- US3 and US4 can run in parallel
- US5 and US6 can run in parallel

---

## Parallel Example: Phase 2 (data-testid)

```bash
# All these touch different files — can run in parallel:
Task: "Add data-testid to SessionGrid.tsx"      # T008
Task: "Add data-testid to SessionQueue.tsx"      # T009
Task: "Add data-testid to SessionCard.tsx"       # T010
Task: "Add data-testid to FileTree.tsx"          # T011
Task: "Add data-testid to FileViewer.tsx"        # T012
Task: "Add data-testid to DiffViewer.tsx"        # T013
Task: "Add data-testid to Dashboard.tsx"         # T014
```

## Parallel Example: P1 User Stories

```bash
# US1 and US2 are independent — can run in parallel:
Task: "Create session-lifecycle.spec.ts"  # T016 (US1)
Task: "Create file-browser.spec.ts"       # T021 (US2)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001–T007)
2. Complete Phase 2: data-testid additions (T008–T015)
3. Complete Phase 3: US1 Session Lifecycle (T016–T020)
4. **STOP and VALIDATE**: `npx playwright test session-lifecycle` passes
5. This alone proves the Playwright infrastructure works and catches session regressions

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 (Session Lifecycle) → MVP: core feature tested
3. Add US2 (File Browser) → IDE panels tested
4. Add US3 (Git Diff) → Diff rendering tested
5. Add US4 (Zoom/Shortcuts) → Power-user features tested
6. Add US5 (Panel Persistence) → State management tested
7. Add US6 (Diff Comments) → Comment workflow tested
8. Each story adds coverage without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story produces one `.spec.ts` file that can be run independently
- Tests use a shared server instance (globalSetup) but clean up sessions between tests for isolation
- Git fixture tests (US3, US6) create temporary repos — no dependency on any existing repo state
- The `createTestSession` helper creates sessions via API for speed; only US1 tests session creation through the UI form
- Commit after each phase or logical group
- Stop at any checkpoint to validate story independently
