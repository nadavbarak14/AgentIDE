# Data Model: Flexible Panel Layout Manager

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01

## Entities

### 1. LayoutConfig

The root state object stored per session. Replaces the current fixed left/right/bottom slot model.

```typescript
interface LayoutConfig {
  presetId: LayoutPresetId;         // Which preset template is active
  cells: CellConfig[];              // Ordered list of grid cells
  sizes: number[];                  // Panel sizes in percent (parallel to cells)
}

type LayoutPresetId =
  | 'equal-3col'
  | '2left-1right'
  | '1left-2right'
  | '2top-1bottom'
  | '1top-2bottom'
  | 'focus';
```

**Validation rules**:
- `cells.length` must match the preset's slot count
- `sizes` array must sum to 100 (within floating-point tolerance)
- Each cell must contain at least one panel entry OR be empty (placeholder)

---

### 2. CellConfig

Represents one slot in the grid. A cell can hold one active panel and a stack of additional panels (displayed as tabs when overflow occurs).

```typescript
interface CellConfig {
  cellId: string;              // Stable ID: 'cell-0', 'cell-1', 'cell-2'
  activePanelId: PanelId | null;  // Which panel is shown on top
  stackedPanelIds: PanelId[];     // Additional panels tabbed behind active one
}
```

**Validation rules**:
- `cellId` must be unique within a `LayoutConfig`
- `activePanelId` must be `null` (empty cell) or a valid `PanelId`
- `stackedPanelIds` must not contain `activePanelId`
- Each `PanelId` may appear in at most one cell (active or stacked)

---

### 3. PanelId

Identifies a specific panel by type. Each panel type appears at most once in the layout.

```typescript
type PanelId =
  | 'files'
  | 'git'
  | 'preview'
  | 'issues'
  | 'widgets'
  | 'shell'
  | `ext:${string}`;  // Extension panels, e.g., 'ext:my-tool'
```

---

### 4. LayoutPreset (static, not persisted)

Defines the structural template for a layout. These are compile-time constants in the frontend — not stored in the database.

```typescript
interface LayoutPreset {
  id: LayoutPresetId;
  label: string;              // Human-readable name, e.g., "2 Left + 1 Right"
  description: string;        // Tooltip text
  slotCount: number;          // Number of cells this preset creates
  structure: PresetStructure; // How cells are arranged (orientation tree)
  icon: string;               // SVG path or component name for picker UI
}

interface PresetStructure {
  orientation: 'horizontal' | 'vertical';
  children: Array<PresetStructure | 'cell'>; // Nested groups or leaf cells
  defaultSizes: number[];     // Default size percentages for this level
}
```

**Preset definitions** (at least 5, per SC-004):

| ID | Label | Slots | Structure |
|----|-------|-------|-----------|
| `equal-3col` | Equal 3 Columns | 3 | horizontal: [cell, cell, cell] |
| `2left-1right` | 2 Left + 1 Right | 3 | horizontal: [vertical:[cell,cell], cell] |
| `1left-2right` | 1 Left + 2 Right | 3 | horizontal: [cell, vertical:[cell,cell]] |
| `2top-1bottom` | 2 Top + 1 Bottom | 3 | vertical: [horizontal:[cell,cell], cell] |
| `1top-2bottom` | 1 Top + 2 Bottom | 3 | vertical: [cell, horizontal:[cell,cell]] |
| `focus` | Focus (Single) | 1 | horizontal: [cell] |

---

### 5. PanelVisibility (derived, not persisted separately)

A panel is considered "visible" if it appears as `activePanelId` in any cell. A panel is "hidden" if it is present in a `stackedPanelIds` list but not active. A panel is "closed" if it does not appear anywhere in `cells`.

```typescript
// Derived at runtime:
type PanelVisibilityStatus = 'active' | 'stacked' | 'closed';

function getPanelVisibility(
  config: LayoutConfig,
  panelId: PanelId
): PanelVisibilityStatus
```

---

## Persistence (SQLite Schema Change)

### Migration: Add `layout_config` to `panel_states`

```sql
ALTER TABLE panel_states
  ADD COLUMN layout_config TEXT DEFAULT NULL;
```

`layout_config` stores the full `LayoutConfig` as a JSON string. When `NULL`, the system falls back to the default `equal-3col` preset derived from the existing `left_panel`, `right_panel`, and `bottom_panel` columns.

**Backward compatibility**: All existing columns (`left_panel`, `right_panel`, `bottom_panel`, etc.) are preserved and continue to function as the migration path. On first load after the update, if `layout_config` is `NULL`, the system converts the existing column values to a `LayoutConfig` and saves it.

---

## State Transitions

### Panel Drag-and-Drop Reorder

```
User drags Panel A from Cell 0 to Cell 1
├── Cell 0: activePanelId was A → becomes null (or next stacked panel)
└── Cell 1: activePanelId was B → B moves to stackedPanelIds[0], A becomes active
           (OR: A swaps directly with B based on drop target type)
→ Save updated LayoutConfig to SQLite (debounced 100ms)
```

### Preset Switch

```
User selects preset '2left-1right' (was 'equal-3col')
├── Collect all currently placed panels: [files, git, preview]
├── New preset has 3 slots: cell-0 (left-top), cell-1 (left-bottom), cell-2 (right)
├── Assign panels to cells in order: files→cell-0, git→cell-1, preview→cell-2
├── Sizes reset to preset defaults: [33, 33, 67] (left group 33%, right 67%)
└── Save updated LayoutConfig to SQLite
```

### Panel Close

```
User clicks close on Panel B (currently active in Cell 1)
├── Cell 1: If stackedPanelIds non-empty → promote first stacked to active
│           If stackedPanelIds empty → cell becomes empty (null activePanelId)
├── Adjacent cells do NOT reflow sizes (sizes preserved)
└── Panel B is no longer in any cell → status is 'closed'
→ Save updated LayoutConfig to SQLite
```

### Panel Reopen

```
User selects Panel B from panel visibility menu
├── Find first empty cell (null activePanelId)
│   → Place Panel B there as activePanelId
├── If no empty cell found → place in cell-0's stackedPanelIds (tab)
└── Save updated LayoutConfig to SQLite
```

---

## Minimum Size Constraints

Enforced via `minSize` prop on `ResizablePanel` (react-resizable-panels):

| Context | Minimum |
|---------|---------|
| Any panel cell (horizontal) | 200px → ~15% of 1280px viewport |
| Any panel cell (vertical) | 150px → ~12% of typical 800px height |
| Terminal panel (preferred) | 200px height minimum |

These match the current hardcoded minimums in `SessionCard.tsx` for continuity.
