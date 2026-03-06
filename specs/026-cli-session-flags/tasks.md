# Tasks: CLI Session Flags Redesign

**Input**: Design documents from `/specs/026-cli-session-flags/`
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

**Purpose**: Update shared types and interfaces that all stories depend on

- [x] T001 Update `CreateSessionInput` in `backend/src/models/types.ts`: remove `startFresh` field, add `continueLatest?: boolean` and `resume?: boolean` fields
- [x] T002 Update POST `/api/sessions` handler in `backend/src/api/routes/sessions.ts`: replace `startFresh` destructuring with `continueLatest` and `resume`, pass both to `sessionManager.createSession()` (replace `startFresh: !!startFresh` with `continueLatest: !!continueLatest, resume: !!resume`)

**Checkpoint**: Backend types and API route accept the new fields. No behavior change yet.

---

## Phase 2: User Story 1 — Default New Session (Priority: P1) + User Story 2 — Continue Latest (Priority: P1) 🎯 MVP

**Goal**: Invert the default spawn behavior so sessions start fresh (no `--continue`) by default, and add explicit `continueLatest` support via `--continue`.

**Independent Test**: Create a session with no flags → Claude spawns without `--continue`. Toggle "Continue Latest" → Claude spawns with `--continue`. Retry logic preserved.

### Tests for US1 + US2 (MANDATORY per Constitution Principle I)

- [x] T003 [P] [US1] Update unit tests in `backend/tests/unit/session-manager.test.ts`: change expectations so default spawn (no flags) does NOT include `--continue` in args; add test that `continueLatest=true` passes `--continue`; verify `continueSessions` Map is populated for `continueLatest` path; verify retry logic still works when `--continue` fails within 30s
- [x] T004 [P] [US1] Update integration tests in `backend/tests/integration/session-flags.test.ts`: update POST `/api/sessions` tests to send `continueLatest: true` instead of `startFresh: false`; verify default (no flags) spawns fresh; verify `continueLatest: true` spawns with `--continue`; remove any tests referencing `startFresh`

### Backend Implementation for US1 + US2

- [x] T005 [US1] Rewrite `activateLocalSession()` in `backend/src/services/session-manager.ts`: replace the `if (startFresh || session.worktree)` block with new priority-based logic: (1) `worktree` → `['--worktree', ...userFlags]`, (2) `resume` → `['--resume', ...userFlags]`, (3) `continueLatest` → `['--continue', ...userFlags]` + track in `continueSessions`, (4) default → `[...userFlags]` (fresh). Update `createSession()` to pass `continueLatest` and `resume` to `activateSession()` instead of `startFresh`. Update `activateSession()` signature to accept `continueLatest` and `resume` booleans.
- [x] T006 [US1] Update `activateRemoteSession()` in `backend/src/services/session-manager.ts`: apply same logic for remote sessions — if `continueLatest`, prepend `--continue`; if `resume`, prepend `--resume`; default is fresh (no extra flags). Currently remote always spawns fresh or with `--worktree`.

### Frontend Implementation for US1 + US2

- [x] T007 [P] [US1] Update `SessionQueue.tsx` in `frontend/src/components/SessionQueue.tsx`: (1) Replace `clean-start` entry in `PREDEFINED_FLAGS` with `{ id: 'continue-latest', label: 'Continue Latest', flag: '', description: 'Resume most recent conversation (-c)', warningLevel: 'normal', isPseudo: true }`. (2) Replace `startFresh` state with `continueLatest` state (boolean, default false). (3) Update toggle handler: clicking `continue-latest` toggles `continueLatest`. (4) Update `handleCreate` to pass `continueLatest` instead of `startFresh`. (5) Update the `isActive` check to use `continueLatest` for `continue-latest` id.
- [x] T008 [P] [US1] Update `useSessionQueue.ts` in `frontend/src/hooks/useSessionQueue.ts`: replace `startFresh?: boolean` parameter with `continueLatest?: boolean` and `resume?: boolean` in the `createSession` callback; update the `sessionsApi.create()` call to pass `continueLatest` and `resume` instead of `startFresh`
- [x] T009 [P] [US1] Update `api.ts` in `frontend/src/services/api.ts`: update `create()` method's data type — replace `startFresh?: boolean` with `continueLatest?: boolean` and `resume?: boolean`
- [x] T010 [P] [US1] Update frontend component tests in `frontend/tests/components/SessionQueue.test.tsx`: update tests to reference "Continue Latest" instead of "Clean Start"; verify the toggle sets `continueLatest` state; verify form submission passes `continueLatest` to `onCreateSession`

**Checkpoint**: Default sessions start fresh. "Continue Latest" toggle works. Retry logic preserved. All existing worktree/skip-permissions workflows unchanged.

---

## Phase 3: User Story 3 — Resume with Session Picker (Priority: P2)

**Goal**: Add a "Resume" toggle that spawns Claude with `--resume` (no args) to open Claude's built-in interactive session picker in the terminal.

**Independent Test**: Toggle "Resume" → Claude spawns with `--resume` and shows its interactive picker in the terminal.

### Tests for US3 (MANDATORY per Constitution Principle I)

- [x] T011 [P] [US3] Add unit test in `backend/tests/unit/session-manager.test.ts`: verify that `resume=true` passes `['--resume', ...userFlags]` to ptySpawner.spawn(); verify that `resume=true` does NOT populate `continueSessions` Map (no retry needed)
- [x] T012 [P] [US3] Add integration test in `backend/tests/integration/session-flags.test.ts`: POST `/api/sessions` with `resume: true` → verify session spawns with `--resume` flag; verify `resume` and `continueLatest` precedence (both true → `--resume` wins)

### Frontend Implementation for US3

- [x] T013 [P] [US3] Add "Resume" toggle to `SessionQueue.tsx` in `frontend/src/components/SessionQueue.tsx`: (1) Add `{ id: 'resume', label: 'Resume', flag: '', description: 'Pick a session to resume (--resume)', warningLevel: 'normal', isPseudo: true }` to `PREDEFINED_FLAGS`. (2) Add `resume` state (boolean, default false). (3) Implement mutual exclusion: toggling `resume` sets `continueLatest=false` and vice versa. (4) Update `handleCreate` to pass `resume` to `onCreateSession`. (5) Update `isActive` to check `resume` state for `resume` id.
- [x] T014 [US3] Update `useSessionQueue.ts` and `SessionQueue.tsx` prop types to include `resume` parameter in `onCreateSession` callback signature (if not already done in T008)
- [x] T015 [P] [US3] Add frontend tests in `frontend/tests/components/SessionQueue.test.tsx`: verify "Resume" toggle renders; verify toggling "Resume" deactivates "Continue Latest" and vice versa; verify form submission passes `resume: true`

**Checkpoint**: All three user stories work. Resume opens Claude's picker in terminal. Mutual exclusion between Continue Latest and Resume works.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, validation, and merge

- [x] T016 Run full backend test suite (`cd backend && npm test`) — verify all tests pass
- [x] T017 Run full frontend test suite (`cd frontend && npm test`) — verify all tests pass
- [x] T018 Run linter (`npm run lint`) — fix any issues
- [ ] T019 Manual smoke test: create sessions with each flag combination (default, continue-latest, resume, worktree, skip-permissions) — verify correct Claude args in logs
- [ ] T020 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1+US2)**: Depends on Phase 1 (types must be updated first)
- **Phase 3 (US3)**: Depends on Phase 2 (Resume builds on the same toggle infrastructure)
- **Phase 4 (Polish)**: Depends on all prior phases

### Within Phase 2 (US1 + US2)

- T003, T004 (tests) can run in parallel — different files
- T005, T006 (backend) depend on T001, T002 (types/routes)
- T007, T008, T009, T010 (frontend) can run in parallel — different files
- Backend and frontend tracks can run in parallel after Phase 1

### Within Phase 3 (US3)

- T011, T012 (tests) can run in parallel
- T013, T015 (frontend) can run in parallel — tests + implementation in different files
- T014 depends on T013

### Parallel Opportunities

```text
Phase 1: T001 → T002 (sequential — T002 uses types from T001)

Phase 2 (after Phase 1):
  Backend track:  T003 ─┐
                  T004 ─┤── T005 → T006
                        │
  Frontend track: T007 ─┤
                  T008 ─┤── (all parallel, different files)
                  T009 ─┤
                  T010 ─┘

Phase 3 (after Phase 2):
  T011 ─┐
  T012 ─┤── T013 → T014
  T015 ─┘   (parallel)
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: US1+US2 (T003-T010)
3. **STOP and VALIDATE**: Default creates fresh session, Continue Latest works
4. Deploy/demo if ready — this covers the primary workflow change

### Full Delivery

1. MVP above
2. Add Phase 3: US3 (T011-T015) — Resume toggle
3. Phase 4: Polish and merge (T016-T020)

---

## Notes

- US1 and US2 are combined into one phase because they're two sides of the same coin (invert default + add Continue Latest toggle) — cannot meaningfully test one without the other
- No new files are created — all changes are modifications to existing files
- No new npm dependencies needed
- No database schema changes
- Total: 20 tasks across 4 phases
