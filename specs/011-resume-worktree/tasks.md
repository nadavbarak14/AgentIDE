# Tasks: Session Resume & Worktree Isolation

**Input**: Design documents from `/specs/011-resume-worktree/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend: TypeScript 5.7, Express 4, better-sqlite3, node-pty
- Frontend: React 18, Tailwind CSS 3, Vite 6

---

## Phase 1: Foundational (Schema & Type Changes)

**Purpose**: Modify the core Session type and database schema that both user stories depend on. MUST complete before any story work.

- [x] T001 [P] Add `worktree` boolean field to `Session` interface and `worktree?: boolean` to `CreateSessionInput` in `backend/src/models/types.ts`
- [x] T002 [P] Add SQLite migration `ALTER TABLE sessions ADD COLUMN worktree INTEGER NOT NULL DEFAULT 0` in the `migrate()` function in `backend/src/models/db.ts`
- [x] T003 Add `worktree: Boolean(row.worktree)` to `rowToSession()` helper and include `worktree` in the `createSession()` INSERT statement in `backend/src/models/repository.ts`
- [x] T004 Add `worktree: boolean` to the frontend `Session` interface and add `worktree?: boolean` to the `sessions.create` data parameter in `frontend/src/services/api.ts`

**Checkpoint**: Session type has `worktree` field end-to-end (DB → backend type → API response → frontend type). Existing sessions default to `worktree = false`.

---

## Phase 2: User Story 1 — Resume Specific Claude Conversation (Priority: P1)

**Goal**: When continuing a session that has a stored `claudeSessionId`, use `claude --resume <claudeSessionId>` instead of `claude -c` to resume the exact conversation.

**Independent Test**: Create two sessions in the same directory, complete both, then continue each — each should resume its own conversation (verify by checking spawn args in logs).

### Implementation for User Story 1

- [x] T005 [US1] Add `spawnResume(sessionId: string, workingDirectory: string, claudeSessionId: string): PtyProcess` method to `PtySpawner` class that calls `this.spawn(sessionId, workingDirectory, ['--resume', claudeSessionId])` in `backend/src/worker/pty-spawner.ts`
- [x] T006 [US1] Modify `activateSession()` in `SessionManager` to call `ptySpawner.spawnResume(sessionId, workingDirectory, claudeSessionId)` when `session.continuationCount > 0 && session.claudeSessionId` is truthy (replacing the current `spawnContinue` call) in `backend/src/services/session-manager.ts`

**Checkpoint**: Continuing a session with a stored `claudeSessionId` spawns `claude --resume <id>`. Sessions without a `claudeSessionId` still fall back to `claude -c` (existing `spawnContinue` path from the else branch). Auto-suspended sessions re-queued with `continuationCount++` also use `--resume`.

---

## Phase 3: User Story 2 — Worktree Toggle (Priority: P2)

**Goal**: Add a worktree checkbox to the session creation form. When enabled, spawn Claude Code with `--worktree` for git worktree isolation.

**Independent Test**: Create a session with worktree enabled, verify `--worktree` appears in spawn args (logs). Create another without it, verify no `--worktree` flag.

### Implementation for User Story 2

- [x] T007 [US2] Modify `createSession()` in `SessionManager` to accept `worktree` boolean and pass it through to `repo.createSession(input)` (the `input` already carries worktree via `CreateSessionInput`) in `backend/src/services/session-manager.ts`
- [x] T008 [US2] Modify `activateSession()` in `SessionManager` to prepend `'--worktree'` to spawn args when `session.worktree === true` AND `session.continuationCount === 0` (only on initial spawn, NOT on continuation) in `backend/src/services/session-manager.ts`
- [x] T009 [US2] Accept `worktree` boolean from request body in `POST /api/sessions` route and pass it through to `sessionManager.createSession()` in `backend/src/api/routes/sessions.ts`
- [x] T010 [US2] Add `worktree` state (default false), a checkbox mirroring the `startFresh` pattern, and pass it through the `onCreateSession` callback in `frontend/src/components/SessionQueue.tsx`
- [x] T011 [US2] Update the `SessionQueueProps.onCreateSession` callback type to include `worktree?: boolean` parameter and update the parent component that passes `onCreateSession` to forward `worktree` to `sessions.create()` in the relevant parent component

**Checkpoint**: Worktree checkbox appears in session creation form. Sessions created with worktree=true spawn `claude --worktree`. Continuing a worktree session uses `--resume` (US1) without re-adding `--worktree`.

---

## Phase 4: Polish & Validation

**Purpose**: End-to-end validation, build verification, and merge readiness

- [x] T012 Run `npm run build` in both `backend/` and `frontend/` to verify TypeScript compilation succeeds with all changes
- [x] T013 Run `npm test` to verify all existing tests still pass (no regressions)
- [x] T014 Run `npm run lint` to verify code style compliance across modified files
- [x] T015 Verify the 5 integration scenarios from `specs/011-resume-worktree/quickstart.md` are covered by the implementation logic

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: Depends on Phase 1 completion (needs Session type)
- **US2 (Phase 3)**: Depends on Phase 1 completion (needs worktree column + type)
- **US1 and US2 are independent** of each other — can run in parallel after Phase 1
- **Polish (Phase 4)**: Depends on Phase 2 + Phase 3 completion

### User Story Dependencies

- **User Story 1 (P1)**: Only modifies `pty-spawner.ts` and `session-manager.ts`. No dependency on US2.
- **User Story 2 (P2)**: Modifies `session-manager.ts` (different methods than US1), `sessions.ts` route, `SessionQueue.tsx`, and `api.ts`. No dependency on US1.

### Within Each Phase

- Phase 1: T001 and T002 are parallel [P]. T003 depends on T001. T004 depends on T001.
- Phase 2 (US1): T005 then T006 (sequential — T006 calls the method T005 creates)
- Phase 3 (US2): T007→T008 (same file, sequential), T009 (can parallel after T007), T010→T011 (frontend, sequential)

### Parallel Opportunities

```bash
# Phase 1 — parallel type + schema changes:
Task T001: "Add worktree to types.ts"
Task T002: "Add migration in db.ts"

# After Phase 1 — US1 and US2 can run in parallel:
Task T005-T006: "US1: Resume specific conversation"
Task T007-T011: "US2: Worktree toggle"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational schema + types
2. Complete Phase 2: US1 — Resume with `--resume <id>`
3. **STOP and VALIDATE**: Verify resume targets the correct conversation
4. This alone fixes the cross-contamination bug — highest value

### Incremental Delivery

1. Phase 1 (Foundational) → Schema ready
2. Phase 2 (US1: Resume) → Test independently → Correct conversation resume working
3. Phase 3 (US2: Worktree) → Test independently → Worktree isolation available
4. Phase 4 (Polish) → Build + test green → Ready for PR

---

## Notes

- **8 files modified** across backend (6) and frontend (2)
- **No new files** created — all changes are modifications to existing files
- **Backward compatible** — existing sessions have `worktree = 0` (default)
- The `--worktree` flag is only added on initial spawn (`continuationCount === 0`), never on continuation
- The `--resume <id>` flag replaces `-c` only when `claudeSessionId` is available; otherwise `-c` fallback
