# Tasks: Remove Completed Sessions

**Input**: Design documents from `/specs/021-remove-completed-sessions/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Single user story — auto-delete sessions on completion/failure. No new endpoints, no new UI buttons.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Foundational (Repository + Startup Cleanup)

**Purpose**: Add the repository method for bulk cleanup and wire it into server startup

- [x] T001 Add `deleteNonActiveSessions(): number` method to repository in `backend/src/models/repository.ts` — runs `DELETE FROM sessions WHERE status != 'active'`, manually cascades panel_states cleanup (both `session_id` and `session_id + ':zoomed'` patterns), returns count of deleted rows. Follow existing `deleteSession()` pattern for the panel_states cleanup.
- [x] T002 Call `repo.deleteNonActiveSessions()` during server startup in `backend/src/hub-entry.ts` — add the call after the repository is initialized but before the server starts accepting connections. Log the count of cleaned-up sessions at INFO level if > 0.

**Checkpoint**: On server startup, any stale completed/failed sessions from before this feature are cleaned up.

---

## Phase 2: User Story 1 — Auto-Remove Sessions on Completion (Priority: P1) 🎯 MVP

**Goal**: When a session completes or fails, it is automatically deleted along with all associated data. The dashboard only shows active sessions.

**Independent Test**: Create a session, let it complete (or fail), verify it disappears from the dashboard and its database record + scrollback files are gone.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [x] T003 [P] [US1] Integration test for auto-deletion on session completion in `backend/tests/integration/api-sessions.test.ts` — create a session, activate it, complete it via `repo.completeSession()`, then call the auto-delete logic (or simulate via session-manager), verify the session no longer exists in the database and panel_states are gone
- [x] T004 [P] [US1] Integration test for auto-deletion on session failure in `backend/tests/integration/api-sessions.test.ts` — same as T003 but with `failSession()` path
- [x] T005 [P] [US1] Integration test for startup cleanup in `backend/tests/integration/api-sessions.test.ts` — insert sessions with status 'completed' and 'failed' directly, call `repo.deleteNonActiveSessions()`, verify they are deleted and active sessions remain
- [x] T006 [P] [US1] Update any existing tests in `backend/tests/integration/api-sessions.test.ts` that rely on completed/failed sessions persisting after completion — these tests may now fail since sessions are auto-deleted; adjust expectations or restructure test setup accordingly

### Implementation for User Story 1

- [x] T007 [US1] Add auto-delete logic after `completeSession()` in `backend/src/services/session-manager.ts` — after the existing `this.emit('session_completed', ...)` call, add: `this.repo.deleteSession(id)` and `this.shellSpawner?.deleteScrollback(id)`. Wrap file deletion in try/catch and log warning on failure (don't block session removal). Same pattern: add auto-delete after `failSession()` and its `this.emit('session_failed', ...)` call.
- [x] T008 [P] [US1] Modify WebSocket handler in `frontend/src/hooks/useSessionQueue.ts` — when receiving a `session_status` message with `status === 'completed'` or `status === 'failed'`, remove the session from local `sessions` state (filter it out) instead of updating its status field. The session no longer exists on the server after this event.
- [x] T009 [P] [US1] Remove the "Continue" button from `frontend/src/components/SessionCard.tsx` — the button that shows for completed sessions with `claudeSessionId` (around lines 983-992) is now dead code since completed sessions no longer exist. Remove it.
- [x] T010 [P] [US1] Remove the "Completed" section from `frontend/src/components/SessionQueue.tsx` — the sidebar section listing completed sessions (around lines 143-157) is dead code. Remove the completed sessions heading, list, and any related `onDeleteSession` wiring for completed items. Keep the failed sessions section removal too since failed sessions also auto-delete.

**Checkpoint**: Sessions auto-delete on completion/failure. Dashboard only shows active sessions. Startup cleans stale sessions.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and quality assurance

- [x] T011 Run full test suite with `npm test` and fix any failures
- [x] T012 Run linter with `npm run lint` and fix any type errors or lint issues
- [x] T013 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **User Story 1 (Phase 2)**: T007 depends on T001 (repository method exists). T008-T010 are independent of backend tasks.
- **Polish (Phase 3)**: Depends on all US1 tasks being complete

### Within User Story 1

- T003-T006 (tests) can all run in parallel — different test cases, same file
- T007 (backend auto-delete) depends on T001 (deleteNonActiveSessions must exist for reference pattern)
- T008, T009, T010 (frontend) can all run in parallel — different files
- Frontend tasks (T008-T010) are independent of backend tasks (T007)

### Parallel Opportunities

- T003 + T004 + T005 + T006 can all run in parallel (test stubs in same file but independent test cases)
- T008 + T009 + T010 can all run in parallel (different frontend files)
- Backend (T007) and frontend (T008-T010) can proceed in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests in parallel:
Task T003: "Integration test for auto-deletion on completion"
Task T004: "Integration test for auto-deletion on failure"
Task T005: "Integration test for startup cleanup"
Task T006: "Update existing tests for new behavior"

# Launch all frontend tasks in parallel:
Task T008: "Remove session from state on completion/failure WS events"
Task T009: "Remove Continue button from SessionCard"
Task T010: "Remove Completed section from SessionQueue sidebar"
```

---

## Implementation Strategy

### MVP (Single Delivery)

1. Complete Phase 1: Repository method + startup cleanup (T001-T002)
2. Complete Phase 2: Auto-delete logic + frontend updates (T003-T010)
3. **VALIDATE**: Run tests, verify sessions auto-delete on completion
4. Complete Phase 3: Polish + CI + merge (T011-T013)

This is a single-story feature — no incremental delivery needed.

---

## Notes

- [P] tasks = different files, no dependencies
- [US1] = only user story in this feature
- No new files created — all tasks modify existing files
- No schema changes — no migration tasks needed
- No new dependencies — no installation tasks needed
- No new API endpoints — no route tasks needed
- No new UI elements — only removing dead code (Continue button, Completed sidebar section)
- The session-manager already has access to `repo` and `shellSpawner` — no wiring needed
- Existing `deleteSession()` handles cascade (panel_states manual + FK cascades for artifacts, comments, etc.)
- Commit after each task or logical group
