# Tasks: IDE Panels v2 — Clarification Update

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v2), spec.md (post-clarification), research.md (R9-R11)

**Context**: This is a v2 update to the existing IDE Panels implementation. The v1 code is committed and all 90 tests pass. Only frontend rendering changes are needed based on user clarifications:
1. Side-by-side two-column diff (was unified)
2. Files panel: tree + editor side-by-side (was tree-or-editor swap)
3. Gutter "+" icon for immediate inline comments (was select-then-click)

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests are MANDATORY. The side-by-side diff parser is the primary new logic requiring tests.

**Organization**: Tasks are grouped by affected user story. US3 (Preview) and US4 (Persistence) are unchanged and have no tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Side-by-Side Diff Parser

**Purpose**: Rewrite the diff parser to produce paired left/right line arrays for side-by-side rendering. This is foundational because US2 depends on it.

**⚠️ CRITICAL**: US2 (Git diff UI) cannot begin until the parser rewrite is complete.

- [x] T001 Write unit tests for side-by-side diff parser: test context lines populate both sides, additions fill right only (left null), deletions fill left only (right null), line numbers track old/new independently, multi-hunk files align correctly, empty files produce empty pairs — in `frontend/tests/unit/diff-parser.test.ts`
- [x] T002 Extract `parseDiff()` from `frontend/src/components/DiffViewer.tsx` into a standalone module `frontend/src/utils/diff-parser.ts`. Rewrite it to return `SideBySideLine[]` where each entry is `{ left: DiffLine | null, right: DiffLine | null }`. Track old-file line numbers (from `@@` hunk header `-oldStart`) and new-file line numbers (from `+newStart`) separately. Context lines increment both counters and populate both sides. Added lines (`+`) increment only the new counter, set `left: null`. Deleted lines (`-`) increment only the old counter, set `right: null`. Export types `SideBySideLine`, `DiffLine`, `ParsedFile` from the module.

**Checkpoint**: `npm test --workspace=frontend` passes with new parser tests green.

---

## Phase 2: User Story 1 — Files Panel Tree+Editor Side-by-Side (Priority: P1)

**Goal**: When the files panel is open, show the file tree and file editor side-by-side within the panel (tree on left ~30%, editor on right ~70%). The tree remains visible at all times for navigation.

**Independent Test**: Open a session in 1-view mode. Click "Files." Verify the file tree appears on the left and an editor area on the right. Click a file — verify it opens in the editor while the tree stays visible. Click another file — verify it opens in a new tab in the editor.

- [x] T003 [US1] Modify the files panel section in `frontend/src/components/SessionCard.tsx`: replace the current conditional (`fileTabs.length > 0 ? FileViewer : FileTree`) with a flex container that renders both `FileTree` (left, `w-[200px] min-w-[150px] flex-shrink-0 border-r border-gray-700`) and `FileViewer` (right, `flex-1 min-w-0`) side-by-side. When no file tabs exist, render a placeholder in the right area: centered text "Select a file to view" in gray. Always render `FileTree` regardless of tab count.
- [x] T004 [US1] Remove the `onClose` prop from `FileViewer` usage in `SessionCard.tsx` (no longer needed since tree is always visible). Clean up the "close all tabs to show tree" logic that was previously in the `onClose` handler.

**Checkpoint**: Files panel shows tree+editor side-by-side. All existing tests still pass.

---

## Phase 3: User Story 2 — Side-by-Side Diff + Gutter Comments (Priority: P2)

**Goal**: The Git panel shows a two-column side-by-side diff (old on left, new on right, lines aligned vertically). Each line has a "+" icon in the gutter visible on hover. Clicking "+" opens an inline comment box immediately. Shift-click extends to a range.

**Independent Test**: Start a session where files are modified. Click "Git." Click a changed file. Verify the diff renders as two columns — old on left, new on right. Hover a line — verify "+" appears. Click "+" — verify an inline comment box opens immediately. Type text and submit — verify comment is injected into the session.

- [x] T005 [US2] Rewrite the diff rendering in `frontend/src/components/DiffViewer.tsx`: import `parseSideBySideDiff` from `frontend/src/utils/diff-parser.ts`. Replace the unified diff rendering (single-column with +/- lines) with a two-column CSS grid layout. Left column: old file content with old line numbers in gutter. Right column: new file content with new line numbers in gutter. Context lines appear in both columns. Added lines: left cell is an empty placeholder with a subtle gray background (`bg-gray-800/30`), right cell has the content in green (`bg-green-500/10 text-green-400`). Deleted lines: left cell has content in red (`bg-red-500/10 text-red-400`), right cell is empty placeholder. Each row uses `grid-cols-2` with a 1px border between columns.
- [x] T006 [US2] Add gutter "+" icon to each line in `frontend/src/components/DiffViewer.tsx`: in the right column gutter, render a "+" span (`opacity-0 group-hover:opacity-100 text-blue-400 cursor-pointer`) that becomes visible when the row is hovered. On click, call a new `handleGutterPlusClick(lineNumber, shiftKey)` handler that: (a) if no shift key — sets selectedLines to `{start: lineNumber, end: lineNumber}` and immediately shows the comment input (set `showCommentInput` to true), (b) if shift key — extends the range and shows comment input. Remove the old separate "Comment" button that appeared after gutter selection.
- [x] T007 [US2] Reposition the inline comment box in `frontend/src/components/DiffViewer.tsx`: the comment textarea should render as a full-width row spanning both columns (`col-span-2`) immediately below the selected line(s) in the grid. It should have a left blue border accent (`border-l-2 border-blue-500`), dark background (`bg-gray-800`), and contain: the textarea, Submit button, Cancel button. Existing comments should also render as full-width rows spanning both columns below their anchor lines.
- [x] T008 [US2] Update `handleCommentSubmit` in `frontend/src/components/DiffViewer.tsx` to extract code snippets from the new `SideBySideLine[]` structure: filter lines where `right.lineNumber` falls within the selected range, map to `right.content`, join with newlines. For deletions (where right is null), use `left.content` instead.

**Checkpoint**: Git panel shows side-by-side diff with gutter "+" commenting. All tests pass.

---

## Phase 4: Polish & Validation

**Purpose**: Ensure all changes work together, tests pass, lint clean.

- [x] T009 Run `npm test` across both workspaces. Fix any test failures.
- [x] T010 Run `npm run lint` across both workspaces. Fix any lint errors (unused imports, unused variables from removed code paths).
- [x] T011 Manually verify the three clarification changes: (1) files panel shows tree+editor side-by-side, (2) git panel shows side-by-side two-column diff, (3) gutter "+" opens inline comment immediately. Update tasks.md to mark all tasks complete.
- [ ] T012 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1 — Files layout)**: No dependency on Phase 1 — can run in parallel
- **Phase 3 (US2 — Diff rewrite)**: Depends on Phase 1 (parser must be complete)
- **Phase 4 (Polish)**: Depends on Phase 2 + Phase 3 completion

### User Story Dependencies

- **US1 (Files layout)**: Independent — only touches SessionCard.tsx
- **US2 (Git diff)**: Depends on T001-T002 (parser module) — touches DiffViewer.tsx + new utils/diff-parser.ts

### Within Each User Story

- Parser tests (T001) before parser implementation (T002)
- Parser implementation (T002) before DiffViewer rendering (T005-T008)
- Layout change (T003) before cleanup (T004)

### Parallel Opportunities

- **T001 + T003**: Parser tests and files layout change touch different files — can run in parallel
- **T002 + T004**: Parser implementation and files cleanup touch different files — can run in parallel
- **T005 + T006 + T007**: These all modify DiffViewer.tsx — must be sequential

---

## Parallel Example: Phases 1 + 2

```bash
# These can run in parallel (different files):
Task T001: "Write diff parser tests in frontend/tests/unit/diff-parser.test.ts"
Task T003: "Modify files panel layout in frontend/src/components/SessionCard.tsx"

# Then sequentially:
Task T002: "Implement diff parser in frontend/src/utils/diff-parser.ts" (after T001)
Task T004: "Clean up FileViewer onClose in SessionCard.tsx" (after T003)
```

---

## Implementation Strategy

### Approach: Focused v2 Delta

This is NOT a full rebuild. The v1 implementation (90 tests, all backend, all frontend infrastructure) remains unchanged. Only 3 files are modified:

1. **`frontend/src/utils/diff-parser.ts`** — NEW: extracted + rewritten parser
2. **`frontend/src/components/DiffViewer.tsx`** — REWRITE: side-by-side rendering + gutter "+"
3. **`frontend/src/components/SessionCard.tsx`** — MODIFY: files panel layout

### Execution Plan

1. Write parser tests (T001) — establishes expected behavior
2. Implement parser (T002) — tests go green
3. Update files panel layout (T003-T004) — US1 complete
4. Rewrite DiffViewer (T005-T008) — US2 complete
5. Polish (T009-T012) — validate, lint, CI, merge

---

## Notes

- All existing v1 tests (90 tests across 10 files) must continue to pass
- No backend changes — only frontend rendering updates
- The diff API still returns raw unified diff text; parsing happens client-side
- The `usePanel` hook, panel state persistence, and comment API are all unchanged
