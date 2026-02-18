# Tasks: IDE Panels v7 — Real-Time Git Diff, Ephemeral Comments, Save Button

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v7), spec.md (v7 clarifications), research.md (R25-R26)

**Tests**: Per Constitution Principle I, unit tests and integration tests are MANDATORY.

**Organization**: v7 is an incremental update to an existing feature. No setup or foundational phases needed — all infrastructure exists. Tasks are organized by the 3 changes.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

---

## Phase 1: Background Diff Refresh (FR-030)

**Goal**: Git panel auto-refreshes diff in background when files change — no loading spinner, preserves selected file and scroll position

**Independent Test**: Open Git panel, have agent modify a file, verify diff updates without flashing "Loading diff..."

- [x] T001 Implement background diff refresh in `frontend/src/components/DiffViewer.tsx` — split load effect: initial load shows spinner (diff === null), subsequent refreshKey changes fetch silently and swap diff + parsedFiles in-place without touching loading state

---

## Phase 2: Ephemeral Comments (FR-009, FR-010)

**Goal**: After "Send All" delivers comments, clear them from the diff view and delete from database

**Independent Test**: Add comments on diff lines, click "Send All", verify comments disappear from view and are deleted from DB

- [x] T002 [P] Add `deleteCommentsByIds(ids)` method in `backend/src/models/repository.ts` — batch delete comments by ID array
- [x] T003 [P] Update deliver endpoint in `backend/src/api/routes/sessions.ts` — after successful batch injection, delete delivered comments from DB using deleteCommentsByIds
- [x] T004 Update `handleSendAll` in `frontend/src/components/DiffViewer.tsx` — after deliver succeeds, remove delivered comments from existingComments state (clear from view)

---

## Phase 3: File Editor Save Button (FR-003, FR-020)

**Goal**: Add a visible "Save" button to the FileViewer so users can save without knowing Ctrl+S

**Independent Test**: Edit a file in the editor, verify a save button appears, click it, verify file is saved

- [x] T005 Add clickable save button to FileViewer tab bar in `frontend/src/components/FileViewer.tsx` — show button when file has unsaved changes (isModified), call existing handleSave on click, hide when saved

---

## Phase 4: Tests

- [x] T006 [P] Write frontend tests in `frontend/tests/unit/v7-features.test.ts` — test background refresh behavior (initial load vs. refreshKey change), ephemeral comment clearing after deliver, save button visibility logic
- [x] T007 [P] Update backend integration tests in `backend/tests/integration/ide-panels.test.ts` — test that deliver endpoint deletes comments from DB after successful delivery, test deleteCommentsByIds

---

## Phase 5: Verify & Ship

- [x] T008 Run all tests (npm test) — verify all 119+ tests pass (92+ backend, 27+ frontend)
- [x] T009 Run lint (npm run lint) — verify no lint errors
- [x] T010 Run build (npm run build) — verify TypeScript compiles and Vite builds successfully
- [x] T011 Commit and push to existing PR #3 on branch `002-ide-panels`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Background refresh): No dependencies — can start immediately
- **Phase 2** (Ephemeral comments): T002 and T003 are parallel (different files). T004 depends on T003 (backend must be ready)
- **Phase 3** (Save button): No dependencies — can start immediately, parallel with Phase 1 and 2
- **Phase 4** (Tests): T006 and T007 are parallel. Both depend on Phase 1-3 completion
- **Phase 5** (Verify): Depends on Phase 4

### Parallel Opportunities

```
T001 (DiffViewer background refresh)  ──┐
T002 (repository deleteCommentsByIds)  ──┤── all in parallel
T003 (sessions.ts deliver cleanup)     ──┤
T005 (FileViewer save button)          ──┘
                                          │
T004 (DiffViewer ephemeral clear)      ───┘ (after T003)
                                          │
T006 + T007 (tests, parallel)          ───┘ (after all impl)
                                          │
T008 → T009 → T010 → T011             ───┘ (sequential verify + ship)
```

---

## Implementation Strategy

1. Start T001, T002, T003, T005 in parallel (different files)
2. Complete T004 after T003 (same file as T001 but different section)
3. Write tests (T006, T007) in parallel
4. Verify all tests pass, lint clean, build succeeds
5. Commit and push

**Total tasks**: 11
**Parallel opportunities**: T001/T002/T003/T005 (4 tasks), T006/T007 (2 tasks)
