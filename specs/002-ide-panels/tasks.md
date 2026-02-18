# Tasks: IDE Panels v3 — Panel Positioning, Git Sidebar, Batch Comments

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v3), spec.md (post-clarification v3), research.md (R12-R14)

**Context**: This is a v3 update to the existing IDE Panels implementation. The v1+v2 code is committed and all 100 tests pass. Only frontend rendering changes are needed based on user clarifications:
1. Files panel opens on LEFT of terminal (like IDE), Git/Preview on RIGHT
2. Git changed files shown in vertical sidebar (not horizontal top bar)
3. Batch commenting — "Add Comment" saves drafts, "Submit All" sends batch
4. Multi-line comments — already implemented, no changes needed

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), existing tests (100 across 10+ files) must continue to pass. No new testable logic is being added (rendering-only changes).

**Organization**: Tasks are grouped by affected user story. US3 (Preview) and US4 (Persistence) are unchanged and have no tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — Files Panel on LEFT (Priority: P1)

**Goal**: When the files panel is open, it appears on the LEFT side of the terminal (like a traditional IDE file explorer). Git and Preview panels remain on the RIGHT side.

**Independent Test**: Open a session in 1-view mode. Click "Files." Verify the file tree + editor panel appears on the LEFT of the terminal. Click "Git." Verify the Git panel appears on the RIGHT of the terminal.

- [x] T001 [US1] Modify the main content layout in `frontend/src/components/SessionCard.tsx`: when `panel.activePanel === 'files'`, render the side panel BEFORE the terminal in the flex container (panel on left, terminal on right). When `panel.activePanel === 'git'` or `'preview'`, keep the current order (terminal on left, panel on right). The drag handle stays between them in both cases. Adjust the `width` style so the terminal gets `(100 - panelWidthPercent)%` when it's on the right (files mode) and `(100 - panelWidthPercent)%` when it's on the left (git/preview mode — current behavior). The panel always gets `panelWidthPercent%`.

**Checkpoint**: Files panel opens on LEFT. Git/Preview panels open on RIGHT. All existing tests still pass.

---

## Phase 2: User Story 2 — Git Vertical Sidebar + Batch Comments (Priority: P2)

**Goal**: The Git panel shows changed files in a vertical sidebar (left side, ~180px) instead of horizontal tabs. Users can add multiple comments as drafts, then submit all at once.

**Independent Test**: Start a session where files are modified. Click "Git." Verify changed files are listed in a vertical sidebar on the left of the diff viewer. Click a file — verify the diff renders on the right while the sidebar stays visible. Click "+" on a line, type a comment, click "Add Comment" — verify a yellow "Draft" badge appears. Add another comment on a different line. Click "Submit All" — verify both comments are sent.

- [x] T002 [US2] Restructure the file list in `frontend/src/components/DiffViewer.tsx` from horizontal tabs to a vertical sidebar: replace the `border-b` horizontal file button container with a flex layout where the file list is a vertical sidebar on the left (`w-[180px] min-w-[140px] flex-shrink-0 border-r border-gray-700 overflow-y-auto`) and the diff content area is on the right (`flex-1 min-w-0`). Each file entry in the sidebar should be a vertical block (`w-full text-left px-2 py-1.5`) showing: change type badge (M/A/D/R with colored background), truncated filename, and +/- counts on a second line. The selected file should have `bg-gray-900 text-white border-l-2 border-l-blue-400` styling. The sidebar header should show "Files" in small caps.
- [x] T003 [US2] Add draft comment state management to `frontend/src/components/DiffViewer.tsx`: add a `draftComments` state array to the `DiffViewer` component (type: `Array<{ id: string; filePath: string; startLine: number; endLine: number; codeSnippet: string; commentText: string }>`). Generate IDs with `crypto.randomUUID()`. Change the comment submit flow: rename the "Submit" button to "Add Comment" and instead of calling `commentsApi.create()`, push the comment to `draftComments` state. Clear the comment input and selection after adding. Draft comments should persist across file switches (they're in the parent DiffViewer state, not in SideBySideDiff).
- [x] T004 [US2] Render draft comments inline in `frontend/src/components/DiffViewer.tsx`: pass `draftComments` filtered by `filePath` to the `SideBySideDiff` component. Render draft comments the same way as existing comments (full-width row below the anchor line) but with a yellow "Draft" badge (`bg-yellow-500/20 text-yellow-400`) instead of the green "Sent" or yellow "Pending" badges. Include a small "×" button on each draft to allow removing it from the drafts array.
- [x] T005 [US2] Add "Submit All" button to the DiffViewer header in `frontend/src/components/DiffViewer.tsx`: when `draftComments.length > 0`, show a "Submit All ({count})" button in the header bar next to the file stats. Style: `bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600`. On click, iterate through all `draftComments`, call `commentsApi.create()` for each, move successfully created comments to `existingComments`, and clear `draftComments`. Show a loading state while submitting. If some comments fail, keep them in `draftComments` and show the successful ones as existing.

**Checkpoint**: Git panel shows vertical file sidebar. Batch commenting works (Add Comment → Draft → Submit All). All tests pass.

---

## Phase 3: Polish & Validation

**Purpose**: Ensure all changes work together, tests pass, lint clean.

- [x] T006 Run `npm test` across both workspaces. Fix any test failures.
- [x] T007 Run `npm run lint` across both workspaces. Fix any lint errors (unused imports, unused variables from removed code paths).
- [x] T008 Manually verify the v3 changes: (1) files panel opens on LEFT of terminal, (2) git panel shows vertical file sidebar on left, (3) "Add Comment" saves as draft with yellow badge, (4) "Submit All" sends all drafts at once. Update tasks.md to mark all tasks complete.
- [x] T009 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1 — Panel positioning)**: No dependencies — start immediately
- **Phase 2 (US2 — Git sidebar + batch comments)**: No dependency on Phase 1 — can run in parallel
- **Phase 3 (Polish)**: Depends on Phase 1 + Phase 2 completion

### User Story Dependencies

- **US1 (Panel positioning)**: Independent — only touches SessionCard.tsx
- **US2 (Git sidebar + batch comments)**: Independent — only touches DiffViewer.tsx

### Within Each User Story

- T001 is a single task (SessionCard.tsx)
- T002 (sidebar layout) before T003 (draft state) — T003 needs the new layout context
- T003 (draft state) before T004 (render drafts) — T004 depends on draft data
- T004 (render drafts) before T005 (submit all) — T005 completes the flow

### Parallel Opportunities

- **T001 + T002**: Panel positioning and git sidebar touch different files — can run in parallel
- **T003-T005**: These all modify DiffViewer.tsx — must be sequential

---

## Parallel Example: Phases 1 + 2 Start

```bash
# These can run in parallel (different files):
Task T001: "Modify panel positioning in frontend/src/components/SessionCard.tsx"
Task T002: "Restructure file list to vertical sidebar in frontend/src/components/DiffViewer.tsx"

# Then sequentially in DiffViewer.tsx:
Task T003: "Add draft comment state management"
Task T004: "Render draft comments inline with Draft badge"
Task T005: "Add Submit All button to header"
```

---

## Implementation Strategy

### Approach: Focused v3 Delta

This is NOT a full rebuild. The v1+v2 implementation (100 tests, all backend, all frontend infrastructure, diff parser, side-by-side rendering) remains unchanged. Only 2 files are modified:

1. **`frontend/src/components/SessionCard.tsx`** — MODIFY: conditional panel positioning (left/right)
2. **`frontend/src/components/DiffViewer.tsx`** — MODIFY: vertical file sidebar + batch commenting

### Execution Plan

1. Modify panel positioning in SessionCard.tsx (T001) — US1 complete
2. Restructure file list to vertical sidebar (T002) — layout done
3. Add draft comment state management (T003) — comment flow changed
4. Render draft comments inline (T004) — drafts visible
5. Add "Submit All" button (T005) — US2 complete
6. Polish (T006-T009) — validate, lint, CI, merge

---

## Notes

- All existing v1+v2 tests (100 tests across 10+ files) must continue to pass
- No backend changes — only frontend rendering updates
- No new files — all changes are modifications to existing components
- The diff parser (`utils/diff-parser.ts`) is unchanged
- The comment API endpoints are unchanged — batch submission just calls the existing `POST /api/sessions/:id/comments` endpoint multiple times
- Draft comments are ephemeral React state — not persisted to backend or localStorage
