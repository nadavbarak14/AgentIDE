# Tasks: Session Save & Performance

**Input**: Design documents from `/specs/041-session-save-performance/`
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

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: No new infrastructure needed — all changes modify existing files. This phase only verifies the starting point.

- [x] T001 Verify existing tests pass by running `npm test` and confirm no regressions before starting work
- [x] T002 Read and understand current session deletion flow in `backend/src/hub-entry.ts` (lines 102-116 startup, lines 299-327 event handlers, lines 1054-1071 shutdown)

**Checkpoint**: Codebase understood, tests green — user story implementation can begin

---

## Phase 2: User Story 1 - Sessions Survive Any Shutdown (Priority: P1) MVP

**Goal**: All active sessions are preserved across any hub shutdown (crash, restart, update, SIGKILL). Sessions are never automatically deleted — only cleaned up after 7 days.

**Independent Test**: Start 3 sessions, force-kill the hub, restart, and verify all 3 reappear in UI with scrollback intact.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T003 [P] [US1] Write unit test for `cleanupStaleSessions(maxAgeDays)` in `backend/tests/unit/session-preservation.test.ts` — test: sessions < 7 days old are preserved, sessions > 7 days old with status completed/failed are deleted, active/crashed sessions are never deleted regardless of age
- [x] T004 [P] [US1] Write integration test for session preservation across restart in `backend/tests/integration/api-sessions.test.ts` — test: create sessions, simulate hub restart (call cleanup), verify completed/failed sessions still exist in GET /api/sessions response

### Implementation for User Story 1

- [x] T005 [US1] Add `cleanupStaleSessions(maxAgeDays: number)` method to `backend/src/models/repository.ts` — SQL: `DELETE FROM sessions WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', '-' || maxAgeDays || ' days')`. Also cascade-delete associated panel_states, comments, etc. for cleaned-up sessions.
- [x] T006 [US1] Replace `deleteNonActiveSessions()` call with `cleanupStaleSessions(7)` in `backend/src/hub-entry.ts` startup sequence (around line 110). Update the cleanup log message to reflect age-based cleanup.
- [x] T007 [US1] Remove `repo.deleteSession(sessionId)` call from the `session_completed` event handler in `backend/src/hub-entry.ts` (around lines 299-312). Keep the `repo.completeSession()` status update. Remove the cascade deletion of panel_states/comments/etc from this handler.
- [x] T008 [US1] Remove `repo.deleteSession(sessionId)` call from the `session_failed` event handler in `backend/src/hub-entry.ts` (around lines 314-327). Keep the `repo.failSession()` status update. Remove the cascade deletion from this handler.
- [x] T009 [US1] Update frontend session list filtering in `frontend/src/hooks/useSessionQueue.ts` to properly handle the presence of completed/failed sessions in GET /api/sessions responses. The session grid should continue showing only active and crashed sessions — completed/failed sessions should be filtered out of the visible grid but their existence in the DB should not cause issues.
- [x] T010 [US1] Run the US1 tests (T003, T004) and verify they pass. Run full test suite to confirm no regressions.

**Checkpoint**: Sessions now survive any shutdown. Create sessions, kill hub, restart — sessions preserved. MVP complete.

---

## Phase 3: User Story 4 - Continuous Session State Saving (Priority: P2)

**Goal**: Terminal scrollback and panel layout are continuously saved so that at most 500ms of scrollback and 5 seconds of panel layout can be lost on crash.

**Independent Test**: Interact with a session for 30 seconds, kill hub, restart, verify scrollback and panel layout from within the last few seconds are preserved.

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T011 [P] [US4] Write unit test in `backend/tests/unit/session-crash-recovery.test.ts` verifying that the scrollback flush interval constant is 500ms (not 2000ms)
- [x] T012 [P] [US4] Write frontend unit test in `frontend/tests/unit/hooks/panel-autosave.test.tsx` for the debounced auto-save behavior — test: panel state change triggers save after 5-second debounce, rapid changes reset the timer, visibility change (tab blur) triggers immediate save

### Implementation for User Story 4

- [x] T013 [US4] Reduce scrollback flush interval from 2000ms to 500ms in `backend/src/worker/pty-spawner.ts` — find the `SCROLLBACK_FLUSH_INTERVAL` constant or the `setTimeout`/`setInterval` delay in `scheduleScrollbackWrite()` and change from 2000 to 500
- [x] T014 [US4] Add debounced panel state auto-save to `frontend/src/hooks/usePanel.ts` — add a `useEffect` that watches panel state changes and calls `panelStateApi.save()` after a 5-second debounce. Also add a `visibilitychange` event listener that flushes pending saves immediately when the tab becomes hidden. Ensure the debounce timer is cleaned up on unmount.
- [x] T015 [US4] Run the US4 tests (T011, T012) and verify they pass. Run full test suite to confirm no regressions.

**Checkpoint**: State is continuously saved. Scrollback flushes every 500ms. Panel state auto-saves every 5 seconds.

---

## Phase 4: User Story 2 - Fast Session Switching (Priority: P2)

**Goal**: Session switching completes in under 500ms via panel state caching, switch debouncing, batched API calls, and WebSocket state broadcasts.

**Independent Test**: Create 3 sessions, switch between them rapidly, verify each switch is <500ms and cached re-visits are near-instant.

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T016 [P] [US2] Write frontend unit test in `frontend/tests/unit/components/session-switching.test.tsx` for panel state cache — test: first load fetches from API, second load hits cache (no API call), cache invalidation on save, cache eviction when exceeding 5 entries
- [x] T017 [P] [US2] Write frontend unit test in `frontend/tests/unit/components/session-switching.test.tsx` for switch debouncing — test: rapid switches (within 100ms) only execute the final switch, debounce timer resets on each new switch request
- [x] T018 [P] [US2] Write integration test for GET `/api/sessions/:id/metadata` endpoint in `backend/tests/integration/api-sessions.test.ts` — test: returns combined widgets and extensions in single response, returns empty arrays for session with no widgets/extensions, returns 404 for nonexistent session

### Implementation for User Story 2

- [x] T019 [US2] Add in-memory LRU panel state cache to `frontend/src/hooks/usePanel.ts` — implement a module-level `Map<string, PanelState>` cache (max 5 entries). On `getPanelState`: check cache first, on hit return cached value (skip API call). On `savePanelState`: update cache entry. Evict oldest entry when cache exceeds 5 items.
- [x] T020 [US2] Add 100ms switch debounce to `handleFocusSession()` in `frontend/src/components/Dashboard.tsx` — wrap the session focus handler with a debounce that cancels intermediate switches. Only the final switch target (after 100ms of no new switches) should execute. Use `setTimeout`/`clearTimeout` pattern.
- [x] T021 [US2] Add GET `/api/sessions/:id/metadata` endpoint to `backend/src/api/routes/sessions.ts` — combine the existing widget store lookup and extension/panel_states enabled_extensions data into a single response: `{ widgets: [...], extensions: [...] }`. Register route alongside existing session routes.
- [x] T022 [US2] Replace two separate fetch calls (`/widgets` and `/extensions`) in `frontend/src/components/SessionCard.tsx` (around lines 185-208) with a single fetch to `/api/sessions/${id}/metadata`. Destructure response into widgets and extensions.
- [x] T023 [US2] Add `session_state_changed` WebSocket broadcast to `backend/src/api/websocket.ts` — add a `broadcastSessionStateChanged(sessionId, changes)` function that sends `{ type: 'session_state_changed', sessionId, changes }` to all connected clients. Export it for use in hub-entry.ts.
- [x] T024 [US2] Emit `session_state_changed` broadcasts in `backend/src/hub-entry.ts` — call `broadcastSessionStateChanged()` when session status changes (completed, failed, crashed, activated), when `needsInput` flag changes, and when session title changes. Use existing event handlers as emission points.
- [x] T025 [US2] Update `frontend/src/hooks/useSessionQueue.ts` to listen for `session_state_changed` WebSocket messages — on receiving the message, update the local sessions state immediately (merge changes into the matching session). Increase the polling interval from 1000ms to 5000ms as a fallback.
- [x] T026 [US2] Run the US2 tests (T016, T017, T018) and verify they pass. Run full test suite to confirm no regressions.

**Checkpoint**: Session switching is fast. Cache hits avoid API calls. Rapid switches debounce. State updates arrive via WebSocket.

---

## Phase 5: User Story 3 - Fast New Session Creation (Priority: P3)

**Goal**: New session creation completes in under 2 seconds by eliminating blocking skill file injection.

**Independent Test**: Click "new session," measure time until terminal cursor appears and accepts input — should be <2 seconds.

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T027 [P] [US3] Write unit test in `backend/tests/unit/pty-spawner-skills.test.ts` verifying that skill injection does NOT use synchronous `fs.cpSync` in a loop — verify the spawn method uses `fs.symlinkSync`, `fs.promises.cp`, or other non-blocking approach for skill directory setup

### Implementation for User Story 3

- [x] T028 [US3] Replace synchronous skill file copy loop in `backend/src/worker/pty-spawner.ts` (around lines 197-240 in `spawn()`) with a symlink-based approach — instead of `fs.cpSync(src, dest, {recursive: true})` for each skill directory, use `fs.symlinkSync(src, dest, 'junction')` on Windows or `fs.symlinkSync(src, dest, 'dir')` on Linux. If symlinks fail (permissions), fall back to `fs.promises.cp(src, dest, {recursive: true})` and await the result before proceeding to PTY spawn. Keep the `fs.rmSync` cleanup of the old skills dir.
- [x] T029 [US3] Verify session creation loading indicator works in `frontend/src/components/SessionCard.tsx` — ensure that between clicking "create" and first terminal output, a loading spinner or status text is visible. If missing, add a loading state that shows while `session.status === 'active'` but no terminal output has been received yet.
- [x] T030 [US3] Run the US3 test (T027) and verify it passes. Run full test suite to confirm no regressions.

**Checkpoint**: Session creation is fast. Skill injection no longer blocks for 500-2000ms.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge case handling, and cleanup

- [x] T031 [P] Verify edge case: double crash (hub crashes during recovery) — crashed sessions remain in DB and are recoverable on next restart. Add test case to `backend/tests/unit/session-crash-recovery.test.ts` if not already covered.
- [x] T032 [P] Verify edge case: rapid session switching debounces correctly and only the final target session renders — manual test with 5+ sessions, clicking through them quickly.
- [x] T033 Verify all acceptance scenarios from spec.md by running the full test suite (`npm test`) and confirming all new and existing tests pass
- [x] T034 Run `npm run lint` and fix any linting issues introduced by this feature
- [ ] T035 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — verify starting point
- **US1 (Phase 2)**: Depends on Phase 1 — core fix, MVP
- **US4 (Phase 3)**: Depends on Phase 2 — builds on preserved sessions
- **US2 (Phase 4)**: Can start after Phase 1 (independent of US1/US4 for most tasks), but recommended after Phase 3 for full auto-save integration
- **US3 (Phase 5)**: Can start after Phase 1 (independent of all other stories)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies — can start immediately after Phase 1
- **US4 (P2)**: Soft dependency on US1 (preserved sessions make continuous saving meaningful)
- **US2 (P2)**: Independent of US1/US4 (performance optimization works regardless of session preservation)
- **US3 (P3)**: Fully independent — only touches pty-spawner.ts spawn flow

### Within Each User Story

- Tests MUST be written first and FAIL before implementation
- Backend changes before frontend changes (services before consumers)
- Core logic before optimizations
- Story complete before moving to next priority

### Parallel Opportunities

- T003 and T004 (US1 tests) can run in parallel
- T011 and T012 (US4 tests) can run in parallel
- T016, T017, and T018 (US2 tests) can run in parallel
- T019 and T020 (frontend cache + debounce) can run in parallel with T021 (backend metadata endpoint)
- T023 and T024 (WS broadcast backend) can run in parallel with T019/T020
- US2 Phase 4 and US3 Phase 5 can run in parallel (different files entirely)

---

## Parallel Example: User Story 2

```bash
# Launch all tests for US2 together:
Task T016: "Panel state cache test in frontend/tests/unit/components/session-switching.test.tsx"
Task T017: "Switch debounce test in frontend/tests/unit/components/session-switching.test.tsx"
Task T018: "Metadata endpoint test in backend/tests/integration/api-sessions.test.ts"

# Launch backend + frontend implementation in parallel:
Task T021: "GET /api/sessions/:id/metadata endpoint in backend/src/api/routes/sessions.ts"
Task T019: "Panel state LRU cache in frontend/src/hooks/usePanel.ts"
Task T020: "Switch debounce in frontend/src/components/Dashboard.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (verify starting point)
2. Complete Phase 2: User Story 1 (session preservation)
3. **STOP and VALIDATE**: Kill hub, restart, verify sessions preserved
4. This alone solves the primary user pain (data loss)

### Incremental Delivery

1. US1 → Sessions survive shutdown → **Deploy** (MVP!)
2. US4 → Continuous state saving → **Deploy** (state loss window minimized)
3. US2 → Fast switching → **Deploy** (performance boost)
4. US3 → Fast creation → **Deploy** (creation speed)
5. Each story adds value without breaking previous stories

### Parallel Execution (if multiple agents)

1. Phase 1 (shared)
2. Phase 2: US1 (Agent A) — must complete first
3. Then in parallel:
   - Agent A: US4 (Phase 3) + US2 (Phase 4)
   - Agent B: US3 (Phase 5)
4. Phase 6: Polish (shared)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- No schema migrations needed — all changes are behavioral
- Total files modified: ~10 existing files, ~3 new test files
- No new npm dependencies required
