# Tasks: Session Persistence & Crash Recovery

**Input**: Design documents from `/specs/023-session-persistence/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing) and explicit user request, unit tests and system tests are MANDATORY. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema migration, type changes, and repository methods needed by all stories

- [x] T001 [P] Add `crashed` to SessionStatus type union in `backend/src/models/types.ts`
- [x] T002 [P] Add database migration for `crash_recovered_at` column on sessions table and update CHECK constraint to allow `crashed` status in `backend/src/models/db.ts`
- [x] T003 Add hub status methods (`getHubStatus`, `setHubStatus`) and crashed session methods (`markSessionsCrashed`, `setCrashRecoveredAt`) to `backend/src/models/repository.ts`
- [x] T004 Update `deleteNonActiveSessions` to not delete `crashed` sessions, and update `deleteSession` to also handle `crashed` status (cascade scrollback cleanup) in `backend/src/models/repository.ts`

---

## Phase 2: Foundational (Crash Detection & Shutdown Flag)

**Purpose**: Core crash detection mechanism that MUST be complete before any user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement crash detection on startup in `backend/src/hub-entry.ts`: check `hub_status` setting — if `running`, previous exit was a crash; always set `hub_status = 'running'` before processing sessions
- [x] T006 Update clean shutdown handler (SIGINT/SIGTERM) in `backend/src/hub-entry.ts`: set `hub_status = 'stopped'` as the first action before existing cleanup (kill PTYs, delete sessions)
- [x] T007 Update `resumeSessions` in `backend/src/services/session-manager.ts`: when crash detected, mark all `active` sessions as `crashed` instead of `completed`; when clean shutdown detected, preserve existing behavior (mark completed + auto-delete)

**Checkpoint**: Crash detection foundation ready — the hub can now distinguish crash from clean shutdown and preserve active sessions on crash

---

## Phase 3: User Story 1 — Remote Session Survives Hub Crash (Priority: P1) MVP

**Goal**: Remote Claude processes continue running via tmux on the remote worker. After hub crash and restart, the hub reconnects SSH tunnels, finds still-running tmux sessions, and reattaches to them.

**Independent Test**: Start a remote session, kill the hub process, restart it, and verify the session reconnects with continued output.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T008 [P] [US1] Unit test for tmux command generation (spawn, has-session, attach, kill-session commands) in `backend/tests/unit/tmux-commands.test.ts`
- [x] T009 [P] [US1] Unit test for remote session crash recovery logic (reattach success, tmux dead, worker unreachable) in `backend/tests/unit/session-crash-recovery.test.ts`
- [x] T010 [P] [US1] Integration test for GET /api/sessions listing crashed remote sessions and DELETE /api/sessions/:id dismissing them in `backend/tests/integration/api-crashed-sessions.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Wrap remote Claude processes in tmux: change spawn command in `backend/src/worker/remote-pty-bridge.ts` from direct `claude` invocation to `tmux new-session -d -s c3-<shortId> '...' && tmux attach -t c3-<shortId>`
- [x] T012 [US1] Add `reattachSession(sessionId, workerId)` method to `backend/src/worker/remote-pty-bridge.ts`: check `tmux has-session`, if alive attach via new SSH shell, resume data/scrollback handlers
- [x] T013 [US1] Update `kill` method in `backend/src/worker/remote-pty-bridge.ts` to also kill the tmux session (`tmux kill-session -t c3-<shortId>`) after killing the channel
- [x] T014 [US1] Implement remote session recovery flow in `backend/src/services/session-manager.ts`: for each crashed remote session, attempt `remotePtyBridge.reattachSession()`, on success mark as `active`, on failure keep as `crashed`
- [x] T015 [US1] Orchestrate remote recovery in `backend/src/hub-entry.ts`: after worker SSH tunnels reconnect, call session manager recovery for remote crashed sessions; handle worker-unreachable gracefully
- [x] T016 [US1] Add tmux availability check to worker health check in `backend/src/services/worker-manager.ts`: execute `tmux -V` during health check, log warning if tmux is not installed
- [x] T017 [US1] Broadcast `session_recovering` WebSocket message during recovery attempt and `session_status` with updated status after recovery completes in `backend/src/api/websocket.ts`

**Checkpoint**: Remote sessions survive hub crashes via tmux. After restart, hub reattaches to still-running remote Claude processes.

---

## Phase 4: User Story 2 — Local Session Scrollback Recovery After Crash (Priority: P2)

**Goal**: After hub crash, local sessions appear as "crashed" in the dashboard with full scrollback history viewable. Users can review what happened and dismiss sessions.

**Independent Test**: Start a local session, kill the hub process, restart it, and verify the session appears with scrollback history intact.

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T018 [P] [US2] Unit test for scrollback preservation on crash (scrollback files not deleted for crashed sessions) in `backend/tests/unit/crash-detection.test.ts`
- [x] T019 [P] [US2] Integration test for GET /api/sessions/:id/scrollback endpoint in `backend/tests/integration/scrollback-api.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Add GET /api/sessions/:id/scrollback endpoint in `backend/src/api/routes/sessions.ts`: load scrollback file via `ptySpawner.loadScrollback()`, return content with truncation flag
- [x] T021 [US2] Update GET /api/sessions to return both `active` and `crashed` sessions by default (no status filter) in `backend/src/api/routes/sessions.ts`
- [x] T022 [US2] Update SessionCard.tsx in `frontend/src/components/SessionCard.tsx`: add amber/orange status color for `crashed`, show "Dismiss" button instead of "Kill", display "Crashed" badge
- [x] T023 [US2] Update SessionGrid.tsx in `frontend/src/components/SessionGrid.tsx`: include `crashed` sessions in the display grid alongside `active` sessions
- [x] T024 [US2] Update useSessionQueue hook in `frontend/src/hooks/useSessionQueue.ts`: include `crashed` sessions in polling results, add `dismissSession` method that calls DELETE endpoint
- [x] T025 [US2] Add read-only scrollback terminal view for crashed sessions: when user clicks a crashed session, fetch scrollback via GET /api/sessions/:id/scrollback and render in terminal view in `frontend/src/components/SessionCard.tsx`

**Checkpoint**: Local crashed sessions are visible in the dashboard with scrollback history. Users can review and dismiss them.

---

## Phase 5: User Story 3 — Clean Shutdown Preserves No Sessions (Priority: P2)

**Goal**: Normal shutdown (Ctrl+C / SIGTERM) continues to auto-delete sessions. No crashed sessions appear after a clean restart. Feature 021 behavior is fully preserved.

**Independent Test**: Start sessions, stop the hub normally, restart, and verify no old sessions appear.

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T026 [P] [US3] Unit test for clean shutdown flag: verify `hub_status` is set to `stopped` in settings table during graceful shutdown in `backend/tests/unit/crash-detection.test.ts`
- [x] T027 [P] [US3] Integration test for clean shutdown: create active sessions, simulate clean shutdown (set hub_status=stopped, run cleanup), restart, verify zero crashed sessions in `backend/tests/integration/api-crashed-sessions.test.ts`

### Implementation for User Story 3

- [x] T028 [US3] Verify and adjust the startup flow in `backend/src/hub-entry.ts`: on clean shutdown detection (hub_status=stopped), call existing `deleteNonActiveSessions()` which removes any leftover completed/failed sessions; ensure no `crashed` sessions exist after clean startup
- [x] T029 [US3] Ensure `resumeSessions` in `backend/src/services/session-manager.ts` only marks active sessions as `crashed` when crash is detected (pass `wasCrash` boolean), and marks them as `completed` + auto-deletes on clean shutdown (existing behavior)

**Checkpoint**: Clean shutdown behavior is identical to pre-feature behavior. No regression in feature 021 auto-delete.

---

## Phase 6: User Story 4 — Comprehensive Test Coverage (Priority: P3)

**Goal**: Thorough automated tests covering all recovery scenarios, edge cases, and the distinction between crash vs. clean shutdown.

**Independent Test**: Run the test suite and confirm all persistence/recovery scenarios pass.

### System Tests

- [x] T030 [US4] System test for full crash recovery lifecycle in `backend/tests/system/crash-recovery.test.ts`: simulate crash (set hub_status=running, create active local+remote sessions in DB, create scrollback files), run recovery logic, verify local sessions marked crashed with scrollback, remote sessions attempt reattachment
- [x] T031 [US4] System test for clean shutdown lifecycle in `backend/tests/system/crash-recovery.test.ts`: create active sessions, run clean shutdown logic, verify hub_status=stopped, verify all sessions deleted, restart and verify empty dashboard

### Edge Case Tests

- [x] T032 [P] [US4] Unit test for edge cases in `backend/tests/unit/session-crash-recovery.test.ts`: corrupt/missing scrollback file handling, session with no PID (mid-creation crash), rapid consecutive restarts, hub_status missing from settings (first run)
- [x] T033 [P] [US4] Unit test for remote recovery edge cases in `backend/tests/unit/session-crash-recovery.test.ts`: worker unreachable during recovery, tmux session dead on recovery, multiple remote workers recovered simultaneously

**Checkpoint**: All crash recovery scenarios have automated test coverage. Tests are deterministic (no actual process killing).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, logging, and validation

- [x] T034 Add structured logging for crash detection, recovery attempts, tmux operations, and session status transitions in `backend/src/services/session-manager.ts` and `backend/src/hub-entry.ts` (Constitution Principle VIII)
- [x] T035 Update existing release tests to account for `crashed` session status where applicable in `release-tests/e2e/session-lifecycle.test.ts`
- [x] T036 Run full test suite (`npm test && npm run lint`) and fix any failures
- [ ] T037 Push branch, wait for CI green, create PR for merge to main (Constitution Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational; independent of US2/US3
- **User Story 2 (Phase 4)**: Depends on Foundational; independent of US1/US3
- **User Story 3 (Phase 5)**: Depends on Foundational; validates behavior from Phase 2
- **User Story 4 (Phase 6)**: Depends on US1, US2, US3 completion (tests exercise all code paths)
- **Polish (Phase 7)**: Depends on all stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — No dependencies on other stories
- **US2 (P2)**: Can start after Foundational — No dependencies on other stories (shares API changes with US1 but modifies different code paths)
- **US3 (P2)**: Can start after Foundational — Tests verify behavior implemented in Phase 2
- **US4 (P3)**: Depends on US1, US2, US3 — system tests exercise full recovery paths

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Repository/model changes before service logic
- Service logic before API endpoints
- Backend before frontend
- Core implementation before integration

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files: types.ts vs db.ts)
- **Phase 3**: T008, T009, T010 can all run in parallel (different test files)
- **Phase 4**: T018, T019 can run in parallel (different test files)
- **Phase 5**: T026, T027 can run in parallel (different test categories)
- **Phase 6**: T032, T033 can run in parallel (different test scenarios, same file but addable in parallel)
- **US1 and US2**: Can be worked on simultaneously after Foundational (different files: remote-pty-bridge.ts vs routes/sessions.ts, SessionCard.tsx)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together:
Task T008: "Unit test for tmux command generation in backend/tests/unit/tmux-commands.test.ts"
Task T009: "Unit test for remote session crash recovery in backend/tests/unit/session-crash-recovery.test.ts"
Task T010: "Integration test for crashed sessions API in backend/tests/integration/api-crashed-sessions.test.ts"

# After tests written, implementation (sequential due to file dependencies):
Task T011: "Wrap remote Claude in tmux in backend/src/worker/remote-pty-bridge.ts"
Task T012: "Add reattach method in backend/src/worker/remote-pty-bridge.ts" (depends on T011)
Task T013: "Update kill to clean tmux in backend/src/worker/remote-pty-bridge.ts" (depends on T011)
Task T014: "Recovery flow in backend/src/services/session-manager.ts" (depends on T012)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types, migration, repository)
2. Complete Phase 2: Foundational (crash detection, shutdown flag)
3. Complete Phase 3: User Story 1 (remote tmux + recovery)
4. **STOP and VALIDATE**: Kill hub with active remote session, restart, verify reattachment
5. Deploy/demo if ready — remote sessions now survive crashes

### Incremental Delivery

1. Setup + Foundational → Crash detection works
2. Add US1 (Remote tmux) → Test independently → Deploy (MVP — remote recovery works)
3. Add US2 (Local scrollback) → Test independently → Deploy (local crash history viewable)
4. Add US3 (Clean shutdown) → Test independently → Deploy (no regression verified)
5. Add US4 (Comprehensive tests) → Full test coverage → Deploy (production-ready)
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests written before implementation (TDD per constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- tmux is required on remote workers only — local sessions use scrollback preservation
