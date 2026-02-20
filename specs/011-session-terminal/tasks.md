# Tasks: Session Terminal

**Input**: Design documents from `/specs/011-session-terminal/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

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

**Purpose**: Add shared types and API surface used across all user stories

- [x] T001 [P] Add shell-related TypeScript types (ShellStatus type, ShellInfo interface, ShellWsMessage types) to backend/src/models/types.ts
- [x] T002 [P] Add shell API functions (openShell, closeShell, getShellStatus) to frontend/src/services/api.ts
- [x] T003 [P] Add shell WebSocket message types (shell_status server message) to frontend/src/services/ws.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: ShellSpawner core — the backend engine that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create ShellSpawner class in backend/src/worker/shell-spawner.ts — spawn shell PTY (node-pty) with configurable cwd/cols/rows, write input, resize, kill process (SIGTERM process group), EventEmitter for 'data' and 'exit' events, detect shell via process.env.SHELL with /bin/bash fallback, manage active shells in Map<sessionId, ShellProcess>
- [x] T005 Write unit tests for ShellSpawner in backend/tests/unit/shell-spawner.test.ts — test spawn creates PTY process, write sends data to PTY, resize updates dimensions, kill terminates process, getShell returns correct shell path, concurrent shells for different sessions

**Checkpoint**: ShellSpawner is functional and tested — user story implementation can now begin

---

## Phase 3: User Story 1 — Open a Bash Terminal Alongside Claude Session (Priority: P1) 🎯 MVP

**Goal**: Users can open an optional shell terminal panel within an active session, type commands, and see real-time output. The shell panel appears below the Claude terminal.

**Independent Test**: Open a session, launch the shell panel, run `ls` and `echo hello`, verify output displays correctly. Both Claude terminal and shell panel are visible simultaneously.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [x] T006 [P] [US1] Write system test for shell terminal end-to-end flow (REST spawn + WebSocket I/O + REST kill) in backend/tests/system/shell-terminal.test.ts — test POST /api/sessions/:id/shell spawns shell, WebSocket /ws/sessions/:id/shell receives PTY output, binary input is forwarded to PTY, DELETE kills shell, GET returns correct status, 409 on duplicate spawn, 400 on non-active session
- [x] T007 [P] [US1] Write component test for ShellTerminal panel in frontend/tests/components/ShellTerminal.test.tsx — test component renders terminal container, shows open/close button, displays stopped state message, calls API on open/close

### Implementation for User Story 1

- [x] T008 [P] [US1] Add shell REST routes to backend/src/api/routes/sessions.ts — POST /api/sessions/:id/shell (spawn, 201/400/404/409), DELETE /api/sessions/:id/shell (kill, 200/404), GET /api/sessions/:id/shell (status, 200/404), validate session exists and is active for spawn, use ShellSpawner from SessionManager
- [x] T009 [P] [US1] Add shell WebSocket endpoint (/ws/sessions/:id/shell) to backend/src/api/websocket.ts — separate WS server for shell channel, JWT auth (same as Claude WS), binary frames for PTY I/O, JSON frames for resize and shell_status, track shell clients in Map<sessionId, Set<WebSocket>>, broadcast PTY output to all connected shell clients
- [x] T010 [US1] Integrate ShellSpawner into SessionManager in backend/src/services/session-manager.ts — instantiate ShellSpawner alongside PtySpawner, expose openShell/closeShell/getShellStatus methods, kill shell when session is suspended (in autoSuspendSession), kill shell when session completes/fails (in PTY exit handler), kill shell on killSession
- [x] T011 [US1] Create useShellTerminal hook in frontend/src/hooks/useShellTerminal.ts — manage shell WebSocket connection to /ws/sessions/:id/shell, initialize xterm.js Terminal instance (reuse useTerminal pattern), forward binary data to terminal.write, send keyboard input as binary frames, send resize on container change, expose: open (POST API), close (DELETE API), status, connected state
- [x] T012 [US1] Create ShellTerminal panel component in frontend/src/components/ShellTerminal.tsx — render xterm.js terminal container using useShellTerminal hook, header bar with "Shell" label and close button, "Open Shell" button when no shell is running, terminal container when shell is active, match existing panel styling (gray-800 background, consistent header)
- [x] T013 [US1] Add 'shell' panel type to usePanel hook in frontend/src/hooks/usePanel.ts — add 'shell' to PanelContent union type, default shell panel to bottom position, persist shell panel state in panel_states (automatic via existing save mechanism)
- [x] T014 [US1] Add shell toggle button and render ShellTerminal in SessionCard in frontend/src/components/SessionCard.tsx — add terminal icon button to session toolbar (alongside files/git/preview/issues), wire handleTogglePanel('shell') to toggle bottom panel, render ShellTerminal in renderPanelContent case 'shell', add keyboard shortcut for shell toggle via c3:shortcut event

**Checkpoint**: User Story 1 complete — shell terminal opens, accepts input, shows output, can be closed. Both terminals visible simultaneously.

---

## Phase 4: User Story 2 — Terminal Persists Across Session Views (Priority: P2)

**Goal**: Shell terminal output is preserved when navigating away from a session and returning. Shell process stays alive in the background. When session suspends, user sees stopped state with restart option.

**Independent Test**: Open shell, run `echo persist-test`, switch to another session, return — verify "persist-test" output is visible. Then suspend session, continue it, verify shell shows stopped state with restart prompt.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [x] T015 [P] [US2] Write system test for scrollback persistence in backend/tests/system/shell-terminal.test.ts — test scrollback file created after shell output, scrollback sent on new WebSocket connect, scrollback survives client disconnect/reconnect, scrollback cleaned up after session delete

### Implementation for User Story 2

- [x] T016 [US2] Add scrollback persistence to ShellSpawner in backend/src/worker/shell-spawner.ts — accumulate PTY output in buffer, throttled write to scrollback/shell-{sessionId}.scrollback every 5 seconds, flush on shell exit, loadScrollback(sessionId) reads from disk, getScrollbackPath(sessionId) returns file path, delete scrollback file in destroy/cleanup
- [x] T017 [US2] Send persisted scrollback on shell WebSocket connect in backend/src/api/websocket.ts — on new shell WS client connection, call shellSpawner.loadScrollback(sessionId), if data exists send as binary frame before live output, send shell_status JSON with current state
- [x] T018 [US2] Show stopped/killed state with restart prompt in ShellTerminal in frontend/src/components/ShellTerminal.tsx — listen for shell_status messages (stopped/killed), when shell stops: display overlay message "Shell terminated" with reason, show "Restart Shell" button that calls POST /api/sessions/:id/shell, when session suspends: show "Session suspended — shell was terminated"
- [x] T019 [US2] Clean up shell scrollback files when session is deleted in backend/src/services/session-manager.ts — in session delete flow, call shellSpawner.deleteScrollback(sessionId) to remove scrollback/shell-{sessionId}.scrollback

**Checkpoint**: User Story 2 complete — scrollback persists across navigation, shell lifecycle states visible in UI.

---

## Phase 5: User Story 3 — Terminal Auto-Detects Shell Based on OS (Priority: P3)

**Goal**: The shell terminal automatically uses the correct default shell for the host OS (bash on Linux, zsh on macOS) without user configuration.

**Independent Test**: Open shell terminal, run `echo $0` or `echo $SHELL`, verify the output matches the system's default shell.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ✅

- [x] T020 [P] [US3] Write unit tests for shell detection in backend/tests/unit/shell-spawner.test.ts — test getDefaultShell returns process.env.SHELL when set, test fallback to /bin/bash when SHELL is unset, test shell path is included in spawn response and status API

### Implementation for User Story 3

- [x] T021 [US3] Expose detected shell path in shell status API response in backend/src/api/routes/sessions.ts — ensure GET /api/sessions/:id/shell returns `shell` field with detected path (e.g., "/bin/bash", "/bin/zsh"), ensure POST response also includes `shell` field
- [x] T022 [US3] Display detected shell name in ShellTerminal header in frontend/src/components/ShellTerminal.tsx — show shell name (e.g., "bash" or "zsh") in panel header next to "Shell" label when running, extract shell name from API response path (basename)

**Checkpoint**: User Story 3 complete — shell detection works correctly on Linux and macOS.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, logging, and hardening across all stories

- [x] T023 Add structured logging for shell lifecycle events (spawn, kill, exit, error) in backend/src/worker/shell-spawner.ts (Principle VIII)
- [x] T024 Handle edge case: working directory deleted — fall back to os.homedir() with warning log in backend/src/worker/shell-spawner.ts
- [x] T025 Handle edge case: rapid close/reopen — ensure previous shell process is fully killed before spawning new one in backend/src/worker/shell-spawner.ts
- [x] T026 Add shell terminal resize support in frontend/src/components/ShellTerminal.tsx — send resize message on ResizeObserver callback, ensure shell PTY dimensions match panel size
- [x] T027 Verify all tests pass and run full test suite via `npm test && npm run lint`
- [ ] T028 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. All 3 tasks are parallel [P].
- **Foundational (Phase 2)**: Depends on T001 (types). BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion. This is the MVP.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (US1) — extends ShellSpawner and WebSocket with persistence.
- **User Story 3 (Phase 5)**: Depends on Phase 2 only — shell detection is in ShellSpawner. Can run parallel with US1/US2.
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2). No dependencies on other stories. **This is the MVP.**
- **User Story 2 (P2)**: Depends on US1 (extends ShellSpawner with scrollback, extends WebSocket with reconnect, extends UI with stopped state).
- **User Story 3 (P3)**: Depends on Foundational only (shell detection is in ShellSpawner). Can theoretically run parallel with US1, but US3 tests require a running shell (US1 endpoints).

### Within Each User Story

- Tests can be written alongside implementation (Constitution: "before or alongside")
- Backend before frontend (API must exist for frontend to call)
- Hook before component (component uses hook)
- Component before SessionCard integration (SessionCard renders component)

### Parallel Opportunities

- **Phase 1**: All 3 tasks (T001, T002, T003) are parallel — different files
- **Phase 3**: T006 + T007 (tests) parallel with T008 + T009 (backend endpoints)
- **Phase 3**: T008 + T009 are parallel (routes vs websocket — different files)
- **Phase 5**: T020 parallel with T021 (test vs implementation — different files)

---

## Parallel Example: User Story 1

```text
# Batch 1 — Backend endpoints (parallel, different files):
Task T008: "Add shell REST routes in backend/src/api/routes/sessions.ts"
Task T009: "Add shell WebSocket endpoint in backend/src/api/websocket.ts"

# Batch 2 — Integration (sequential, depends on T008+T009):
Task T010: "Integrate ShellSpawner into SessionManager"

# Batch 3 — Frontend (sequential chain):
Task T011: "Create useShellTerminal hook"
Task T012: "Create ShellTerminal component" (uses T011)
Task T013: "Add shell panel type to usePanel"
Task T014: "Wire shell into SessionCard" (uses T012, T013)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types) — ~15 min
2. Complete Phase 2: ShellSpawner core + tests — core deliverable
3. Complete Phase 3: US1 end-to-end — shell opens, I/O works, panel visible
4. **STOP and VALIDATE**: Open shell, run commands, verify output, close shell
5. Deploy/demo if ready — functional shell terminal in IDE

### Incremental Delivery

1. Setup + Foundational → ShellSpawner ready
2. Add US1 → Working shell terminal (MVP!)
3. Add US2 → Scrollback persists, stopped state UI
4. Add US3 → Shell name displayed, detection verified
5. Polish → Edge cases, logging, CI green

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new npm dependencies — all existing (node-pty, xterm.js, ws)
- No database schema changes — scrollback on disk, PTY state in memory
- ShellSpawner follows PtySpawner patterns but is a separate, simpler class (research.md Decision 1)
- Shell WebSocket is a separate endpoint, not multiplexed (research.md Decision 2)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
