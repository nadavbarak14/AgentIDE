# Tasks: C3 — Command & Control Dashboard

**Input**: Design documents from `/specs/001-c3-dashboard/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Core Model**: Sessions ARE the queue. There is no separate "task" entity. Users create sessions, sessions queue up, and activate when slots open. The dashboard is a rolling IDE for managing many Claude Code sessions simultaneously.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, workspace configuration, and dependency installation

- [x] T001 Create root package.json with npm workspaces configuration for backend/ and frontend/
- [x] T002 [P] Initialize backend package: TypeScript config, Express, better-sqlite3, ws, node-pty, ssh2, pino, chokidar, uuid dependencies in backend/package.json
- [x] T003 [P] Initialize frontend package: Vite + React 18 + Tailwind CSS 3, @xterm/xterm, @xterm/addon-fit, @xterm/addon-webgl, @monaco-editor/react, diff2html dependencies in frontend/package.json
- [x] T004 [P] Configure ESLint + Prettier for both packages in .eslintrc.cjs and .prettierrc
- [x] T005 [P] Configure Vitest for backend (TypeScript, real pty/sqlite/ws) in backend/vitest.config.ts
- [x] T006 [P] Configure Vitest + React Testing Library for frontend in frontend/vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Define shared TypeScript interfaces for all entities (Session with queue position + needs_input, Worker, Artifact, Settings with max_visible_sessions) and WebSocket message types in backend/src/models/types.ts
- [x] T008 Implement SQLite database connection with WAL mode, pragmas, and schema initialization (CREATE TABLE IF NOT EXISTS for sessions, workers, artifacts, settings tables + indexes) in backend/src/models/db.ts
- [x] T009 Implement data repository with CRUD operations for all entities (sessions with queue ordering + needs_input updates, workers, artifacts, settings) in backend/src/models/repository.ts
- [x] T010 [P] Implement structured logger using Pino with correlation IDs, session context, and log level configuration in backend/src/services/logger.ts
- [x] T011 Create Express app skeleton with JSON body parsing, error handling middleware, request logging, and input validation helpers in backend/src/api/middleware.ts
- [x] T012 Implement settings API routes (GET /api/settings, PATCH /api/settings including max_visible_sessions) in backend/src/api/routes/settings.ts
- [x] T013 [P] Create frontend REST API client service (typed fetch wrapper for all endpoints — sessions, workers, files, settings) in frontend/src/services/api.ts
- [x] T014 [P] Create frontend WebSocket client service (connect, binary/text frame handling, reconnection, needs_input event handling) in frontend/src/services/ws.ts
- [x] T015 Unit test: repository CRUD operations with real SQLite database (session queue ordering, needs_input flag, worker CRUD) in backend/tests/unit/repository.test.ts
- [x] T016 Unit test: database initialization and schema creation in backend/tests/unit/db.test.ts
- [x] T017 Integration test: settings API (GET/PATCH, validation, max_visible_sessions) with real Express server in backend/tests/integration/api-settings.test.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Launch and Monitor Parallel Claude Code Sessions (Priority: P1) MVP

**Goal**: Users can create sessions, see them queue up, watch multiple Claude terminals running in parallel, interact via live terminal, and continue completed sessions via `claude -c`. Sessions needing input automatically surface to focus.

**Independent Test**: Create 3 sessions with max_sessions=2. Verify 2 activate immediately with live terminals. Type instructions. Verify 3rd queues and auto-activates on completion. Verify needs_input detection surfaces a session.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T018 [P] [US1] Unit test: queue-manager dispatch logic — max_sessions enforcement, session queue ordering, continue queueing, needs_input priority in backend/tests/unit/queue-manager.test.ts
- [ ] T019 [P] [US1] Unit test: session-manager lifecycle transitions (queued→active→completed, claude -c continue, slot counting, needs_input detection from terminal patterns) in backend/tests/unit/session-manager.test.ts
- [x] T020 [P] [US1] Integration test: sessions API (POST create, GET list with status filter, PATCH reorder/lock, DELETE, POST continue, POST kill, POST input) with real Express + SQLite in backend/tests/integration/api-sessions.test.ts
- [ ] T021 [P] [US1] Integration test: WebSocket terminal streaming (binary frames, resize messages, session_status events, needs_input events) with real ws server in backend/tests/integration/websocket.test.ts
- [ ] T022 [US1] System test: full session flow (create 3 sessions, verify 2 active + 1 queued, interact via terminal, complete 1, verify auto-dispatch, continue completed session, verify needs_input surfacing) in backend/tests/system/queue-dispatch.test.ts

### Implementation for User Story 1

- [x] T023 [P] [US1] Implement PTY spawner (spawn `claude` process via node-pty, handle exit code, capture claude_session_id from output, support `claude -c` for continuation, detect terminal idle + prompt patterns for needs_input) in backend/src/worker/pty-spawner.ts
- [x] T024 [P] [US1] Implement queue manager (session queue ordering, auto-dispatch to available slots, max_sessions enforcement counting only active processes, queue continue requests, prioritize needs_input sessions) in backend/src/services/queue-manager.ts
- [x] T025 [US1] Implement session manager (create sessions, lifecycle transitions, spawn via PTY spawner, handle completion/failure, `claude -c` continue flow, active slot counting, needs_input state management) in backend/src/services/session-manager.ts (depends on T023, T024)
- [x] T026 [US1] Implement sessions API routes (GET /api/sessions with status filter, POST /api/sessions create+auto-activate, PATCH /api/sessions/:id reorder/lock/title, DELETE /api/sessions/:id, POST /api/sessions/:id/continue, POST /api/sessions/:id/kill, POST /api/sessions/:id/input) in backend/src/api/routes/sessions.ts (depends on T025)
- [x] T027 [US1] Implement WebSocket handler per session (upgrade at /ws/sessions/:id, binary PTY data streaming, JSON control messages for resize/input/status, session_status events on complete, needs_input events) in backend/src/api/websocket.ts (depends on T023)
- [x] T028 [US1] Wire hub entry point: Express server + WebSocket upgrade + register local worker + queue auto-dispatch interval loop in backend/src/hub-entry.ts (depends on T025, T027)
- [x] T029 [US1] Wire worker entry point: PTY spawner initialization + command listener for spawn/continue/input/resize/kill in backend/src/worker-entry.ts (depends on T023)
- [x] T030 [P] [US1] Create useSessionQueue hook (poll GET /api/sessions, create session, reorder, remove, optimistic updates) in frontend/src/hooks/useSessionQueue.ts
- [x] T031 [P] [US1] Create useWebSocket hook (connect to /ws/sessions/:id, handle binary terminal data + JSON control messages including needs_input, reconnection on close) in frontend/src/hooks/useWebSocket.ts
- [x] T032 [P] [US1] Create useTerminal hook (xterm.js Terminal lifecycle, fit addon, webgl renderer, attach to WebSocket binary stream, handle resize events) in frontend/src/hooks/useTerminal.ts
- [x] T033 [P] [US1] Create useSession hook (poll GET /api/sessions, track active/queued/completed/failed, trigger continue, toggle lock, detect needs_input sessions for auto-focus) in frontend/src/hooks/useSession.ts
- [x] T034 [US1] Implement TerminalView component (render xterm.js terminal, auto-resize on container change, keyboard input forwarding) in frontend/src/components/TerminalView.tsx (depends on T032)
- [x] T035 [US1] Implement SessionCard component (terminal embed, status badge with queued/active/completed/failed, "Needs Input" indicator with visual alert, lock/pin toggle, "Continue" button for completed, "Kill" button for active, auto-approve toggle) in frontend/src/components/SessionCard.tsx (depends on T034)
- [x] T036 [US1] Implement SessionQueue component (create session form with directory + title + worker selector, queued session list with drag-to-reorder, delete button, queue position display) in frontend/src/components/SessionQueue.tsx (depends on T030)
- [x] T037 [US1] Implement SessionGrid component (focus-based layout: max_visible_sessions prominent cards at top, scrollable overview of all other sessions below, auto-surface needs_input sessions to focus area) in frontend/src/components/SessionGrid.tsx (depends on T035)
- [x] T038 [US1] Implement Dashboard page (SessionGrid + SessionQueue sidebar, session count display, needs_input alert banner) in frontend/src/pages/Dashboard.tsx (depends on T036, T037)
- [x] T039 [US1] Wire App.tsx with React Router (/ → Dashboard, /settings → Settings placeholder) and main.tsx entry point in frontend/src/App.tsx (depends on T038)

**Checkpoint**: User Story 1 fully functional — users can create sessions, watch parallel Claude terminals, interact live, continue completed sessions

---

## Phase 4: User Story 2 — View File Changes and Code Context (Priority: P2)

**Goal**: Users can browse the file tree of a session's working directory, view file contents with syntax highlighting, and see visual git diffs of uncommitted changes

**Independent Test**: Start a session that modifies files, open file explorer, click a file to view it, click "Show Changes" to see diff

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [ ] T040 [P] [US2] Unit test: file-reader (directory listing with type detection, file content with language inference, size limit enforcement at 1MB) in backend/tests/unit/file-reader.test.ts
- [ ] T041 [P] [US2] Unit test: git-operations (unified diff parsing, worktree create/cleanup, handling repos with no changes) in backend/tests/unit/git-operations.test.ts
- [ ] T042 [US2] Integration test: files API (GET /files tree, GET /files/content, GET /diff) with real Express + real filesystem in backend/tests/integration/api-files.test.ts
- [ ] T043 [US2] System test: file exploration flow — deferred to system test phase

### Implementation for User Story 2

- [x] T044 [P] [US2] Implement file reader (recursive directory listing with type/size, file content with language detection by extension, 1MB size limit) in backend/src/worker/file-reader.ts
- [x] T045 [P] [US2] Implement git operations (git diff --unified output, git worktree add/remove for parallel sessions on same repo, handle non-git directories gracefully) in backend/src/worker/git-operations.ts
- [x] T046 [US2] Implement file watcher (chokidar watching session working directory, emit file_changed WebSocket events with changed paths) in backend/src/worker/file-watcher.ts (depends on T027)
- [x] T047 [US2] Implement files API routes (GET /api/sessions/:id/files with subpath, GET /api/sessions/:id/files/content with path, GET /api/sessions/:id/diff) in backend/src/api/routes/files.ts (depends on T044, T045)
- [x] T048 [P] [US2] Implement FileTree component (collapsible directory tree, file/folder icons, click to open file, auto-refresh on file_changed WebSocket events) in frontend/src/components/FileTree.tsx
- [x] T049 [P] [US2] Implement FileViewer component (Monaco Editor in read-only mode, automatic language detection, syntax highlighting) in frontend/src/components/FileViewer.tsx
- [x] T050 [P] [US2] Implement DiffViewer component (diff2html split-view rendering, green additions/red deletions, file count + line stats header) in frontend/src/components/DiffViewer.tsx
- [x] T051 [US2] Integrate file explorer sidebar into expanded SessionCard (collapsible panel with FileTree + FileViewer + "Show Changes" button triggering DiffViewer, artifact rendering for images/PDFs) in frontend/src/components/SessionCard.tsx (depends on T048, T049, T050)

**Checkpoint**: User Stories 1 AND 2 both work independently — users can monitor sessions AND browse files/diffs

---

## Phase 5: User Story 3 — Live Preview of Running Application (Priority: P3)

**Goal**: The dashboard detects dev server ports on workers, embeds a live preview iframe, and auto-refreshes when source files change

**Independent Test**: Start a session that launches a dev server, verify port detected, iframe loads the app, preview refreshes on file change, shows "Server stopped" on exit

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [ ] T052 [P] [US3] Unit test: port-scanner (parse lsof output across Linux/macOS formats, filter by process tree, ignore well-known ports) in backend/tests/unit/port-scanner.test.ts
- [ ] T053 [US3] System test: live preview flow (start session with dev server, verify port_detected WebSocket event, iframe loads content, file change triggers refresh, port_closed on server stop) in backend/tests/system/live-preview.test.ts

### Implementation for User Story 3

- [x] T054 [P] [US3] Implement port scanner (execute `lsof -i -P -n -sTCP:LISTEN`, parse output, filter to agent process tree, return port numbers) in backend/src/worker/port-scanner.ts
- [x] T055 [US3] Implement port forwarder (ssh2 dynamic forwarding via `client.forwardOut()`, allocate local port, pipe streams, cleanup on port close) in backend/src/hub/port-forwarder.ts (depends on T054)
- [x] T056 [US3] Add port detection polling to file watcher (poll port-scanner every 5 seconds, compare against known ports, emit port_detected/port_closed WebSocket events) in backend/src/worker/file-watcher.ts (depends on T054)
- [x] T057 [US3] Implement LivePreview component (iframe embed at tunneled localhost port, "Server stopped" fallback state, auto-refresh on file_changed WebSocket events, resize with split-pane) in frontend/src/components/LivePreview.tsx
- [x] T058 [US3] Integrate LivePreview split-pane into SessionCard (show LivePreview when port_detected received, hide when port_closed, toggle button to show/hide) in frontend/src/components/SessionCard.tsx (depends on T057)

**Checkpoint**: User Stories 1, 2, AND 3 all work — users can monitor sessions, browse files, AND see live previews

---

## Phase 6: User Story 4 — Connect and Manage Remote Worker Machines (Priority: P4)

**Goal**: Users can add remote workers via SSH credentials, sessions run on remote machines through SSH tunnels with identical UX to local sessions

**Independent Test**: Add a remote worker via settings, create a session assigned to it, verify session runs remotely with terminal streaming, file tree, and SSH-only networking

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [ ] T059 [P] [US4] Unit test: tunnel manager (connect with keepalive, reconnect with exponential backoff, forwardPort/discoverListeningPorts) in backend/tests/unit/tunnel.test.ts
- [ ] T060 [P] [US4] Unit test: worker-manager (add/remove workers, dispatch to correct worker, health check, handle disconnect) in backend/tests/unit/worker-manager.test.ts
- [ ] T061 [US4] Integration test: workers API (GET/POST/DELETE, POST /test, 409 on delete with active sessions) with real Express in backend/tests/integration/api-workers.test.ts
- [ ] T062 [US4] System test: remote worker flow (add worker via SSH, assign session, verify session on remote, file tree works, tunnel reconnect on disconnect) in backend/tests/system/remote-worker.test.ts

### Implementation for User Story 4

- [x] T063 [P] [US4] Implement SSH tunnel manager (ssh2 Client with keepaliveInterval, connect/disconnect, exponential backoff reconnect, forwardPort for dynamic tunneling, discoverListeningPorts via exec) in backend/src/hub/tunnel.ts
- [x] T064 [US4] Implement worker client (hub-side: send spawn/continue/input/resize/kill/list_files/read_file/git_diff/discover_ports commands over SSH exec channels, receive streamed events) in backend/src/hub/worker-client.ts (depends on T063)
- [x] T065 [US4] Implement worker manager (add/remove workers, maintain ssh2 connection pool, dispatch sessions to workers respecting per-worker max_sessions, health check heartbeats) in backend/src/services/worker-manager.ts (depends on T064)
- [x] T066 [US4] Implement workers API routes (GET /api/workers, POST /api/workers, DELETE /api/workers/:id, POST /api/workers/:id/test) in backend/src/api/routes/workers.ts (depends on T065)
- [x] T067 [US4] Update session-manager to dispatch sessions to remote workers via worker-client (route file/diff/port requests through SSH tunnel instead of local filesystem) in backend/src/services/session-manager.ts (depends on T064)
- [x] T068 [P] [US4] Implement WorkerList component (worker cards with status indicator, add worker form with SSH fields, remove button, test connection button with latency display) in frontend/src/components/WorkerList.tsx
- [x] T069 [US4] Implement Settings page (WorkerList + dashboard settings form for max_sessions/max_visible_sessions/auto_approve/grid_layout/theme) in frontend/src/pages/Settings.tsx (depends on T068)

**Checkpoint**: All user stories 1-4 work — full local + remote worker support

---

## Phase 7: User Story 5 — Resume Sessions After Restart (Priority: P5)

**Goal**: After browser refresh or backend restart, active sessions are rediscovered, terminal scrollback is restored, and queue state is preserved

**Independent Test**: Start sessions, restart the backend, verify sessions reappear with terminal history. Refresh the browser, verify UI reconnects to active sessions.

### Tests for User Story 5 (MANDATORY per Constitution Principle I)

- [ ] T070 [US5] Unit test: session resume logic (detect live PIDs via kill(pid,0), mark dead sessions completed, preserve claude_session_id for continue, scrollback file load) in backend/tests/unit/session-resume.test.ts
- [ ] T071 [US5] System test: resume flow (start 2 sessions, stop backend, restart, verify sessions restored with correct status, queue preserved, scrollback available) in backend/tests/system/session-resume.test.ts

### Implementation for User Story 5

- [x] T072 [US5] Implement session resume on startup (query sessions with status=active from SQLite, check each PID with kill(pid,0), reattach PTY output stream if alive, mark completed if dead, preserve claude_session_id) in backend/src/services/session-manager.ts
- [x] T073 [US5] Implement terminal scrollback persistence (write scrollback buffer to file on session activity throttled to every 5s, load scrollback on session reconnect, serve via WebSocket on connect) in backend/src/worker/pty-spawner.ts
- [x] T074 [US5] Implement frontend reconnection (on App mount, fetch all active sessions, re-establish WebSocket connections, restore terminal state from scrollback, rebuild session grid) in frontend/src/hooks/useSession.ts

**Checkpoint**: All user stories 1-5 work — full production-grade resilience

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: CI pipeline, security hardening, additional test coverage, final validation

- [x] T075 [P] Configure CI pipeline (GitHub Actions: install, lint, type-check, backend unit tests, backend integration tests, frontend unit tests, system tests) in .github/workflows/ci.yml
- [x] T076 [P] Add input validation and sanitization on all API routes (validate UUIDs, sanitize file paths to prevent directory traversal, validate SSH fields, enforce size limits) in backend/src/api/middleware.ts
- [x] T077 [P] Verify structured logging covers all error paths and session lifecycle events (create, activate, complete, continue, fail, needs_input, reconnect, worker connect/disconnect) in backend/src/services/logger.ts
- [ ] T078 [P] Frontend unit tests: SessionCard, SessionQueue, SessionGrid, FileTree, WorkerList components in frontend/tests/unit/
- [ ] T079 [P] Playwright e2e test: full dashboard flow (create session, watch it run, view files, view diff, manage queue, change settings) in frontend/tests/system/dashboard.spec.ts
- [x] T080 Code cleanup: remove unused imports, ensure consistent error handling across all routes, verify no secrets in logs
- [ ] T081 Run quickstart.md validation (follow quickstart steps on clean machine, verify setup, session creation, terminal interaction all work)
- [ ] T082 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — core MVP
- **User Story 2 (Phase 4)**: Depends on Foundational + US1 WebSocket handler (T027)
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 WebSocket handler (T027)
- **User Story 4 (Phase 6)**: Depends on Foundational + US1 session manager (T025)
- **User Story 5 (Phase 7)**: Depends on US1 session manager + PTY spawner
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — No dependencies on other stories
- **User Story 2 (P2)**: Needs US1's WebSocket handler (T027) for file_changed events — can start US2 backend work in parallel with US1 frontend
- **User Story 3 (P3)**: Needs US1's WebSocket handler (T027) for port events — can start after US1 backend
- **User Story 4 (P4)**: Needs US1's session manager (T025) to add remote dispatch — can start tunnel work in parallel
- **User Story 5 (P5)**: Needs US1's session manager + PTY spawner — start after US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Services before API routes
- API routes before frontend components
- Backend before frontend (API must exist for hooks to call)
- Hooks before components
- Components before pages

### Parallel Opportunities

- All Setup tasks T002-T006 marked [P] can run in parallel
- Foundational: T010, T013, T014 can run in parallel after T009
- US1: Tests T018-T021 can all run in parallel; Backend T023+T024 in parallel; Frontend hooks T030-T033 in parallel
- US2: Tests T040-T041 in parallel; Backend T044+T045 in parallel; Frontend T048+T049+T050 in parallel
- US3: Test T052 + Backend T054 can start in parallel
- US4: Tests T059+T060 in parallel; Backend T063 + Frontend T068 in parallel
- Polish: T075-T079 can all run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently — create sessions, interact via terminal, watch parallel sessions, continue completed sessions, verify needs_input surfacing
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (file browsing + diffs)
4. Add User Story 3 → Test independently → Deploy/Demo (live preview)
5. Add User Story 4 → Test independently → Deploy/Demo (remote workers)
6. Add User Story 5 → Test independently → Deploy/Demo (resume/resilience)
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Sessions ARE the queue — there is no separate "task" entity
- `max_sessions` controls only actively running Claude processes — completed/queued sessions don't count
- `max_visible_sessions` controls how many sessions are shown in focus (default: 2)
- `needs_input` detection: terminal idle + prompt pattern → session surfaces to focus area
- `claude -c <session-id>` is used for session continuation — the session ID must be captured from Claude CLI output
- Users interact with sessions via the live terminal — type instructions, answer questions, no process kill needed
