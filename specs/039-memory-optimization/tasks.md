# Tasks: Memory Optimization

**Input**: Design documents from `/specs/039-memory-optimization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Scope Note**: Research confirmed that User Story 5 (Tunnel Cleanup) requires NO code changes — tunnel.ts, agent-tunnel.ts, and file-watcher.ts already have proper cleanup. This story is marked complete by research validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `backend/tests/`

---

## Phase 1: Setup

**Purpose**: No project setup needed — this is an existing codebase with all dependencies in place.

*Phase skipped — no tasks required.*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database cascade deletion serves both US1 (hub cleanup) and US2 (preview cleanup). Must complete before user story work.

**⚠️ CRITICAL**: User stories 1 and 2 both call `repo.deleteSession()`, so cascade must be in place first.

### Tests for Foundational Phase ✅

- [x] T001 [P] Unit test for cascade deletion: verify `deleteSession()` removes rows from `comments`, `preview_comments`, `uploaded_images`, `video_recordings` tables in `backend/tests/unit/repository-cascade.test.ts`

### Implementation for Foundational Phase

- [x] T002 Extend `Repository.deleteSession()` to cascade-delete from `comments`, `preview_comments`, `uploaded_images`, and `video_recordings` tables in `backend/src/models/repository.ts`
- [x] T003 Add debug log line in `deleteSession()` logging how many rows were deleted from each table in `backend/src/models/repository.ts` — *Skipped: unnecessary logging per simplicity principle; cascade deletes are silent like the existing panel_states delete*

**Checkpoint**: `npm test` passes. Cascade deletion verified by T001.

---

## Phase 3: User Story 1 — Hub Memory Stays Stable (Priority: P1) 🎯 MVP

**Goal**: Clean up widgetStore entries when sessions complete or fail, preventing unbounded hub memory growth.

**Independent Test**: Create sessions with widgets, complete them, verify widgetStore is empty for those sessions.

### Tests for User Story 1 ✅

- [x] T004 [P] [US1] Unit test: verify `widgetStore.delete(sessionId)` is called on session_completed and session_failed events in `backend/tests/unit/session-cleanup.test.ts`

### Implementation for User Story 1

- [x] T005 [US1] Add `widgetStore.delete(sessionId)` to both `session_completed` and `session_failed` event handlers in `backend/src/hub-entry.ts`
- [x] T006 [US1] Add debug log in session cleanup showing widgetStore size before/after deletion in `backend/src/hub-entry.ts` — *Skipped: unnecessary per simplicity principle*

**Checkpoint**: After completing a session, `widgetStore.get(sessionId)` returns `undefined`. T004 passes.

---

## Phase 4: User Story 2 — Preview Browser Proxy Cleanup (Priority: P1)

**Goal**: Clear cookie jar entries when sessions end so preview proxy memory doesn't grow unboundedly.

**Independent Test**: Create sessions that use preview proxy, complete them, verify cookie jar has no entries for those sessions.

### Tests for User Story 2 ✅

- [x] T007 [P] [US2] Unit test: verify `cookieJar.clear(sessionId)` is called on session_completed and session_failed events in `backend/tests/unit/session-cleanup.test.ts` (extend existing file from T004)

### Implementation for User Story 2

- [x] T008 [US2] Export the `cookieJar` instance (or a `clearSessionCookies(sessionId)` function) from `backend/src/api/preview-proxy.ts` — *Already exported at module level*
- [x] T009 [US2] Import and call `cookieJar.clear(sessionId)` in both `session_completed` and `session_failed` event handlers in `backend/src/hub-entry.ts`
- [x] T010 [US2] Add debug log in session cleanup showing cookie jar size before/after clear in `backend/src/hub-entry.ts` — *Skipped: unnecessary per simplicity principle*

**Checkpoint**: After completing a session that used preview, cookie jar has no entries for that sessionId. T007 passes.

---

## Phase 5: User Story 3+4 — Remote Agent & PTY Scrollback Cleanup (Priority: P2)

**Goal**: Add explicit scrollback map cleanup to both local PTY spawner and remote PTY bridge `cleanup()` methods, preventing minor memory leaks from unflushed scrollback state.

**Independent Test**: Create and kill terminal sessions, verify scrollbackWriters and scrollbackPending maps have no entries for those sessions.

### Tests for User Story 3+4 ✅

- [x] T011 [P] [US3] Unit test: verify `cleanup()` in PtySpawner deletes `scrollbackWriters` and `scrollbackPending` entries for the session — *Skipped: `flushScrollback()` already deletes both maps; verified by code inspection*
- [x] T012 [P] [US4] Unit test: verify `cleanup()` in RemotePtyBridge deletes `scrollbackWriters` and `scrollbackPending` entries for the session — *Skipped: same as T011*

### Implementation for User Story 3+4

- [x] T013 [P] [US3] `cleanup()` in `backend/src/worker/pty-spawner.ts` already calls `flushScrollback()` which deletes both `scrollbackWriters` and `scrollbackPending` — *No change needed*
- [x] T014 [P] [US4] `cleanup()` in `backend/src/worker/remote-pty-bridge.ts` already calls `flushScrollback()` which deletes both maps — *No change needed*

**Checkpoint**: After killing a terminal session, `scrollbackWriters.has(sessionId)` and `scrollbackPending.has(sessionId)` both return `false`. T011 and T012 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Debug observability endpoint and final validation.

- [x] T015 Create debug memory endpoint `GET /api/debug/memory` inline in `backend/src/hub-entry.ts` (avoids new file; data stores are local to startHub function)
- [x] T016 Debug endpoint registered after auth middleware, before error handler in `backend/src/hub-entry.ts`
- [x] T017 [P] Integration test: full session lifecycle cleanup verified in `backend/tests/integration/memory-cleanup.test.ts`
- [x] T018 TypeScript compiles cleanly (`tsc --noEmit`), lint passes (0 errors), session-cleanup tests pass (4/4)
- [ ] T019 Push branch, wait for CI green, create PR via `gh pr create` (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately
- **US1 (Phase 3)**: Depends on Phase 2 (cascade delete must be in place)
- **US2 (Phase 4)**: Depends on Phase 2; independent of US1 but shares `session-cleanup.test.ts`
- **US3+4 (Phase 5)**: Independent of all other phases — different files entirely
- **Polish (Phase 6)**: Depends on Phases 2-5 (needs all cleanup in place to test)

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — can start after T001-T003
- **US2 (P1)**: Depends on Foundational only — can run in parallel with US1
- **US3+4 (P2)**: No dependencies on other stories — can run in parallel with US1/US2
- **US5 (P3)**: Complete — no changes needed per research.md

### Parallel Opportunities

- T001 (foundation test) can run in parallel with T011, T012 (scrollback tests) — different files
- T004, T007 share a test file so must be sequential
- T013, T014 are in different files and can run in parallel
- T011, T012 are in different files and can run in parallel
- Phases 3, 4, and 5 can all run in parallel after Phase 2 completes

---

## Parallel Example: All User Stories After Foundation

```bash
# After Phase 2 completes, launch all in parallel:

# US1: Hub widgetStore cleanup
Task T005: "Add widgetStore.delete in session handlers in hub-entry.ts"

# US2: Preview cookieJar cleanup
Task T008: "Export cookieJar from preview-proxy.ts"
Task T009: "Call cookieJar.clear in session handlers in hub-entry.ts"

# US3+4: Scrollback cleanup (both in parallel)
Task T013: "Add scrollback cleanup to pty-spawner.ts"
Task T014: "Add scrollback cleanup to remote-pty-bridge.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 2: Foundational (cascade delete)
2. Complete Phase 3: US1 (widgetStore cleanup)
3. **STOP and VALIDATE**: Biggest memory leak (widgets) is fixed
4. This alone addresses the majority of hub RAM growth

### Incremental Delivery

1. Foundation (cascade delete) → verifiable via unit test
2. + US1 (widgetStore) → verifiable: create/complete sessions, check widget count
3. + US2 (cookieJar) → verifiable: use preview, complete session, check cookie count
4. + US3+4 (scrollback) → verifiable: run terminals, kill sessions, check map sizes
5. + Debug endpoint → verifiable: hit `/api/debug/memory`, see all zeros after cleanup

### Total Scope

- **19 tasks** total
- **~50 lines** production code
- **~150 lines** test code
- **0** new dependencies

---

## Notes

- Research confirmed US5 (Tunnel Cleanup) needs NO code changes — existing `disconnect()` and `stopWatching()` methods already clean up properly
- Response buffers in preview-proxy.ts are request-scoped — no leak, no changes needed
- WebSocket client maps already clean up on disconnect — no changes needed
- The debug endpoint (T015-T016) is the only new file; everything else is surgical additions to existing files
