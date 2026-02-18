# Implementation Plan: IDE Panels v6 — Diff Fix, Sidebar Toggle, Collapsible Overflow

**Branch**: `002-ide-panels` | **Date**: 2026-02-18 | **Spec**: `specs/002-ide-panels/spec.md`
**Input**: Feature specification from `/specs/002-ide-panels/spec.md` — v6 clarification session

**Context**: This is a v6 update. The v1-v5 code is committed with 112 tests passing. Changes needed:
1. Fix diff scrollbars — remove all horizontal scrollbars, use word wrapping instead
2. Collapsible SessionQueue sidebar with toggle button in top bar
3. Collapsible "More Sessions" overflow strip

## Summary

Three targeted improvements: (1) fix the diff view CSS so long lines wrap cleanly without any scrollbars on individual lines or the content area horizontally, (2) add a sidebar toggle button so users can hide the SessionQueue to reclaim screen space, (3) make the "More Sessions" overflow strip collapsible to a compact count bar.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, xterm.js 5, Monaco Editor, Express
**Storage**: SQLite (better-sqlite3) — no schema changes in v6
**Testing**: Vitest 2.1 (112 tests: 92 backend + 20 frontend)
**Target Platform**: Web browser (desktop)
**Project Type**: Web application (frontend + backend workspaces)
**Constraints**: All changes are frontend-only in v6 — no backend modifications needed

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Frontend tests for new behavior; backend unchanged |
| II. UX-First Design | PASS | All changes driven by user feedback on specific pain points |
| III. UI Quality & Consistency | PASS | Removing ugly scrollbars, collapsible UI elements |
| IV. Simplicity | PASS | Targeted fixes, localStorage for toggle state |
| V. CI/CD Pipeline | PASS | Will push, wait CI, merge via PR |
| VI. Frontend Plugin Quality | PASS | No new plugins needed |
| VII. Backend Security | PASS | No backend changes in v6 |
| VIII. Observability | PASS | No new backend operations |

No violations. All changes align with principles.

## Project Structure

### Documentation (this feature)

```text
specs/002-ide-panels/
├── plan.md              # This file (v6 update)
├── research.md          # R22-R24 added for v6
├── spec.md              # FR-028, FR-029 added for v6
├── data-model.md        # Unchanged
├── quickstart.md        # Updated for v6
├── contracts/           # Unchanged — no new API endpoints
└── tasks.md             # Will be regenerated for v6
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── DiffViewer.tsx     # MODIFY: fix scrollbar CSS
│   │   ├── SessionGrid.tsx    # MODIFY: add collapsible overflow strip
│   │   └── SessionQueue.tsx   # No internal changes — parent controls visibility
│   ├── pages/
│   │   └── Dashboard.tsx      # MODIFY: add sidebar toggle button, manage toggle state
│   └── hooks/
│       └── usePanel.ts        # Unchanged
└── tests/
    └── unit/
        └── v6-features.test.ts  # NEW: v6 tests
```

**Structure Decision**: Web application structure. All v6 changes are frontend-only (3 component files + 1 test file).

## Changes Summary

### 1. Diff Scrollbar Fix (FR-025 update, R22)

**Files**: `frontend/src/components/DiffViewer.tsx`

- Change DiffCell content div from `whitespace-pre-wrap break-all` to `whitespace-pre-wrap` with `overflow-wrap: anywhere` (Tailwind: `break-all` → `[overflow-wrap:anywhere]`)
  - `break-all` is too aggressive — it breaks in the middle of any word including short ones. `overflow-wrap: anywhere` only breaks when a word would overflow, preferring natural break points
- Verify the main diff content container keeps `overflow-auto` for vertical scrolling only — no horizontal scrollbar should appear since all content wraps
- Verify the side-by-side layout still renders correctly with wrapping

### 2. Collapsible SessionQueue Sidebar (FR-028, R23)

**Files**: `frontend/src/pages/Dashboard.tsx`

- Add `sidebarOpen` state (default `true`), persist to `localStorage` key `c3-sidebar-open`
- Add toggle button in top bar (right side, before settings). Chevron icon: `>>` when open (hides sidebar), `<<` when closed (shows sidebar)
- Conditionally render `SessionQueue` based on `sidebarOpen`
- Smooth transition: wrap sidebar in a container with `transition-all duration-200` and toggle between `w-80` and `w-0 overflow-hidden`

### 3. Collapsible "More Sessions" Overflow Strip (FR-029, R24)

**Files**: `frontend/src/components/SessionGrid.tsx`

- Add `overflowCollapsed` state (default `true` — start collapsed for cleaner look)
- Persist to `localStorage` key `c3-overflow-collapsed`
- When collapsed: show compact bar with count "+N more" and a down-chevron
- When expanded: show existing horizontal mini-card strip with an up-chevron to collapse
- Click the bar to toggle
