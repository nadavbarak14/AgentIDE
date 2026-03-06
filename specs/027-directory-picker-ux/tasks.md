# Tasks: Directory Picker UX Improvements

**Input**: Design documents from `/specs/027-directory-picker-ux/`
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

## Phase 1: Setup (No user story changes yet)

**Purpose**: No setup phase needed — this feature modifies existing components only. No new dependencies, no schema changes, no new files to scaffold.

**Checkpoint**: Proceed directly to user story phases.

---

## Phase 2: User Story 1 — Visual Directory Browser (Priority: P1) 🎯 MVP

**Goal**: Replace the text-input-only DirectoryPicker with a visual folder browser that lets users click through directories, navigate via breadcrumbs, and confirm selection with a "Select this folder" button, while keeping a synced path bar for power users.

**Independent Test**: Open browse mode, click through 2-3 folder levels, verify breadcrumbs update, click "Select this folder" to confirm. Verify path bar stays synced when clicking folders and when typing paths.

### Tests for US1 (MANDATORY per Constitution Principle I)

- [x] T001 [P] [US1] Create component tests in `frontend/tests/components/DirectoryPicker.test.tsx`: test that clicking "Browse" renders the folder browser with home directory contents; test clicking a folder navigates into it and updates breadcrumbs; test clicking back button navigates to parent; test clicking a breadcrumb segment navigates to that location; test clicking "Select this folder" calls onChange with the current path and closes the browser; test that typing a path in the path bar updates the browser location; test empty directory shows "No subdirectories" message; test error state shows error message; mock the `directories.list` API call (external API boundary — mock permitted)

### Implementation for US1

- [x] T002 [US1] Rewrite `DirectoryPicker` in `frontend/src/components/DirectoryPicker.tsx`: (1) Keep the existing text input as a synced path bar at the top. (2) Below the input, add the visual browser UI that renders when `showDropdown` is true (reusing the existing dropdown trigger). The browser contains: a breadcrumb trail showing path segments (each clickable), a back button (disabled at root), a scrollable list of folder rows (each clickable to navigate into), and a "Select this folder" button at the bottom. (3) Add state: `currentPath` (string, defaults to home), `pathHistory` (string[] for back navigation), `browserError` (string|null). (4) Reuse the existing `listDirectories` callback for fetching — call it with `currentPath` as `dirPath` and no `query` param. (5) On folder click: push `currentPath` to `pathHistory`, set `currentPath` to clicked folder's path, fetch new contents. (6) On back click: pop `pathHistory`, set `currentPath` to popped value, fetch. (7) On breadcrumb click: truncate `pathHistory` to the breadcrumb index, set `currentPath`, fetch. (8) On path bar change: debounce, then set `currentPath` to typed value and fetch (reset `pathHistory`). (9) On "Select this folder" click: call `onChange(currentPath)` and close the browser. (10) Handle `exists: false` responses by showing an error message. (11) Handle empty `entries` by showing "No subdirectories" with "Select this folder" still available. (12) Style with existing Tailwind classes matching the project's dark theme (bg-gray-800/900, text-gray-300, border-gray-600, hover:bg-gray-700).

**Checkpoint**: Visual directory browser works — users can click through folders, navigate with breadcrumbs/back, type paths, and select a folder. Existing autocomplete-only behavior is replaced.

---

## Phase 3: User Story 2 — Better Path Visibility (Priority: P1)

**Goal**: Improve path display in project rows so users can distinguish projects with similar directory names. Replace the aggressive `abbreviatePath` (last 2 segments only) with smart `~`-based abbreviation showing more context.

**Independent Test**: Create projects with paths like `~/work/api` and `~/personal/api` — verify both are distinguishable in the project list without hovering.

### Tests for US2 (MANDATORY per Constitution Principle I)

- [x] T003 [P] [US2] Add path display tests in `frontend/tests/components/ProjectPicker.test.tsx`: test that `abbreviatePath` replaces home directory prefix with `~`; test short paths (e.g., `~/myproject`) are shown in full; test similar paths (e.g., `~/work/api` and `~/personal/api`) are distinguishable; test long paths truncate from the left with `...` prefix preserving last 3 segments; test each project row has a `title` attribute with the full path; mock the `projects.list` API call

### Implementation for US2

- [x] T004 [US2] Update `abbreviatePath` function and project rows in `frontend/src/components/ProjectPicker.tsx`: (1) Rewrite `abbreviatePath` to: detect and replace home directory prefix (`/home/<user>/` or similar) with `~/`; keep all segments if 4 or fewer; if more than 4 segments, show `.../<last 3 segments>`; never truncate to fewer than 3 trailing segments. (2) Add `title={project.directoryPath}` attribute to the path display `<p>` element in `ProjectRow` for full-path tooltip on hover. (3) To detect home dir prefix: use a constant derived from the first project's path or pass it from the backend (the directories API already returns resolved home paths). A simpler approach: check if path starts with `/home/` and extract the prefix up to the third `/`.

**Checkpoint**: Project rows show readable, distinguishable paths. Full paths available via tooltip.

---

## Phase 4: User Story 3 — Prominent Browse Button (Priority: P2)

**Goal**: Move the "Browse for directory..." button to the top of the ProjectPicker (above the project list) and make it visually prominent with a folder icon and solid border.

**Independent Test**: Verify the browse button appears above the project list, has a folder icon, and is visually distinct.

### Tests for US3 (MANDATORY per Constitution Principle I)

- [x] T005 [P] [US3] Add browse button tests in `frontend/tests/components/ProjectPicker.test.tsx` (append to file from T003): test that the browse button appears before the project list in DOM order; test the button contains a folder icon element; test clicking it switches to the DirectoryPicker browse view

### Implementation for US3

- [x] T006 [US3] Update browse button in `frontend/src/components/ProjectPicker.tsx`: (1) Move the "Browse for directory..." button from after the project list to before it. (2) Change styling from dashed border (`border-dashed border-gray-600`) to solid border with folder icon: `border border-gray-600 bg-gray-900 hover:bg-gray-800 hover:border-gray-500`. (3) Add a folder icon before the text — use an inline SVG folder icon or the unicode folder character (📁). (4) Update text to "Browse folders..." for clarity. (5) When no projects exist, make the button the primary CTA with slightly more prominent styling (e.g., `border-blue-600/50 text-blue-400`).

**Checkpoint**: Browse button is prominently placed at the top with clear visual treatment.

---

## Phase 5: User Story 4 — Improved Selected State and Project List (Priority: P2)

**Goal**: Replace the plain "x" clear button with a proper close icon, add tooltip to selected directory display, and increase project list max-height from 160px to 240px.

**Independent Test**: Select a directory, verify clear button has a proper icon with hover state. Create 8 projects, verify 6+ are visible without scrolling.

### Tests for US4 (MANDATORY per Constitution Principle I)

- [x] T007 [P] [US4] Add selected state and list height tests in `frontend/tests/components/ProjectPicker.test.tsx` (append to file from T003/T005): test that the clear button contains an SVG icon (not plain "x" text); test the selected directory display has a `title` attribute with full path; test the project list container has `max-h-60` class (240px)

### Implementation for US4

- [x] T008 [US4] Update selected state and list height in `frontend/src/components/ProjectPicker.tsx`: (1) Replace the clear button content from plain `x` text to an inline SVG close icon (a small X/cross SVG, ~14px). Add hover state: `hover:text-white hover:bg-gray-700 rounded p-0.5`. (2) Add `title={selectedDirectory}` to the selected directory `<span>` for full-path tooltip. (3) Change project list `max-h-40` to `max-h-60` (160px → 240px). (4) Verify the Create Session button remains visible on standard viewports (768px+) with the increased list height.

**Checkpoint**: Clear button has proper icon, paths have tooltips, project list shows more items.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and merge

- [x] T009 Run full frontend test suite (`cd frontend && npx vitest run`) — verify all tests pass including new DirectoryPicker and ProjectPicker tests
- [x] T010 Run linter (`npm run lint`) — fix any issues
- [ ] T011 Manual smoke test: create sessions using the visual browser (navigate folders, use breadcrumbs, type paths, select folder), verify with both local and remote workers
- [ ] T012 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (US1 — Visual Browser)**: No dependencies — start immediately. This is the MVP.
- **Phase 3 (US2 — Path Visibility)**: Independent of US1 — can run in parallel (different function and different component section)
- **Phase 4 (US3 — Browse Button)**: Independent of US1/US2 — can run in parallel (different section of ProjectPicker)
- **Phase 5 (US4 — Selected State)**: Independent of US1/US2/US3 — can run in parallel (different section of ProjectPicker)
- **Phase 6 (Polish)**: Depends on all prior phases

### Within Each User Story

- Tests can be written in parallel with implementation (different files)
- T001 (tests) and T002 (implementation) can run in parallel

### Parallel Opportunities

```text
Phase 2-5 (all user stories can run in parallel — different files/functions):

  US1: T001 ─┐
              ├── (DirectoryPicker.tsx + DirectoryPicker.test.tsx)
        T002 ─┘

  US2: T003 ─┐
              ├── (ProjectPicker.tsx abbreviatePath + ProjectPicker.test.tsx)
        T004 ─┘

  US3: T005 ─┐
              ├── (ProjectPicker.tsx browse button + ProjectPicker.test.tsx)
        T006 ─┘

  US4: T007 ─┐
              ├── (ProjectPicker.tsx selected state + ProjectPicker.test.tsx)
        T008 ─┘

Phase 6 (sequential — after all stories):
  T009 → T010 → T011 → T012
```

**Note**: US2, US3, US4 all modify `ProjectPicker.tsx` but in different sections. If implementing sequentially, do them in order (T004 → T006 → T008) to avoid merge conflicts. Tests (T003, T005, T007) all append to the same test file — write them sequentially.

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 2: US1 — Visual Directory Browser (T001-T002)
2. **STOP and VALIDATE**: Browse folders visually, navigate with breadcrumbs, select a folder
3. This alone delivers the core value — visual browsing replaces text-only input

### Full Delivery

1. MVP above
2. Add Phase 3: US2 — Better Path Visibility (T003-T004)
3. Add Phase 4: US3 — Prominent Browse Button (T005-T006)
4. Add Phase 5: US4 — Selected State + List Height (T007-T008)
5. Phase 6: Polish and merge (T009-T012)

---

## Notes

- All changes are frontend-only — no backend modifications needed
- No new npm dependencies — pure React + Tailwind
- Existing `directories.list()` API is reused for the visual browser
- The DirectoryPicker.tsx is the primary rewrite (US1); ProjectPicker.tsx gets incremental improvements (US2-US4)
- Total: 12 tasks across 6 phases
