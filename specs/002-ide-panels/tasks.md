# Tasks: IDE Panels v5 — Diff Fix, Responsive, Preview, Mouse Selection

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v5), spec.md (post-clarification v5), research.md (R18-R21)

**Context**: This is a v5 update. The v1-v4 code is committed and all 104 tests pass. Changes needed:
1. Fix diff content cutoff (overflow-hidden clips, new files waste 50% space)
2. Add gutter drag + text selection for multi-line comments
3. Responsive panel layout with min-width constraints
4. Wire WebSocket port detection to LivePreview

---

## Phase 1: Diff Content Fix (FR-025)

- [x] T001 [P] Fix diff line clipping in `frontend/src/components/DiffViewer.tsx` — change `overflow-hidden` to `overflow-x-auto` on the DiffCell content div (line 450: `<div className="flex-1 px-2 whitespace-pre overflow-hidden ...">`) so long lines scroll horizontally instead of being clipped
- [x] T002 [P] Add full-width layout for new files in `frontend/src/components/DiffViewer.tsx` — in `SideBySideDiff`, detect when the file is newly added (`file.changeType === 'A'`). For new files, render a single-column full-width layout (one "New" column) instead of `grid-cols-2` with an empty left column. Keep `grid-cols-2` for modified/deleted/renamed files

## Phase 2: Multi-Line Comment Selection (FR-024)

- [x] T003 Add gutter drag selection in `frontend/src/components/DiffViewer.tsx` — add state tracking (`isDragging`, `dragStartLine`) in `SideBySideDiff`. On `DiffCell` gutter, add `onMouseDown` to start drag tracking, attach document-level `mousemove` to extend selection range (highlight lines as drag proceeds with `bg-blue-500/20`), and `mouseup` to finalize selection and open the comment input. Use `data-line-number` attributes on gutter elements to identify line numbers during drag
- [x] T004 Add text selection comment in `frontend/src/components/DiffViewer.tsx` — add a `mouseup` event listener on the diff content area. On `mouseup`, check `window.getSelection()` for a non-empty selection spanning multiple lines. Walk DOM ancestors to find elements with `data-line-number` attributes, derive start/end line numbers. Show a floating "Comment" button (absolute positioned near the selection using `getSelection().getRangeAt(0).getBoundingClientRect()`). Clicking the button sets `selectedLines` and opens `showCommentInput`, reusing the existing comment flow. Dismiss the floating button when clicking elsewhere

## Phase 3: Port Detection → LivePreview (FR-027)

- [x] T005 [P] Wire port detection in `frontend/src/components/SessionCard.tsx` — add `const [detectedPort, setDetectedPort] = useState<{port: number, localPort: number} | null>(null)` state. In the existing `handleWsMessage` callback, add a case for `msg.type === 'port_detected'` that calls `setDetectedPort({ port: msg.port, localPort: msg.localPort })`. Update the `LivePreview` render to use the state-managed `detectedPort` instead of the always-null prop: `port={detectedPort?.port || 0} localPort={detectedPort?.localPort || 0}`. Remove `detectedPort` from `SessionCardProps` interface and the destructured props
- [x] T006 [P] Clean up `frontend/src/components/SessionGrid.tsx` — remove the now-unused `detectedPort` prop passthrough if any references remain. Verify no other component passes `detectedPort` to `SessionCard`

## Phase 4: Responsive Panel Layout (FR-026)

- [x] T007 Add responsive min-width enforcement to resize handler in `frontend/src/components/SessionCard.tsx` — in the `handleMouseMove` effect, after calculating the percentage, convert to pixel width using `containerRef.current.getBoundingClientRect().width`. Clamp so panels stay >= 200px and terminal stays >= 300px. Only apply the clamped percentage via `panel.setLeftWidth()` or `panel.setRightWidth()`
- [ ] T008 Add responsive guard to panel toggle in `frontend/src/components/SessionCard.tsx` — before opening a second panel (e.g., user clicks Git while Files is already open), check if the container width can accommodate both panels (200px each) plus terminal (300px) = 700px minimum. If container is too narrow, prevent the second panel from opening. Apply the same check when any single panel would cause terminal < 300px

## Phase 5: Polish

- [x] T009 Add frontend tests for v5 changes in `frontend/tests/` — add tests for: (a) DiffViewer overflow class is `overflow-x-auto` not `overflow-hidden`, (b) new files render without grid-cols-2, (c) SessionCard handles `port_detected` WebSocket message
- [x] T010 Verify all tests pass (`npm test`) — should be 104+ tests (92 backend + 12+ frontend)
- [x] T011 Verify lint passes (`npm run lint`)
- [x] T012 Build and verify both workspaces (`npm run build`)
- [ ] T013 Commit, push, create PR, wait for CI, merge to main

---

## Dependencies

- T001, T002 (diff fixes) → T003, T004 (comment selection uses same DiffViewer, avoid conflicts)
- T003 (gutter drag) → T004 (text selection builds on drag state tracking)
- T005, T006 (port detection) can run in parallel with T001-T004
- T007, T008 (responsive) can run in parallel with T001-T004
- T001-T008 → T009-T013 (polish after all changes)

## Parallel Opportunities

- T001 + T002: Both modify DiffViewer.tsx but different sections (cell vs layout) — run sequentially to be safe
- T005 + T006: Different files (SessionCard vs SessionGrid) — can run in parallel
- T005/T006 can run in parallel with T001-T004 (different files)
- T007/T008 can start after T005 (both in SessionCard.tsx, sequential with port detection)
