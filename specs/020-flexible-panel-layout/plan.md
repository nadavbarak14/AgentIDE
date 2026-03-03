# Implementation Plan: Flexible Panel Layout Manager

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-flexible-panel-layout/spec.md`

## Summary

Replace the existing fixed 3-zone panel layout in `SessionCard.tsx` with a VS Code-style flexible grid that supports drag-and-drop panel reordering, resizable splitters, and switchable layout presets (like tmux). The new system uses `react-resizable-panels` for splitter mechanics and `@dnd-kit` for drag-to-reorder. Layout state is persisted per-session to the existing SQLite `panel_states` table via a new `layout_config` JSON column.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Vite 6, Tailwind CSS 3, Express 4, better-sqlite3 (all existing) + `react-resizable-panels` (new), `@dnd-kit/core` + `@dnd-kit/sortable` (new)
**Storage**: SQLite (better-sqlite3) — one migration: `ALTER TABLE panel_states ADD COLUMN layout_config TEXT DEFAULT NULL`
**Testing**: Vitest 2.1.0, @testing-library/react, @testing-library/jest-dom (all existing)
**Target Platform**: Browser (desktop-first, mouse/trackpad; 1280px+ viewport)
**Project Type**: Web application (React frontend + Express backend)
**Performance Goals**: Preset switch < 500ms visible; drag response < 16ms (60fps); layout load < 1s after session focus
**Constraints**: No touch-screen drag-and-drop in this version; layout local per session (no cross-device sync)
**Scale/Scope**: Affects every session view in the IDE; ~1,300-line `SessionCard.tsx` refactor

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | ✅ PASS | Unit tests for useLayoutConfig, FlexiblePanelGrid; system tests for drag/drop/resize workflows |
| II. UX-First Design | ✅ PASS | Spec-first: user stories defined with acceptance scenarios before implementation |
| III. UI Quality & Consistency | ✅ PASS | Drag handles, drop zones, and dividers follow existing dark-theme design language |
| IV. Simplicity | ✅ PASS | Two focused libraries (dnd-kit + react-resizable-panels); no over-engineering |
| V. CI/CD Pipeline | ✅ PASS | PR-only merge; CI must pass; no local merges to main |
| VI. Frontend Plugin Quality | ✅ PASS | Both libraries actively maintained, TypeScript-first, accessible |
| VII. Backend Security | ✅ PASS | New `layoutConfig` field validated server-side before DB write |
| VIII. Observability | ✅ PASS | Layout load/save operations log at INFO level; errors logged at ERROR |

**Post-design re-check**: ✅ No violations introduced in Phase 1 design artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/020-flexible-panel-layout/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: library decisions and architecture
├── data-model.md        # Phase 1: LayoutConfig, CellConfig, PanelId types
├── quickstart.md        # Phase 1: developer onboarding
├── contracts/
│   ├── panel-state-api.md          # Extended GET/PUT /api/sessions/:id/panel-state
│   └── frontend-component-api.md  # FlexiblePanelGrid, useLayoutConfig, etc.
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
frontend/src/
├── constants/
│   └── layoutPresets.ts          # NEW: static preset definitions (6 presets)
├── types/
│   └── layout.ts                 # NEW: LayoutConfig, CellConfig, PanelId types
├── hooks/
│   ├── useLayoutConfig.ts        # NEW: replaces layout management in usePanel
│   └── usePanel.ts               # MODIFIED: delegates layout to useLayoutConfig
├── components/
│   ├── FlexiblePanelGrid.tsx     # NEW: ResizablePanelGroup tree + DnD zones
│   ├── LayoutPresetPicker.tsx    # NEW: toolbar preset picker popover
│   ├── PanelHeader.tsx           # NEW: reusable panel header with drag handle + close
│   ├── PanelVisibilityMenu.tsx   # NEW: show/hide panel menu
│   └── SessionCard.tsx           # MODIFIED: swaps hardcoded layout for FlexiblePanelGrid
└── services/
    └── api.ts                    # MODIFIED: panelState.save sends layoutConfig

backend/src/
├── models/
│   └── db.ts                     # MODIFIED: migration adds layout_config column
└── api/routes/
    └── sessions.ts               # MODIFIED: validates + stores layoutConfig

tests/
├── unit/
│   ├── useLayoutConfig.test.ts   # NEW: unit tests for all layout hook operations
│   ├── layoutPresets.test.ts     # NEW: preset structure validation tests
│   └── layoutMigration.test.ts   # NEW: legacy → LayoutConfig migration tests
└── system/
    └── flexiblePanelLayout.test.ts # NEW: E2E: drag, resize, preset switch, persist
```

**Structure Decision**: Web application structure (existing). All new files land in established `frontend/src/` subdirectories. No new top-level directories created.

## Implementation Phases

### Phase A — Foundation (no UI changes visible)

1. **Types & Constants**: Create `frontend/src/types/layout.ts` and `frontend/src/constants/layoutPresets.ts`
2. **Backend Migration**: Add `layout_config` column; extend GET/PUT handlers with validation
3. **`useLayoutConfig` Hook**: Full state management (load, save, applyPreset, movePanel, closePanel, openPanel)
4. **Unit Tests for Hook**: All operations covered before any UI wiring

### Phase B — Layout Rendering (replace SessionCard internals)

5. **Install Libraries**: `@dnd-kit/core`, `@dnd-kit/sortable`, `react-resizable-panels` in `frontend/`
6. **`PanelHeader` Component**: Drag handle (dnd-kit `useDraggable`), close button, panel title
7. **`FlexiblePanelGrid` Component**: `ResizablePanelGroup` tree driven by `LayoutConfig`; DnD drop zones per cell
8. **Update `SessionCard.tsx`**: Wire `FlexiblePanelGrid` + `useLayoutConfig` in place of hardcoded layout

### Phase C — Preset Picker & Panel Menu (new toolbar UI)

9. **`LayoutPresetPicker` Component**: Grid icon button + popover with preset icons
10. **`PanelVisibilityMenu` Component**: Dropdown listing all panels with open/close toggle
11. **Integration into SessionCard toolbar**: Add both components next to existing toolbar buttons

### Phase D — Polish & Tests

12. **System Tests**: Drag-to-reorder, resize, preset switch, close/reopen, persistence across reload
13. **Visual regression check**: Default layout renders identically to current 3-zone layout under `equal-3col` preset
14. **Minimum size enforcement**: Verify panels cannot be shrunk below 200px / 150px constraints
15. **Overflow stacking**: Test that switching to fewer-slot preset stacks excess panels as tabs

## Key Design Decisions

### Why `react-resizable-panels` over custom resize handles
The current `SessionCard.tsx` resize logic is ~80 lines of raw `mousemove` event handling that only supports fixed left/right/bottom slots. `react-resizable-panels` provides the same behavior for any number of cells in any nesting configuration, with keyboard accessibility built in. The library is authored by bvaughn (React core contributor) and has 2M+ weekly downloads.

### Why `@dnd-kit` over HTML5 drag API
The built-in HTML5 drag API has well-known quirks with iframes, canvas elements (xterm.js, Monaco Editor), and touch events. `@dnd-kit` uses pointer events and CSS transforms, sidestepping these issues. Panel content receives `pointer-events: none` during drags to prevent xterm/Monaco interference.

### Why extend `panel_states` rather than create a new table
The existing table already handles per-session, per-field persistence with tested API endpoints. Adding a single `layout_config` JSON column keeps the migration trivial and the backend surface area unchanged.

### Migration from old layout to new
On first load after update, if `layout_config` is `NULL` in SQLite, the frontend reads the legacy `leftPanel`/`rightPanel`/`bottomPanel` values, constructs an equivalent `LayoutConfig` with `presetId: 'equal-3col'`, and immediately saves it. Users see no disruption — their existing layouts map 1:1 to the new format.

## Complexity Tracking

No constitution violations. Feature uses only two new well-justified libraries solving real problems that cannot be addressed with the existing custom code at reasonable cost.
