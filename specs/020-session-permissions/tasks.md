# Tasks: Session Permission Flags

**Input**: Design documents from `/specs/020-session-permissions/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and type definitions shared across all user stories

- [X] T001 Add `flags` column migration to sessions table in `backend/src/models/db.ts` — add `ALTER TABLE sessions ADD COLUMN flags TEXT NOT NULL DEFAULT ''` following the existing migration pattern (see `worktree` and `side` column migrations as reference)
- [X] T002 Add `flags: string` field to `Session` interface and `flags?: string` to `CreateSessionInput` interface in `backend/src/models/types.ts`
- [X] T003 Update `createSession()` in `backend/src/models/repository.ts` to include `flags` in the INSERT statement (store `input.flags || ''`), and update `mapSession()` helper to include `flags` in the returned Session object from SELECT queries

**Checkpoint**: Database schema updated, types defined, repository layer handles flags. All existing tests should still pass.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend plumbing that MUST be complete before user stories can work end-to-end

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extract `flags` from request body in `POST /api/sessions` handler in `backend/src/api/routes/sessions.ts` — add `const { flags } = req.body` alongside existing destructuring, pass `flags: typeof flags === 'string' ? flags : ''` to `sessionManager.createSession()` input
- [X] T005 Implement flag parsing utility function `parseFlags(flagString: string): string[]` in `backend/src/services/session-manager.ts` — tokenize the flags string respecting quoted values (e.g., `--allowedTools "Read,Grep"` → `['--allowedTools', 'Read,Grep']`), deduplicate by flag name (keep last occurrence), return array of string tokens
- [X] T006 Update `activateLocalSession()` in `backend/src/services/session-manager.ts` to merge parsed user flags into the args array passed to `ptySpawner.spawn()` — after constructing system args (`--worktree` / `--continue`), append parsed user flags from `session.flags`. Add log line including flags value.
- [X] T007 Update `activateRemoteSession()` in `backend/src/services/session-manager.ts` to merge parsed user flags into the args array passed to `bridge.spawn()` — same logic as T006 but for the remote spawn path

**Checkpoint**: Backend fully supports creating sessions with flags, storing them, and passing them to the Claude process. Frontend not yet updated.

---

## Phase 3: User Story 1 — Write CLI Flags When Starting a Session (Priority: P1) 🎯 MVP

**Goal**: Users can type CLI flags into a text field on the session creation form, and those flags are passed to the spawned Claude process.

**Independent Test**: Type `--dangerously-skip-permissions` into the flags field, start a session, and verify the Claude process was spawned with that flag.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [X] T008 [P] [US1] Write unit tests for `parseFlags()` in `backend/tests/unit/parse-flags.test.ts` — test cases: empty string → `[]`, single flag → `['--flag']`, multiple flags → correct array, quoted values preserved (e.g., `--allowedTools "Read,Grep"`), duplicate flags deduplicated, leading/trailing whitespace handled
- [X] T009 [P] [US1] Write integration test for session creation with flags in `backend/tests/integration/session-flags.test.ts` — use supertest to POST `/api/sessions` with `flags: "--dangerously-skip-permissions"`, verify response includes `flags` field, verify GET `/api/sessions/:id` returns flags, verify session created without flags returns `flags: ""`

### Implementation for User Story 1

- [X] T010 [US1] Add flags text input field to the session creation form in `frontend/src/components/SessionQueue.tsx` — add a new `flags` state variable (string, default `''`), render a text input with placeholder "CLI flags (e.g., --dangerously-skip-permissions)" inline below the title/directory fields, pass `flags` to `onCreateSession`
- [X] T011 [US1] Update `onCreateSession` prop type in `frontend/src/components/SessionQueue.tsx` to accept `flags` parameter — update the interface to `(workingDirectory: string, title: string, targetWorker?: string | null, worktree?: boolean, startFresh?: boolean, flags?: string) => Promise<unknown>`
- [X] T012 [US1] Update `createSession` in `frontend/src/hooks/useSessionQueue.ts` to accept and pass `flags` parameter through to `sessionsApi.create()`
- [X] T013 [US1] Update `sessions.create()` in `frontend/src/services/api.ts` to include `flags` in the request payload type and the `Session` response type
- [X] T014 [US1] Update `Dashboard.tsx` (`frontend/src/pages/Dashboard.tsx`) to pass the updated `onCreateSession` handler that includes the `flags` parameter — ensure the `createSession` callback from `useSessionQueue` is passed through correctly

**Checkpoint**: User Story 1 fully functional — users can type flags and they are passed to the Claude process. Existing worktree/startFresh checkboxes still work as before.

---

## Phase 4: User Story 2 — Choose Flags from a Predefined List (Priority: P2)

**Goal**: Predefined flag chips (Skip Permissions, Worktree, Clean Start) replace the existing separate checkboxes and provide one-click flag selection alongside the free-form input.

**Independent Test**: Click the "Skip Permissions" chip, verify the flag appears in the text field and is passed to the Claude process. Click "Worktree" chip, verify session launches in worktree mode.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [X] T015 [P] [US2] Write component test for predefined flag chips in `frontend/tests/components/SessionQueue.test.tsx` — test: clicking "Skip Permissions" chip adds `--dangerously-skip-permissions` to flags, clicking "Worktree" chip sets worktree boolean to true, clicking "Clean Start" chip sets startFresh boolean to true, clicking an active chip deselects it (toggle), combining chip selection with manual text input works correctly

### Implementation for User Story 2

- [X] T016 [US2] Define the `PREDEFINED_FLAGS` constant array in `frontend/src/components/SessionQueue.tsx` — create `PredefinedFlag` type and static array with three entries: `{ id: 'skip-permissions', label: 'Skip Permissions', flag: '--dangerously-skip-permissions', description: 'Skip all permission prompts', warningLevel: 'caution', isPseudo: false }`, `{ id: 'worktree', label: 'Worktree', flag: '--worktree', description: 'Use isolated git branch', warningLevel: 'normal', isPseudo: true }`, `{ id: 'clean-start', label: 'Clean Start', flag: '', description: 'Start fresh conversation', warningLevel: 'normal', isPseudo: true }`
- [X] T017 [US2] Render predefined flag chips as clickable buttons in `frontend/src/components/SessionQueue.tsx` — display chips inline above/beside the flags text input, each chip shows its label, active chips are visually highlighted (e.g., blue bg), caution chips show amber/yellow when active. Clicking a chip toggles its state. For pseudo-flags (worktree, clean-start), toggle the existing `worktree`/`startFresh` boolean state. For real flags (skip-permissions), append/remove from the `flags` text input string.
- [X] T018 [US2] Remove the existing separate worktree and startFresh checkbox elements in `frontend/src/components/SessionQueue.tsx` — the predefined chips now handle these. Remove the two `<label>` blocks containing the worktree checkbox ("Use worktree (isolated git branch)") and the startFresh checkbox ("Start fresh (don't continue last conversation)"). The `worktree` and `startFresh` state variables remain — they are now controlled by the chips.
- [X] T019 [US2] Add inline warning message below the flags field in `frontend/src/components/SessionQueue.tsx` — when the skip-permissions chip is active OR the flags text contains `--dangerously-skip-permissions`, show a yellow/amber warning: "⚠ All tool actions will execute without permission prompts." Style with Tailwind (text-amber-400, bg-amber-900/20, rounded, px-2, py-1, text-xs).

**Checkpoint**: User Story 2 fully functional — unified flags interface with chips replacing old checkboxes. Warning displays for dangerous flags. All existing session creation behavior preserved.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T020 [P] Add structured logging for flags in session creation and activation — ensure `session-manager.ts` log lines for session creation and activation include the `flags` value (Principle VIII)
- [X] T021 Verify all existing tests pass with the new `flags` column — run `npm test` and fix any test failures caused by the schema change or type updates
- [X] T022 [P] Verify UI consistency — check that the chip styling matches the existing Tailwind design language, spacing is consistent with other form elements, and the warning message uses existing color patterns (Principle III)
- [X] T023 Run full CI validation — `npm test && npm run lint` (Principle V)
- [ ] T024 Push branch, wait for CI green, create PR for rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — builds on the flags text input
- **Polish (Phase 5)**: Depends on both user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — delivers the flags text input and end-to-end backend support
- **User Story 2 (P2)**: Depends on US1 — adds predefined chips on top of the flags input and replaces existing checkboxes

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Backend changes before frontend changes (within foundational phase)
- Type definitions before repository before API routes before session manager
- Frontend: API client → hook → component

### Parallel Opportunities

- T001, T002, T003 are sequential (type deps)
- T004, T005 can run in parallel (different files)
- T008, T009 can run in parallel (different test files)
- T010, T013 can run in parallel initially (different files), but T011/T012/T014 depend on them
- T015 can run in parallel with US1 implementation (test-first)
- T016, T019 are sequential within US2 (same file)
- T020, T022 can run in parallel (different concerns)

---

## Parallel Example: User Story 1

```bash
# Launch tests for User Story 1 together:
Task: "Write unit tests for parseFlags() in backend/tests/unit/parse-flags.test.ts"
Task: "Write integration test for session creation with flags in backend/tests/integration/session-flags.test.ts"

# Then launch frontend changes (some parallel):
Task: "Update sessions.create() in frontend/src/services/api.ts" (T013)
Task: "Add flags text input in frontend/src/components/SessionQueue.tsx" (T010)
# Then sequential:
Task: "Update onCreateSession prop type" (T011, depends on T010)
Task: "Update useSessionQueue.ts" (T012, depends on T013)
Task: "Update Dashboard.tsx" (T014, depends on T011/T012)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T007)
3. Complete Phase 3: User Story 1 (T008–T014)
4. **STOP and VALIDATE**: Type a flag, start a session, verify it works
5. Deploy/demo if ready — users can already type flags manually

### Incremental Delivery

1. Setup + Foundational → Backend fully supports flags
2. Add User Story 1 → Text input works end-to-end → Deploy (MVP!)
3. Add User Story 2 → Predefined chips + unified UI → Deploy (Full feature)
4. Polish → Logging, CI, final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 depends on US1 (chips build on the text input)
- The `worktree` and `startFresh` state variables remain in the component — chips control them instead of checkboxes
- No new npm dependencies needed
- Total: 24 tasks across 5 phases
