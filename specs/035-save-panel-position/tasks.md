# Tasks: Save Panel Position

**Input**: Design documents from `/specs/035-save-panel-position/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Foundational (Backend Infrastructure)

**Purpose**: Database migration, types, repository methods, and API endpoints needed by US2 and US3. US1 has no backend dependencies but this phase is small enough to complete first.

**CRITICAL**: Must complete before US2/US3 implementation can begin.

- [x] T001 [P] Add `LayoutSnapshot` type definition in `backend/src/models/types.ts` — fields: `sessionId`, `viewMode`, `combinationKey`, `leftWidthPercent`, `rightWidthPercent`, `bottomHeightPercent`, `updatedAt`
- [x] T002 [P] Add `panel_layout_snapshots` table creation in `backend/src/models/db.ts` — composite PK `(session_id, view_mode, combination_key)`, FK to `sessions(id)` with CASCADE delete. See `data-model.md` for full schema
- [x] T003 Add snapshot repository methods in `backend/src/models/repository.ts` — `getLayoutSnapshot(sessionId, viewMode, combinationKey)`, `saveLayoutSnapshot(sessionId, viewMode, combinationKey, widths)`, `deleteLayoutSnapshots(sessionId, viewMode?)`. Follow existing `getPanelState`/`savePanelState` patterns using INSERT OR REPLACE
- [x] T004 Add snapshot API endpoints in `backend/src/api/routes/sessions.ts` — `GET /:id/layout-snapshot` (query params: `combination`, `viewMode`) and `PUT /:id/layout-snapshot` (body: `combinationKey`, `leftWidthPercent`, `rightWidthPercent`, `bottomHeightPercent`; query param: `viewMode`). Validate session exists, validate input types/ranges. See `contracts/api.md` for full contract
- [x] T005 [P] Add layout snapshot API client methods in `frontend/src/services/api.ts` — `layoutSnapshot.get(sessionId, combination, viewMode?)` and `layoutSnapshot.save(sessionId, data, viewMode?)`. Follow existing `panelState.get`/`panelState.save` patterns

### Tests for Foundational Phase (MANDATORY per Constitution Principle I)

- [x] T006 [P] Unit test for snapshot repository methods in `backend/tests/` — test `getLayoutSnapshot` returns null when not found, returns saved data when exists; test `saveLayoutSnapshot` inserts new and updates existing; test `deleteLayoutSnapshots` with and without viewMode filter; test CASCADE delete when session is deleted. Use real SQLite database
- [x] T007 [P] Integration test for snapshot API endpoints in `backend/tests/` — test GET returns 404 for missing snapshot, 200 with data for existing; test PUT creates and updates snapshots; test validation rejects invalid input (missing combinationKey, out-of-range percentages); test session-not-found returns 404. Use supertest with real Express app

**Checkpoint**: Backend infrastructure ready. Frontend can now save/restore layout snapshots via API.

---

## Phase 2: User Story 1 — Terminal Stays in Top Zone When Panels Open (Priority: P1) MVP

**Goal**: Change the auto-positioning default so the terminal stays in `'center'` (top zone, horizontal with panels) when side panels are opened, instead of auto-moving to `'bottom'`.

**Independent Test**: Open any side panel → terminal stays in the top horizontal zone. Close all panels → terminal returns to centered full-space.

### Implementation for User Story 1

- [x] T008 [US1] Modify auto-positioning `useEffect` in `frontend/src/components/SessionCard.tsx` (lines ~553-578) — remove or invert the logic that sets `terminalPosition` to `'bottom'` when `anyPanelOpen && panel.terminalPosition === 'center'`. Terminal should stay `'center'` when panels open. Keep the logic that returns terminal to `'center'` when all panels close. Keep `userOverrideRef` behavior so manual repositioning to bottom is still respected
- [x] T009 [US1] Update the session-load `useEffect` in `frontend/src/components/SessionCard.tsx` (line ~570) — currently sets `userOverrideRef.current = true` when terminal loads as `'bottom'`. This should remain so that sessions where the user intentionally chose bottom continue to work. Verify this still works correctly with the changed auto-positioning logic

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T010 [US1] Unit test for auto-positioning behavior in `frontend/tests/` — test that terminal stays `'center'` when panels open (not moved to `'bottom'`); test that terminal returns to `'center'` when all panels close; test that manual override to `'bottom'` is respected; test that session loading with `terminalPosition === 'bottom'` preserves the bottom position

**Checkpoint**: Terminal stays in top zone when panels open. Core UX change is functional.

---

## Phase 3: User Story 2 — Persist Exact Panel Layout When Toggling (Priority: P1)

**Goal**: Save exact panel widths/heights when panels are toggled and restore them when the same panel is reopened. Layout persists across session re-entries.

**Independent Test**: Resize panels to custom widths → close a panel → reopen it → widths match exactly.

**Note**: US2 and US3 share the same snapshot infrastructure. US2 implements the save/restore mechanism; US3 is satisfied automatically since snapshots are keyed by combination.

### Implementation for User Story 2

- [x] T011 [US2] Add combination key generation helper in `frontend/src/hooks/usePanel.ts` — create a `getCombinationKey(leftPanel, rightPanel)` function that generates a sorted, `+`-joined string from non-`'none'` panel values (e.g., `leftPanel='files'` + `rightPanel='git'` → `'files+git'`; `rightPanel='preview'` only → `'preview'`). Returns empty string when no panels are open
- [x] T012 [US2] Add snapshot save logic to panel toggle handlers in `frontend/src/hooks/usePanel.ts` — when a panel is toggled (via `setLeftPanel` or `setRightPanel`), save the current dimensions (`leftWidthPercent`, `rightWidthPercent`, `bottomHeightPercent`) to the snapshot API using the current combination key before the panel state changes. Use debounced save similar to existing `scheduleSave`
- [x] T013 [US2] Add snapshot restore logic on panel toggle in `frontend/src/hooks/usePanel.ts` — after a panel toggle changes the combination, compute the new combination key and fetch the saved snapshot for that combination. If found, apply the saved `leftWidthPercent`, `rightWidthPercent`, `bottomHeightPercent`. If not found, keep the existing defaults (left: 25%, right: 35%). Skip restore when combination key is empty (no panels open)
- [x] T014 [US2] Wire snapshot save into the existing auto-save `useEffect` in `frontend/src/hooks/usePanel.ts` — when the auto-save fires (on any width/height change), also save the current dimensions to the snapshot API using the current combination key. This ensures resize changes within a combination are captured, not just toggle events

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T015 [P] [US2] Unit test for combination key generation in `frontend/tests/` — test `getCombinationKey('files', 'none')` → `'files'`; test `getCombinationKey('files', 'git')` → `'files+git'` (sorted); test `getCombinationKey('none', 'preview')` → `'preview'`; test `getCombinationKey('none', 'none')` → `''`
- [x] T016 [US2] Integration test for snapshot save/restore cycle in `backend/tests/` — create a session, save a snapshot via PUT, retrieve it via GET, verify values match; toggle combination, save new snapshot, verify both snapshots exist independently; verify session deletion cascades to snapshots

**Checkpoint**: Panel layout is saved and restored exactly when toggling panels. Combined with US1, the terminal stays up and layout is persistent.

---

## Phase 4: User Story 3 — Per-Panel-Combination Layout Memory (Priority: P2)

**Goal**: Different panel combinations independently recall their own saved layouts.

**Independent Test**: Set terminal to 50% with files-only, set to 30% with files+git → switch between combinations → each restores its own widths.

**Note**: This is largely satisfied by US2's implementation (snapshots are keyed by combination). This phase adds verification and any edge case handling.

### Implementation for User Story 3

- [x] T017 [US3] Verify and handle edge cases in `frontend/src/hooks/usePanel.ts` — ensure that opening a never-before-seen combination gracefully falls back to defaults; handle the case where a combination references a panel type from an uninstalled extension (treat as unknown combination, use defaults); ensure zoomed viewMode gets its own independent set of combination snapshots (separate `view_mode` key)

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T018 [US3] Integration test for independent combination memory — save different dimensions for "files" vs "files+git" combinations in the same session; verify switching between them restores the correct dimensions for each; verify a never-saved combination returns defaults; verify grid vs zoomed viewModes maintain independent snapshots

**Checkpoint**: All user stories functional. Different panel combinations independently remember their layouts.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify no regressions, mobile unchanged, all operations still work.

- [x] T019 Verify no regression on existing panel operations — manually test or write integration test: open/close/resize all panel types (files, git, preview, issues, extensions), verify terminal visibility toggle still works, verify existing panel state save/load still works, verify drag-resize handles still function correctly
- [x] T020 Verify mobile layout is unchanged — ensure no changes affect mobile responsive behavior (`hidden md:flex` classes, `MobileActionBar`, `MobileTopBar`). The auto-positioning change should have no effect on mobile since `showToolbar` is false on mobile
- [x] T021 Run full test suite and lint — `npm test && npm run lint`. Fix any failures introduced by this feature
- [x] T022 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: No dependencies on Phase 1 — can run in parallel with foundational
- **US2 (Phase 3)**: Depends on Phase 1 (backend API) completion
- **US3 (Phase 4)**: Depends on Phase 3 (US2 snapshot logic)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — pure frontend change, no backend needed
- **US2 (P1)**: Depends on foundational backend (Phase 1)
- **US3 (P2)**: Depends on US2's snapshot mechanism (Phase 3)

### Within Each User Story

- Implementation before tests (tests verify behavior)
- Core logic before edge cases
- Commit after each task or logical group

### Parallel Opportunities

- **Phase 1**: T001 + T002 + T005 can run in parallel (different files)
- **Phase 1 + Phase 2**: Can run in parallel (US1 has no backend dependency)
- **Phase 1 tests**: T006 + T007 can run in parallel
- **Phase 3 tests**: T015 can run in parallel with implementation

---

## Parallel Example: Phase 1 + US1

```bash
# These can run concurrently since they touch different files:
Agent 1: T001 (types.ts) + T002 (db.ts) + T005 (frontend api.ts)
Agent 2: T008 (SessionCard.tsx) + T009 (SessionCard.tsx)

# Then sequentially:
T003 (repository.ts - depends on T001, T002)
T004 (sessions.ts - depends on T003)
T006 + T007 (backend tests - depend on T003, T004)
T010 (US1 tests - depend on T008, T009)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 2: US1 (T008-T010) — terminal stays up
2. **STOP and VALIDATE**: Open panels, verify terminal stays in top zone
3. This is immediately valuable even without layout persistence

### Incremental Delivery

1. US1 → Terminal stays up (immediate UX improvement)
2. Phase 1 → Backend infrastructure (enables persistence)
3. US2 → Layout saved/restored on toggle (core persistence)
4. US3 → Per-combination memory (polish)
5. Each increment adds value without breaking previous work
