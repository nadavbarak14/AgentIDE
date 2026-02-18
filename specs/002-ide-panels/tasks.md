# Tasks: IDE Panels

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema additions and TypeScript interfaces for panel state and comments

- [x] T001 Add `panel_states` and `comments` CREATE TABLE IF NOT EXISTS statements (with indexes, foreign keys, CASCADE deletes) to `backend/src/models/db.ts`. Schema per `data-model.md`: panel_states has session_id PK, active_panel, file_tabs (JSON), active_tab_index, tab_scroll_positions (JSON), git_scroll_position, preview_url, panel_width_percent, updated_at. Comments has id PK, session_id FK, file_path, start_line, end_line, code_snippet, comment_text, status, created_at, sent_at. Add indexes idx_comments_session and idx_comments_status
- [x] T002 [P] Add `PanelState` and `Comment` TypeScript interfaces to `backend/src/models/types.ts`. PanelState: sessionId, activePanel ('none'|'files'|'git'|'preview'), fileTabs (string[]), activeTabIndex, tabScrollPositions (Record<string, {line, column}>), gitScrollPosition, previewUrl, panelWidthPercent, updatedAt. Comment: id, sessionId, filePath, startLine, endLine, codeSnippet, commentText, status ('pending'|'sent'), createdAt, sentAt
- [x] T003 [P] Add panel state and comment API methods to `frontend/src/services/api.ts`. Methods: panelState.get(sessionId), panelState.save(sessionId, state), comments.list(sessionId, status?), comments.create(sessionId, {filePath, startLine, endLine, codeSnippet, commentText}), comments.deliver(sessionId). Request/response shapes per `contracts/api.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend CRUD, API routes, and frontend layout infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundation (MANDATORY per Constitution Principle I) ✅

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [P] Unit tests for panel state repository methods (getPanelState, savePanelState, deletePanelState) using real in-memory SQLite in `backend/tests/unit/panel-state.test.ts`. Test: create panel state, retrieve it, update it, verify JSON serialization of fileTabs and tabScrollPositions, verify CASCADE delete when session is deleted
- [x] T005 [P] Unit tests for comment repository methods (getComments, getCommentsByStatus, createComment, markCommentSent) using real in-memory SQLite in `backend/tests/unit/comments.test.ts`. Test: create comment, list by session, filter by status, mark as sent with sentAt timestamp, verify CASCADE delete, verify validation (filePath no "..", startLine >= 1, endLine >= startLine)

### Implementation for Foundation

- [x] T006 Add panel state CRUD methods (getPanelState, savePanelState via INSERT OR REPLACE, deletePanelState) and comment CRUD methods (getComments, getCommentsByStatus, createComment, markCommentSent) to `backend/src/models/repository.ts`. Use prepared statements. Panel state: serialize fileTabs and tabScrollPositions as JSON strings on write, parse on read. Comments: validate filePath against path traversal, validate line numbers
- [x] T007 Add panel-state API endpoints to `backend/src/api/routes/sessions.ts`: GET `/api/sessions/:id/panel-state` (returns saved state or 404), PUT `/api/sessions/:id/panel-state` (validates activePanel enum, panelWidthPercent range 20-80, upserts via repository). Add validation for request body fields per `contracts/api.md`
- [x] T008 [P] Modify SessionGrid in `frontend/src/components/SessionGrid.tsx` to compute `isSingleView` (true when displayedSessions.length === 1 or gridLayout === '1x1') and pass it as a prop to each SessionCard
- [x] T009 [P] Create usePanel hook in `frontend/src/hooks/usePanel.ts`. Manages local state: activePanel ('none'|'files'|'git'|'preview'), panelWidthPercent (default 40), fileTabs (string[]), activeTabIndex, tabScrollPositions. Exposes: openPanel(type), closePanel(), addFileTab(path), removeFileTab(path), setActiveTab(index), updateScrollPosition(path, pos), setPanelWidth(percent). Panel toggle: clicking the active panel button closes it, clicking a different button switches to it
- [x] T010 Redesign SessionCard in `frontend/src/components/SessionCard.tsx`: accept `isSingleView` prop. When true: show IDE toolbar row below header with Files/Git/Preview toggle buttons. Render main content as resizable horizontal split — terminal (left, flex-grow) + panel container (right, width from panelWidthPercent). Add drag handle between them for resize. When no panel is open, terminal takes full width. When isSingleView is false: hide toolbar, hide panel container, terminal takes full width. Integrate usePanel hook for state management. Wire toolbar buttons to usePanel.openPanel(). Render FileTree+FileViewer when activePanel='files', DiffViewer when 'git', LivePreview when 'preview'

**Checkpoint**: Foundation ready — panel container visible in 1-view mode, toolbar toggles panels, backend stores state. User story implementation can now begin.

---

## Phase 3: User Story 1 — Browse and View Project Files (Priority: P1) 🎯 MVP

**Goal**: Users can browse the project file tree, click files to view them with syntax highlighting in Monaco Editor, open multiple files in tabs, and see live updates when the agent modifies files.

**Independent Test**: Start a session in 1-view mode. Click "Files" in the toolbar. Verify the file tree loads. Click a file — verify it opens in a syntax-highlighted viewer. Have the agent create a new file — verify the tree updates.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [x] T011 [P] [US1] Unit tests for FileTree component in `frontend/tests/unit/FileTree.test.tsx`. Test: renders directory entries, clicking directory expands it (lazy loads children via API), clicking file calls onFileSelect callback, search filter input filters displayed entries, ".." button navigates to parent, loading state shown while fetching
- [x] T012 [P] [US1] Unit tests for FileViewer component in `frontend/tests/unit/FileViewer.test.tsx`. Test: renders Monaco Editor in read-only mode, displays correct language based on file extension, shows multiple tabs, clicking tab switches displayed file, close button on tab removes it, shows "File truncated" notice for files >1MB, changed indicator (flash/highlight) when content updates

### Implementation for User Story 1

- [x] T013 [P] [US1] Upgrade FileTree in `frontend/src/components/FileTree.tsx`: replace flat directory listing with expandable tree. Each directory node loads children lazily via `api.files.tree(sessionId, subpath)` on expand click. Sort directories first, then files alphabetically. Add breadcrumb path display at top. Add search/filter text input that filters visible entries by name match (client-side filter of loaded entries). Show file icons based on extension. Show loading spinner per directory while fetching. Handle empty directories gracefully
- [x] T014 [P] [US1] Upgrade FileViewer in `frontend/src/components/FileViewer.tsx`: replace `<pre>` element with `@monaco-editor/react` in read-only mode. Props: filePath, content, language. Configure: `readOnly: true`, `minimap: { enabled: false }`, `scrollBeyondLastLine: false`, `wordWrap: 'on'`, theme matched to dashboard theme setting. Add tabbed interface above editor: render tab bar from `fileTabs` array (from usePanel), each tab shows filename with close (×) button, active tab highlighted. Show "File truncated — showing first 1 MB" banner when file size exceeds 1MB. Map file extensions to Monaco language IDs using existing language detection from backend
- [x] T015 [US1] Wire WebSocket `file_changed` events to live-update FileTree and FileViewer in `frontend/src/components/SessionCard.tsx`. On `file_changed` message: if Files panel is open AND a changed path matches the currently displayed directory, re-fetch the directory listing via `api.files.tree()` to update FileTree. If a changed path matches any open file tab, re-fetch the file content via `api.files.content()` and update the Monaco Editor content with a brief yellow highlight flash on the editor container (CSS transition, 500ms) to signal the change. If a deleted file is in an open tab, close that tab automatically via usePanel.removeFileTab()

**Checkpoint**: User Story 1 complete — users can browse files, view them with syntax highlighting, manage tabs, and see live updates. Independently testable.

---

## Phase 4: User Story 2 — Review Git Changes and Comment for Fixes (Priority: P2)

**Goal**: Users can view git diffs with split-view rendering, select lines in the diff, add inline comments that are composed into contextual messages and injected into the Claude Code session. Comments are tracked with Pending/Sent status. Pending comments are auto-delivered when a session resumes.

**Independent Test**: Start a session where the agent modifies files. Click "Git" — verify changed files listed. Click a file — verify diff renders. Add a comment on a line — verify comment is injected as terminal input.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [x] T016 [P] [US2] Unit tests for DiffViewer component in `frontend/tests/unit/DiffViewer.test.tsx`. Test: renders list of changed files with addition/deletion counts, clicking file shows split-view diff, gutter click selects a line (highlighted), shift-click selects line range, "Comment" button appears on selection, comment input submits via API, comment status badge shows Pending then Sent, file_changed event triggers diff refresh
- [x] T017 [P] [US2] Integration tests for comments API endpoints in `backend/tests/integration/ide-panels.test.ts`. Test: POST creates comment and returns 201 with UUID, GET lists comments ordered by createdAt, POST with active session injects into PTY and returns status='sent', POST with inactive session returns status='pending', POST deliver marks all pending as sent, validation rejects filePath with "..", validation rejects empty commentText, validation rejects endLine < startLine

### Implementation for User Story 2

- [x] T018 [P] [US2] Add comments API endpoints to `backend/src/api/routes/sessions.ts`: GET `/api/sessions/:id/comments` (optional query param `status`, returns ordered list), POST `/api/sessions/:id/comments` (validate filePath no path traversal, startLine >= 1, endLine >= startLine, non-empty commentText; create via repository; if session active: compose message using format from `research.md` R2, inject via sessionManager.sendInput(), mark as sent; return 201), POST `/api/sessions/:id/comments/deliver` (fetch pending comments, inject each as composed message, mark sent, return delivered IDs and count). Add structured logging for comment creation and delivery (Principle VIII)
- [x] T019 [P] [US2] Add pending comment auto-delivery on session activation in `backend/src/services/session-manager.ts`. In the activateSession method, after PTY is spawned and ready (after a short delay to allow Claude to initialize), call repository.getCommentsByStatus(sessionId, 'pending'). For each pending comment: compose the contextual message, send via ptySpawner.write(), mark as sent via repository.markCommentSent(). Log delivery count at INFO level
- [x] T020 [US2] Upgrade DiffViewer in `frontend/src/components/DiffViewer.tsx`: Replace raw text diff display with a structured view. Top section: list of changed files as clickable items showing filename, change type badge (M/A/D/R), and +N/-N counts. Clicking a file loads its diff. Diff area: render unified diff with line-by-line coloring (green additions, red deletions, gray context, blue hunk headers @@). Add clickable gutter column to the left of each diff line — clicking a gutter cell selects that line (blue highlight), shift-clicking selects a range. When lines are selected, show a floating "Comment" button near the selection. Clicking "Comment" opens an inline textarea below the selected lines with Submit/Cancel buttons. On submit: call `api.comments.create(sessionId, {filePath, startLine, endLine, codeSnippet: selected lines text, commentText})`. Display submitted comments inline at their line positions with status badge (yellow "Pending" / green "Sent"). Load existing comments via `api.comments.list(sessionId)` on mount and display them in the diff
- [x] T021 [US2] Wire WebSocket `file_changed` events to auto-refresh the Git panel. In `frontend/src/components/SessionCard.tsx`, when activePanel is 'git' and a `file_changed` event is received, re-fetch the diff via `api.files.diff(sessionId)` and update DiffViewer. Debounce refresh to 1 second to avoid excessive API calls during rapid file changes

**Checkpoint**: User Story 2 complete — users can review diffs, add inline comments that are injected into the session, track comment status, and queued comments are delivered on session resume. Independently testable.

---

## Phase 5: User Story 3 — Preview Web Application Output (Priority: P3)

**Goal**: Users can see an embedded live preview of the running dev server, interact with it, and it auto-refreshes when files change.

**Independent Test**: Start a session that launches a dev server. Click "Preview" — verify embedded browser loads the app. Change a visible element — verify preview updates.

### Implementation for User Story 3

- [x] T022 [US3] Upgrade LivePreview in `frontend/src/components/LivePreview.tsx`: Accept detected ports from SessionCard (passed as props from WebSocket port_detected events). When ports are available: show a port selector dropdown if multiple ports detected, load selected port URL in an iframe (`http://localhost:{port}`). When no ports detected: show "No server detected" message with a manual URL text input and "Load" button. Add toolbar above iframe with: current URL display, reload button (re-sets iframe src), "Open in new tab" link (target="_blank"). Handle iframe load errors: show "Unable to load preview — the server may have stopped or the page blocks embedding" with the "Open in new tab" link as fallback. On `port_closed` WebSocket event: if the closed port is the one being previewed, show "Server stopped" message with last URL displayed. On `file_changed` WebSocket event: reload the iframe by appending a cache-busting query param to the src (e.g., `?_t={timestamp}`). Style iframe to fill the panel container with no border

**Checkpoint**: User Story 3 complete — users can preview web applications in an embedded browser alongside the terminal. Independently testable.

---

## Phase 6: User Story 4 — Panel State Persists Across Session Switches (Priority: P4)

**Goal**: Panel state (which panel is open, open file tabs, scroll positions, preview URL, panel width) is saved per session and restored when switching between sessions or refreshing the browser.

**Independent Test**: Open a session in 1-view mode, open Files panel, navigate to a specific file. Switch to a different session. Switch back — verify Files panel is still open with the same file displayed.

### Tests for User Story 4 (MANDATORY per Constitution Principle I) ✅

- [x] T023 [US4] Unit tests for usePanel hook persistence in `frontend/tests/unit/usePanel.test.ts`. Test: opening a panel triggers debounced save to API, switching sessions saves current state and restores target session state, state includes activePanel + fileTabs + activeTabIndex + scrollPositions + panelWidth + previewUrl, restoring from API populates all local state fields correctly, default state (no saved state) shows no panel open, save debounce batches rapid changes into single API call

### Implementation for User Story 4

- [x] T024 [US4] Extend usePanel hook in `frontend/src/hooks/usePanel.ts` with backend persistence. Add `sessionId` parameter. On sessionId change: save current state for previous session via `api.panelState.save()`, then load state for new session via `api.panelState.get()` (if 404, reset to defaults: activePanel='none', fileTabs=[], etc.). Add debounced save (500ms) that triggers on any state change (panel open/close, tab add/remove, scroll position update, width change, preview URL change). On component mount (page load): fetch state from API for current sessionId and restore
- [x] T025 [US4] Integrate panel state persistence with SessionCard and grid mode transitions in `frontend/src/components/SessionCard.tsx`. Pass current sessionId to usePanel hook. When isSingleView changes from true to false: save current panel state to backend, close panel (set activePanel='none' locally without saving the 'none'). When isSingleView changes from false to true: restore panel state from backend for current session. Ensure SessionGrid passes session ID changes correctly when user clicks a different session

**Checkpoint**: User Story 4 complete — panel state fully persists across session switches and browser refreshes. All 4 user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, edge case handling, and CI readiness

- [x] T026 [P] System test for end-to-end IDE panel workflows in `frontend/tests/system/ide-panels.test.ts`. Playwright test: open dashboard, create session, switch to 1-view mode, open Files panel and click a file, switch to Git panel and verify diff, switch to Preview panel, switch sessions and verify panel state restored, refresh browser and verify panel state survives
- [x] T027 [P] Integration test for panel-state API endpoints in `backend/tests/integration/ide-panels.test.ts`. Test GET/PUT panel-state with real Express app and SQLite: PUT saves state, GET retrieves it, PUT with invalid activePanel returns 400, PUT with panelWidthPercent outside 20-80 returns 400, GET for non-existent session returns 404, deleting session cascades to panel_states
- [x] T028 Handle edge cases across all panels: FileViewer shows "File truncated — showing first 1 MB" banner for large files with "Load more" button; DiffViewer virtualizes file list when >50 changed files (render only visible items); browser resize triggers terminal.fit() and panel proportional resize; queued comments for completed sessions are delivered on Continue/resume
- [x] T029 Verify structured logging (Principle VIII) for all new endpoints: panel-state GET/PUT log at DEBUG, comment create/deliver log at INFO with sessionId context, comment delivery failure logs at ERROR with comment ID and session ID
- [x] T030 Run full lint, typecheck, and test suite (`npm test && npm run lint`); fix any issues
- [x] T031 Push branch, wait for CI green, rebase-merge to main (Constitution Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational phase completion
  - US1, US2, US3 can proceed in parallel (different component files)
  - US4 depends on at least one panel (US1) being implemented to test persistence
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — No dependencies on other stories. **This is the MVP.**
- **User Story 2 (P2)**: Can start after Phase 2 — Independent of US1 (different component: DiffViewer vs FileTree/FileViewer)
- **User Story 3 (P3)**: Can start after Phase 2 — Independent of US1/US2 (different component: LivePreview)
- **User Story 4 (P4)**: Depends on US1 completion for meaningful testing — extends usePanel hook that US1/US2/US3 use

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Component upgrades before WebSocket wiring
- Backend endpoints (if any) before frontend consumption
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002 ∥ T003 (different workspaces)
- **Phase 2**: T004 ∥ T005 (different test files), T008 ∥ T009 (different component files)
- **Phase 3 (US1)**: T011 ∥ T012 (different test files), T013 ∥ T014 (different component files)
- **Phase 4 (US2)**: T016 ∥ T017 (frontend vs backend tests), T018 ∥ T019 (different backend files)
- **Cross-story**: US1 (Phase 3) ∥ US2 (Phase 4) ∥ US3 (Phase 5) after Phase 2 completes
- **Phase 7**: T026 ∥ T027 (different test files)

---

## Parallel Example: User Story 1

```bash
# After Phase 2 complete, launch US1 tests in parallel:
Task: "Unit tests for FileTree in frontend/tests/unit/FileTree.test.tsx"        # T011
Task: "Unit tests for FileViewer in frontend/tests/unit/FileViewer.test.tsx"    # T012

# Then launch US1 component upgrades in parallel:
Task: "Upgrade FileTree with lazy loading in frontend/src/components/FileTree.tsx"     # T013
Task: "Upgrade FileViewer with Monaco Editor in frontend/src/components/FileViewer.tsx" # T014

# Then wire up live updates (depends on T013 + T014):
Task: "Wire file_changed events to FileTree and FileViewer in SessionCard.tsx"  # T015
```

## Parallel Example: User Stories 1 + 2 + 3 (after Phase 2)

```bash
# US1, US2, US3 can run on different files simultaneously:
Task: "Upgrade FileTree in FileTree.tsx"          # T013 (US1)
Task: "Add comments API in sessions.ts"           # T018 (US2)
Task: "Upgrade LivePreview in LivePreview.tsx"     # T022 (US3)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (3 tasks)
2. Complete Phase 2: Foundational (7 tasks)
3. Complete Phase 3: User Story 1 — Browse and View Files (5 tasks)
4. **STOP and VALIDATE**: User can open file explorer, view files with syntax highlighting, see live updates
5. Deploy/demo if ready — this alone delivers significant value

### Incremental Delivery

1. Setup + Foundational → Panel infrastructure ready
2. Add US1 (Files) → Test independently → Deploy/Demo (**MVP!**)
3. Add US2 (Git + Comments) → Test independently → Deploy/Demo
4. Add US3 (Preview) → Test independently → Deploy/Demo
5. Add US4 (Persistence) → Test independently → Deploy/Demo
6. Polish → CI green → Merge to main

### Single Developer Sequential Path

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All existing backend infrastructure (file-reader, git-operations, file-watcher, port-scanner) is reused without modification
- No new npm packages required — Monaco Editor and diff2html are existing dependencies
