# Implementation Plan: IDE Panels v5 — Diff Fix, Responsive, Preview, Mouse Selection

**Branch**: `002-ide-panels` | **Date**: 2026-02-18 | **Spec**: `specs/002-ide-panels/spec.md`
**Input**: Feature specification from `/specs/002-ide-panels/spec.md` — v5 clarification session

**Context**: This is a v5 update. The v1-v4 code is committed (PR #3) with 104 tests passing. Changes needed:
1. Fix diff content cutoff (overflow-hidden clips, new files waste 50% space)
2. Add gutter drag + text selection for multi-line comments
3. Responsive panel layout with min-width constraints
4. Wire WebSocket port detection to LivePreview

## Summary

Four targeted improvements addressing user-reported issues: (1) fix diff view clipping long lines and wasting space for new files, (2) add two mouse-based methods for multi-line comment selection, (3) enforce min-widths so panels remain usable on smaller screens, (4) connect port detection to preview so the embedded browser works.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, xterm.js 5, Monaco Editor, Express
**Storage**: SQLite (better-sqlite3) — no schema changes in v5
**Testing**: Vitest 2.1 (104 tests: 92 backend + 12 frontend)
**Target Platform**: Web browser (desktop)
**Project Type**: Web application (frontend + backend workspaces)
**Constraints**: All changes are frontend-only in v5 — no backend modifications needed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Frontend tests for new behavior; backend unchanged |
| II. UX-First Design | PASS | All changes driven by user feedback on specific pain points |
| III. UI Quality & Consistency | PASS | Responsive layout, overflow fix, polish |
| IV. Simplicity | PASS | Targeted fixes, no new abstractions |
| V. CI/CD Pipeline | PASS | Will push, wait CI, merge via PR |
| VI. Frontend Plugin Quality | PASS | No new plugins needed |
| VII. Backend Security | PASS | No backend changes in v5 |
| VIII. Observability | PASS | No new backend operations |

No violations. All changes align with principles.

## Project Structure

### Documentation (this feature)

```text
specs/002-ide-panels/
├── plan.md              # This file (v5 update)
├── research.md          # R18-R21 added for v5
├── spec.md              # FR-024 through FR-027 added for v5
├── data-model.md        # Unchanged
├── quickstart.md        # Updated for v5
├── contracts/           # Unchanged — no new API endpoints
└── tasks.md             # Will be regenerated for v5
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/          # Unchanged in v5
│   ├── services/        # Unchanged in v5
│   ├── api/             # Unchanged in v5
│   └── worker/          # Unchanged in v5
└── tests/               # Unchanged in v5

frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx    # MODIFY: responsive min-widths, port detection
│   │   ├── SessionGrid.tsx    # MODIFY: remove detectedPort prop passthrough
│   │   ├── DiffViewer.tsx     # MODIFY: overflow fix, new-file layout, gutter drag, text selection
│   │   └── LivePreview.tsx    # Unchanged (already functional)
│   ├── hooks/
│   │   └── usePanel.ts        # Unchanged
│   └── services/
│       └── api.ts             # Unchanged
└── tests/
```

**Structure Decision**: Web application structure. All v5 changes are frontend-only (3 component files).

## Changes Summary

### 1. Diff Content Cutoff Fix (FR-025, R19)

**Files**: `frontend/src/components/DiffViewer.tsx`

- Change `overflow-hidden` to `overflow-x-auto` on DiffCell content div
- For new files (changeType "A"), render single-column full-width layout instead of `grid-cols-2`
- Keep side-by-side for modified/deleted files

### 2. Multi-Line Comment Selection (FR-024, R18)

**Files**: `frontend/src/components/DiffViewer.tsx`

- **Gutter drag**: Add `onMouseDown` → track `isDragging` → `onMouseMove` extends range → `onMouseUp` opens comment input
- **Text selection**: Add `mouseup` listener on diff content. Check `window.getSelection()`. Walk DOM to find line numbers. Show floating "Comment" button.
- Both methods set `selectedLines` and reuse existing comment flow

### 3. Responsive Panel Layout (FR-026, R20)

**Files**: `frontend/src/components/SessionCard.tsx`

- Enforce min-widths: panels 200px, terminal 300px
- In resize handler: clamp percentages based on container pixel width
- In panel toggle: prevent opening second panel if viewport too narrow
- Drag handles enforce minimums during resize

### 4. Port Detection → LivePreview (FR-027, R21)

**Files**: `frontend/src/components/SessionCard.tsx`, `frontend/src/components/SessionGrid.tsx`

- In `SessionCard`, listen for `port_detected` in `handleWsMessage` and store in state
- Pass state-managed port to `LivePreview` instead of (always-null) prop
- Remove unused `detectedPort` prop from `SessionCardProps`
- Remove unused prop passthrough from `SessionGrid`
