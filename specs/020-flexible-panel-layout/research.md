# Research: Flexible Panel Layout Manager

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01

## Existing Architecture Findings

### Current Panel System
The IDE currently uses a **custom-built 3-zone layout** inside `SessionCard.tsx` (1,313 lines):
```
┌────────────┬────────────────┬───────────────┐
│ Left Panel │ Terminal       │ Right Panel   │
│ (files)    │ (center mode)  │ (git/preview) │
├────────────┴────────────────┴───────────────┤
│ Terminal (bottom mode, optional)             │
└──────────────────────────────────────────────┘
```

Key constraints:
- Fixed slot assignment: files → left, git/preview/ext → right, shell → bottom
- Panel resize uses raw `mousemove`/`mouseup` DOM events (no library)
- No drag-to-reorder: panels are bound to fixed slots
- State is per-session, auto-saved to SQLite with 100ms debounce

### Persistence Architecture
- **Table**: `panel_states` (SQLite, per session)
- **API**: `GET/PUT /api/sessions/{id}/panel-state`
- **Frontend**: `usePanel` hook auto-saves on any state change
- **Load strategy**: SQLite on session focus, defaults on first use

### Minimum Size Constraints (currently enforced)
- Left/Right panels: 200px minimum
- Terminal center: 300px minimum
- Top zone: 200px minimum
- Bottom zone: 150px minimum

---

## Decision 1: Drag-and-Drop Library

**Decision**: Use `@dnd-kit/core` + `@dnd-kit/sortable`

**Rationale**:
- Smallest bundle (~12KB gzipped combined)
- Actively maintained (updated within the last 10 days as of 2026)
- Full TypeScript support
- Excellent accessibility (WCAG, keyboard navigation built-in)
- @dnd-kit/sortable handles grid reordering natively
- 60fps GPU-accelerated transforms

**Alternatives Considered**:
- `react-dnd` — abandoned, last published ~4 years ago; REJECTED
- `@hello-pangea/dnd` — designed for lists/kanban, not grid panels; parent project archived Aug 2025; REJECTED
- Custom HTML5 drag API — high implementation cost, requires manual accessibility; only if bundle size is severely constrained; REJECTED
- `react-beautiful-dnd` — archived; REJECTED

---

## Decision 2: Resizable Panel Splitter Library

**Decision**: Use `react-resizable-panels` (by bvaughn)

**Rationale**:
- VS Code-inspired splitter mechanics, directly matches the UX goal
- 2.08M weekly downloads — de-facto standard for IDE-like interfaces
- Actively maintained (updated 5 days ago as of 2026)
- Supports nested groups for 2D grid layouts (horizontal group containing vertical groups)
- Full keyboard navigation and WCAG accessibility
- Full TypeScript support
- Trusted maintainer (bvaughn — React core team contributor)

**Alternatives Considered**:
- `allotment` — lighter (206KB vs 500KB), but smaller community and fewer features; acceptable fallback if bundle size becomes critical; REJECTED for now
- Custom resize handles (current approach) — we already have this, but it only supports fixed slots; insufficient for flexible grid; REJECTED

---

## Decision 3: Layout State Persistence

**Decision**: Extend the existing SQLite `panel_states` table with a `layout_config` JSON column

**Rationale**:
- The project already persists all panel state to SQLite per-session
- A single `layout_config` TEXT column (JSON blob) can store the full flexible layout tree without a schema redesign
- Backward compatibility: existing columns remain; new column defaults to `NULL` (triggers loading the current 3-zone layout as the default preset)
- Existing `usePanel` auto-save mechanism reused with minimal changes

**Alternatives Considered**:
- localStorage only — fast but not cross-reload persistent (server restarts clear it); inconsistent with how the rest of panel state works; REJECTED
- Full schema redesign (new `panel_layouts` table) — over-engineered for current scope; REJECTED
- Hybrid localStorage + SQLite — adds complexity for little gain since SQLite already provides fast reads; REJECTED

---

## Decision 4: Layout Preset Definitions

**Decision**: Presets are **static frontend constants** (not stored in DB)

**Rationale**:
- User-created custom presets are out of scope (spec only requires preset *selection*, not creation)
- Reduces API surface area
- Presets are the same for all users/sessions
- Easy to add user-defined presets later as an extension

**Preset Catalog** (minimum 5 required by SC-004):
1. `equal-3col` — Three equal-width columns (current default)
2. `2left-1right` — Two stacked panels on left (top/bottom), one wide panel on right
3. `1left-2right` — One wide panel on left, two stacked panels on right (top/bottom)
4. `2top-1bottom` — Two side-by-side panels on top, one full-width panel on bottom
5. `1top-2bottom` — One full-width panel on top, two side-by-side panels on bottom
6. `focus` — Single full-width panel (maximize one panel)

---

## Decision 5: Architecture Pattern (combining both libraries)

**Decision**: `react-resizable-panels` handles structural sizing; `@dnd-kit` handles reordering

```
ResizablePanelGroup (outer, horizontal)
├── ResizablePanel [Cell A]  ← contains Panel component, DnD draggable
├── ResizableHandle
└── ResizablePanelGroup (inner, vertical)
    ├── ResizablePanel [Cell B]  ← contains Panel component, DnD draggable
    ├── ResizableHandle
    └── ResizablePanel [Cell C]  ← contains Panel component, DnD draggable
```

Panel content (what renders inside each cell) is managed by a separate `layoutConfig` state object. When a drag-and-drop reorder occurs, only the content mapping changes — the `ResizablePanelGroup` structure is rebuilt to match the new preset, and panel sizes reset to preset defaults.

**Known challenge**: Panel IDs in `react-resizable-panels` must be stable to preserve sizes during re-renders. Solution: use grid-cell IDs (e.g., `cell-0`, `cell-1`) as panel IDs, not panel type IDs.

---

## Decision 6: Migration from Current System

**Decision**: Replace the custom 3-zone layout in `SessionCard.tsx` with the new library-based grid

**Approach**:
- Extract existing panel components (FilesPanel, GitPanel, PreviewPanel, TerminalPanel) into standalone components that accept a `cellId` prop
- Replace the manual flexbox layout with `ResizablePanelGroup`
- Existing minimum size constraints enforced via `minSize` prop on `ResizablePanel`
- Existing panel state (leftPanel, rightPanel, etc.) migrated to new `layoutConfig` format on first load
- The `usePanel` hook extended to manage `layoutConfig` alongside existing state

---

## Bundle Size Impact

```
@dnd-kit/core:             ~8 KB gzipped
@dnd-kit/sortable:         ~2 KB gzipped
react-resizable-panels:   ~18 KB gzipped
─────────────────────────────────────────
Total added:              ~28 KB gzipped
```

Acceptable for a professional IDE application.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| xterm.js / Monaco conflicts with drag overlay | Medium | Disable pointer events on panel content during drag; use drag handle restricted to header only |
| react-resizable-panels panel ID instability during reorder | Medium | Use stable cell-position IDs, not content IDs |
| Visual regression on existing panel behavior | Low | All existing panel tests must pass; add screenshot tests for default layout |
| Overflow panels when preset has fewer slots than open panels | Low | Stacking/tabbing logic specified in FR-012; implement panel tabs within cells |
