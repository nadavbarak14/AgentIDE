# Tasks: Adyx Frontend Branding

**Input**: Design documents from `/specs/018-adyx-branding/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), existing branding tests MUST be updated to validate "Adyx". No new test files needed — the existing `session-grid.test.ts` already covers branding assertions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Consistent Adyx Branding Across All Pages (Priority: P1) 🎯 MVP

**Goal**: Replace all user-visible instances of "Multy" with "Adyx" in the frontend and backend.

**Independent Test**: Open the application in a browser. Verify the tab title says "Adyx" and the dashboard header says "Adyx". Confirm no "Multy" text is visible anywhere.

### Implementation for User Story 1

- [x] T001 [P] [US1] Replace `<title>Multy</title>` with `<title>Adyx</title>` in `frontend/index.html` (line 6)
- [x] T002 [P] [US1] Replace `Multy` with `Adyx` in the dashboard `<h1>` heading in `frontend/src/pages/Dashboard.tsx` (line 530)
- [x] T003 [P] [US1] Replace `'Multy Worker started, listening for commands on stdin'` with `'Adyx Worker started, listening for commands on stdin'` in `backend/src/worker-entry.ts` (line 15)

**Checkpoint**: All user-visible "Multy" references are now "Adyx". The app displays the correct brand name.

---

## Phase 2: User Story 2 - Internal Naming Consistency (Priority: P2)

**Goal**: Update branding tests to assert "Adyx" and verify no regressions to internal `c3-` prefixed identifiers.

**Independent Test**: Run `npm test` — all branding tests pass with "Adyx" assertions. Search source for "Multy" in `frontend/src/` and `backend/src/` — zero results.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [x] T004 [US2] Update branding test suite in `frontend/tests/unit/session-grid.test.ts` (lines 365-385): replace all "Multy" references with "Adyx" — update describe block title, all `h1Text`, `title`, `hubLog`, and `workerLog` assertions to expect "Adyx" instead of "Multy"

**Checkpoint**: All tests pass. No "Multy" remains in source files (excluding specs and worktrees).

---

## Phase 3: Polish & Verification

**Purpose**: Final verification that the rebrand is complete and nothing is broken.

- [x] T005 Run full test suite with `npm test` to verify zero regressions
- [x] T006 Verify no "Multy" remains in source: search `frontend/src/`, `frontend/index.html`, and `backend/src/` for the string "Multy" — expect zero results
- [x] T007 Verify `c3-` prefixed identifiers are untouched: confirm localStorage keys, custom events, and bridge object still use `c3` prefix
- [ ] T008 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Depends on Phase 1 completion (tests must match updated source)
- **Phase 3 (Polish)**: Depends on Phase 2 completion

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies. All 3 tasks (T001, T002, T003) can run in parallel — they touch different files.
- **User Story 2 (P2)**: Depends on US1 — test assertions must match the updated source strings.

### Parallel Opportunities

- T001, T002, T003 can all run in parallel (different files, no dependencies)
- T005, T006, T007 can all run in parallel (read-only verification tasks)

---

## Parallel Example: User Story 1

```bash
# All three tasks touch different files — launch in parallel:
Task: "Replace title in frontend/index.html"
Task: "Replace heading in frontend/src/pages/Dashboard.tsx"
Task: "Replace log message in backend/src/worker-entry.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Replace "Multy" → "Adyx" in all 3 source files (T001-T003, parallel)
2. **STOP and VALIDATE**: Open app, verify branding visually
3. Proceed to Phase 2: Update tests (T004)
4. Phase 3: Run full verification (T005-T008)

### Summary

| Metric | Value |
|--------|-------|
| Total tasks | 8 |
| US1 tasks | 3 |
| US2 tasks | 1 |
| Polish tasks | 4 |
| Parallel opportunities | T001-T003 (Phase 1), T005-T007 (Phase 3) |
| Files modified | 4 |
| Estimated lines changed | ~10 |

---

## Notes

- All T001-T003 are simple string replacements in existing files — no new files created
- T004 updates existing test assertions, not new tests
- The `frontend/dist/` directory is a build artifact and will be regenerated — do not modify directly
- Internal `c3-` prefixed code identifiers and "Claude" references MUST remain unchanged
