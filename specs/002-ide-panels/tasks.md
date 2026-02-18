# Tasks: IDE Panels v6 — Diff Fix, Sidebar Toggle, Collapsible Overflow

**Input**: Design documents from `/specs/002-ide-panels/`
**Prerequisites**: plan.md (v6), spec.md (post-clarification v6), research.md (R22-R24)

**Context**: This is a v6 update. The v1-v5 code is committed and all 112 tests pass. Changes needed:
1. Fix diff scrollbar CSS (break-all → overflow-wrap: anywhere)
2. Collapsible SessionQueue sidebar with toggle in top bar
3. Collapsible "More Sessions" overflow strip

---

## Phase 1: Diff Scrollbar Fix (FR-025)

- [x] T001 Fix diff line wrapping CSS in `frontend/src/components/DiffViewer.tsx` — change the DiffCell content div from `whitespace-pre-wrap break-all` to `whitespace-pre-wrap [overflow-wrap:anywhere]`. The `break-all` property is too aggressive and breaks words at every character. `overflow-wrap: anywhere` only breaks when a word would overflow, preferring natural break points. Verify no horizontal scrollbar appears on the diff content container (line 205 has `overflow-auto` which is correct for vertical scroll — ensure no horizontal overflow with wrapping in place)

## Phase 2: Collapsible Sidebar (FR-028)

- [x] T002 Add sidebar toggle state and button in `frontend/src/pages/Dashboard.tsx` — add `sidebarOpen` state initialized from `localStorage` key `c3-sidebar-open` (default `true`). Add a toggle button in the top bar (right side, before the settings controls). Button shows `»` when sidebar is open (click to hide) and `«` when hidden (click to show). On toggle, persist to `localStorage`. Wrap the `SessionQueue` component in a container div that transitions between `w-80` and `w-0 overflow-hidden` using `transition-all duration-200`. When `sidebarOpen` is false, the sidebar container has `w-0 overflow-hidden`

## Phase 3: Collapsible Overflow Strip (FR-029)

- [x] T003 Add collapsible "More Sessions" strip in `frontend/src/components/SessionGrid.tsx` — add `overflowCollapsed` state initialized from `localStorage` key `c3-overflow-collapsed` (default `true` = collapsed). When collapsed and `overflowSessions.length > 0`, render a single compact clickable bar showing "+N more sessions ▾" with `cursor-pointer` and hover styling. When expanded, render the existing horizontal mini-card strip with an "▴" collapse button in the label area. On toggle, persist to `localStorage`. Add `transition-all duration-200` for smooth expand/collapse

## Phase 4: Polish

- [x] T004 Add frontend tests for v6 changes in `frontend/tests/unit/v6-features.test.ts` — add tests for: (a) localStorage-based sidebar toggle state defaults to true, (b) localStorage-based overflow collapsed state defaults to true, (c) DiffCell content div uses overflow-wrap anywhere (not break-all or overflow-x-auto)
- [x] T005 Verify all tests pass (`npm test`) — should be 112+ tests (92 backend + 20+ frontend)
- [x] T006 Verify lint passes (`npm run lint`)
- [x] T007 Build and verify both workspaces (`npm run build`)
- [ ] T008 Commit and push to existing PR #3

---

## Dependencies

- T001 (diff fix) is independent — can run in parallel with T002 and T003
- T002 (sidebar toggle) is independent — different file than T001 and T003
- T003 (overflow collapse) is independent — different file than T001 and T002
- T001, T002, T003 → T004-T008 (polish after all changes)

## Parallel Opportunities

- T001 + T002 + T003: All modify different files (DiffViewer, Dashboard, SessionGrid) — can run in parallel
- T004-T008: Sequential (tests → verify → lint → build → commit)
