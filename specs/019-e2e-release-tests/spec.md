# Feature Specification: E2E Release Tests

**Feature Branch**: `019-e2e-release-tests`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "Add e2e tests to release tests that follow the specs"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Session Lifecycle E2E Validation (Priority: P1)

As a release engineer, I can run end-to-end tests that validate the complete session lifecycle — creating sessions, queuing when limits are reached, auto-activation when slots free up, and session termination — against a real running server, so that I have confidence the core session management works before shipping a release.

**Why this priority**: Session management is the foundational feature of the product. If sessions cannot be created, queued, or terminated correctly, no other feature matters.

**Independent Test**: Can be fully tested by starting a real server, creating sessions via the UI, verifying the session grid updates, and confirming queue behavior matches spec 001 acceptance criteria.

**Acceptance Scenarios**:

1. **Given** a freshly started server with default settings (max 2 concurrent sessions), **When** a user creates 3 sessions through the UI, **Then** the first 2 sessions appear in the session grid as active and the 3rd session appears in the overflow/queue area.
2. **Given** 2 active sessions and 1 queued session, **When** one active session is killed via the X button, **Then** the queued session auto-activates and appears in the session grid within 3 seconds.
3. **Given** an active session, **When** the user clicks the X close button on the session card, **Then** the session is terminated and removed from the active grid.

---

### User Story 2 - File Browser & Editor E2E Validation (Priority: P1)

As a release engineer, I can run end-to-end tests that validate the file browser panel opens correctly, displays the project file tree, allows file selection, and shows file content in the editor — so that I can confirm the IDE panels work as specified in specs 002 and 004.

**Why this priority**: File browsing and editing is a core IDE function used in every session. Broken file operations block all development workflows.

**Independent Test**: Can be fully tested by creating a session with a known project directory, opening the Files panel, navigating the file tree, and verifying file content renders correctly in the editor.

**Acceptance Scenarios**:

1. **Given** an active session with a project containing files, **When** the user opens the Files panel, **Then** the file tree displays the project directory structure.
2. **Given** the Files panel is open, **When** the user clicks on a file in the tree, **Then** the file opens in the code editor with correct content and syntax highlighting.
3. **Given** a file is open in the editor, **When** the user closes the Files panel, **Then** the panel collapses and the terminal reclaims the space.

---

### User Story 3 - Git Diff Viewer E2E Validation (Priority: P2)

As a release engineer, I can run end-to-end tests that validate the git diff viewer displays changes correctly in a side-by-side layout with proper color coding — so that I can confirm diff rendering works as specified in specs 002 and 004.

**Why this priority**: Code review via diffs is a frequent user workflow. Incorrect diff rendering (wrong colors, missing lines, broken layout) degrades the review experience.

**Independent Test**: Can be fully tested by creating a session with known git changes, opening the Git panel, and verifying the diff displays additions in green and deletions in red in a side-by-side layout.

**Acceptance Scenarios**:

1. **Given** an active session with uncommitted git changes, **When** the user opens the Git panel, **Then** a list of changed files appears.
2. **Given** the Git panel shows changed files, **When** the user clicks a changed file, **Then** a side-by-side diff renders with the old version on the left and new version on the right.
3. **Given** a diff is displayed, **Then** added lines appear with a green background and deleted lines appear with a red background.

---

### User Story 4 - Session Zoom & Keyboard Shortcuts E2E Validation (Priority: P2)

As a release engineer, I can run end-to-end tests that validate zoom controls and keyboard shortcuts work correctly — including zooming a session to fill the grid, unzooming to restore layout, and chord-based shortcuts (Ctrl+. prefix) — so that I can confirm the UX from spec 016 works as designed.

**Why this priority**: Zoom and shortcuts are power-user features that enhance productivity. They involve complex state transitions (grid layout changes, chord detection) that are prone to regressions.

**Independent Test**: Can be fully tested by creating multiple sessions, clicking the zoom button, verifying the session fills the grid, and testing keyboard chord sequences.

**Acceptance Scenarios**:

1. **Given** 2+ active sessions in the grid, **When** the user clicks the zoom button on one session, **Then** that session expands to fill the entire grid area.
2. **Given** a zoomed session, **When** the user clicks the unzoom button (or presses Ctrl+. Z), **Then** the original multi-session grid layout is restored.
3. **Given** an active session, **When** the user presses Ctrl+. followed by K, **Then** the focused session is killed.
4. **Given** multiple active sessions, **When** the user presses Ctrl+. followed by Tab, **Then** focus cycles to the next session.

---

### User Story 5 - Panel State Persistence E2E Validation (Priority: P3)

As a release engineer, I can run end-to-end tests that validate panel state persists correctly when switching between sessions and after page refresh — so that I can confirm users don't lose their workspace layout as specified in spec 006.

**Why this priority**: State persistence is an expectation for any IDE. Losing panel state on session switch or refresh creates frustration, but it's less critical than core session and file functionality.

**Independent Test**: Can be fully tested by opening panels in one session, switching to another session, switching back, and verifying the original panel configuration is restored.

**Acceptance Scenarios**:

1. **Given** session A has the Files panel open showing a specific file, **When** the user switches to session B and back to session A, **Then** the Files panel reappears with the same file still displayed.
2. **Given** session A has the Git panel open and session B has no panels open, **When** the user switches between them, **Then** each session shows its own panel configuration.
3. **Given** a session with panels open, **When** the user refreshes the browser page, **Then** the panel state is restored after reload.

---

### User Story 6 - Diff Comment Workflow E2E Validation (Priority: P3)

As a release engineer, I can run end-to-end tests that validate the complete comment workflow on git diffs — adding comments inline, editing them, deleting them, and sending them — so that I can confirm the code review commenting system from spec 004 works end-to-end.

**Why this priority**: Commenting is a secondary but important interaction built on top of the diff viewer. It requires the diff viewer (P2) to work first.

**Independent Test**: Can be fully tested by opening a diff, clicking the add-comment gutter button, typing a comment, verifying it appears inline, editing it, and deleting it.

**Acceptance Scenarios**:

1. **Given** a diff is displayed in the Git panel, **When** the user clicks the "+" gutter icon on a line, **Then** an inline comment input box appears below that line.
2. **Given** an inline comment box is open, **When** the user types a comment and clicks "Add Comment", **Then** the comment is saved and displayed inline below the line.
3. **Given** a pending comment exists on a diff line, **When** the user clicks edit on the comment, **Then** the comment text becomes editable in the same inline UI.
4. **Given** a pending comment exists, **When** the user clicks delete, **Then** the comment is removed from the display.

---

### Edge Cases

- What happens when the server is started with no existing sessions (empty state)?
- What happens when a session is killed while a panel (Files/Git) is loading content?
- What happens when the browser window is resized while sessions are zoomed?
- What happens when all sessions are terminated — does the grid show an appropriate empty state?
- What happens when tests run against a server that takes longer than expected to start?
- What happens when multiple keyboard shortcuts are triggered in rapid succession?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The test suite MUST validate all acceptance scenarios from feature specs 001 (session grid), 002 (IDE panels), 004 (UX polish), and 016 (zoom controls) through browser-level interaction.
- **FR-002**: Each test MUST start a real server instance (not mocked) and interact with it through a real browser, matching how actual users interact with the product.
- **FR-003**: Tests MUST run in headless mode by default for CI/CD integration, with an option to run headed for debugging.
- **FR-004**: Tests MUST be runnable via a single command as part of the release test suite.
- **FR-005**: Test failures MUST produce clear output identifying which spec acceptance scenario failed, including screenshots or traces for debugging.
- **FR-006**: Tests MUST be isolated — each test file starts with a clean server and clean state, with no cross-test dependencies.
- **FR-007**: The test suite MUST complete within a reasonable time budget for release validation (under 5 minutes total).
- **FR-008**: Tests MUST cover the session lifecycle: creation, queuing, auto-activation, and termination.
- **FR-009**: Tests MUST cover the IDE panels: file browser open/close, file selection and display, git diff rendering.
- **FR-010**: Tests MUST cover zoom controls: zoom to fill grid, unzoom to restore layout, and keyboard chord shortcuts.
- **FR-011**: Tests MUST cover panel state persistence across session switches.
- **FR-012**: Tests MUST cover the diff commenting workflow: add, edit, delete comments inline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All acceptance scenarios from specs 001, 002, 004, and 016 have at least one corresponding automated E2E test that exercises the scenario through browser interaction.
- **SC-002**: The full E2E test suite passes on a clean install with no manual intervention.
- **SC-003**: The test suite completes in under 5 minutes when run in headless mode.
- **SC-004**: When a test fails, the output includes a screenshot and enough context to identify the failing interaction without re-running manually.
- **SC-005**: Tests can be run independently (any single test file runs successfully on its own) or as a full suite.
- **SC-006**: The test suite is integrated into the existing release test command structure (runnable alongside smoke, install, and upgrade tests).

## Assumptions

- The existing release test helpers (environment creation, artifact packing, server startup) can be reused or extended for browser-based E2E tests.
- A browser automation tool will be added as a dev dependency for running these tests.
- Tests will run against the built/packed version of the application (same as existing release tests), not the development server.
- Remote worker/SSH features are excluded from this E2E scope due to infrastructure requirements; they are covered by existing integration tests.
- Terminal content verification (ANSI rendering, cursor position) is excluded from this scope as it requires specialized terminal testing approaches.
