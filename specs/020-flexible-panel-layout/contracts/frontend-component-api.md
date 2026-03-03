# Frontend Component Contract: Flexible Panel Layout

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01

Defines the public interface of the new layout system components. These contracts govern how existing code integrates with the new panel layout manager.

---

## FlexiblePanelGrid

Replaces the hardcoded 3-zone layout in `SessionCard.tsx`. Renders the active layout preset with drag-and-drop and resize capabilities.

```typescript
interface FlexiblePanelGridProps {
  sessionId: string;
  layoutConfig: LayoutConfig;
  onLayoutChange: (newConfig: LayoutConfig) => void;
  renderPanel: (panelId: PanelId, cellId: string) => React.ReactNode;
  className?: string;
}
```

**Behavior**:
- Renders a `ResizablePanelGroup` tree matching `layoutConfig.presetId`
- Each `ResizablePanel` cell is a `DndDropZone` accepting dragged panels
- Each panel header is a `DndDragHandle` initiating drags
- Calls `onLayoutChange` on any drag-complete, resize-end, or panel close event
- Does NOT manage its own state — all state flows through `layoutConfig` prop

---

## LayoutPresetPicker

Toolbar component that shows the current preset and lets the user switch.

```typescript
interface LayoutPresetPickerProps {
  currentPresetId: LayoutPresetId;
  onPresetSelect: (presetId: LayoutPresetId) => void;
}
```

**Behavior**:
- Shows a clickable icon/button representing the current preset
- On click, opens a popover/dropdown with all available presets displayed as grid icons
- On preset selection, calls `onPresetSelect` and closes the popover
- Does NOT animate the layout change itself (caller handles that)

---

## PanelVisibilityMenu

Menu listing all known panel types with their current visibility status. Allows re-opening closed panels.

```typescript
interface PanelVisibilityMenuProps {
  layoutConfig: LayoutConfig;
  availablePanels: PanelId[];       // All panels registered for this session
  onTogglePanel: (panelId: PanelId) => void;
}
```

**Behavior**:
- Lists all panels in `availablePanels`
- Shows a checkmark/indicator for panels that are currently active or stacked
- On click of a closed panel → calls `onTogglePanel(panelId)` to reopen it
- On click of an active panel → calls `onTogglePanel(panelId)` to close it
- Prevents closing the last visible panel (button disabled with tooltip)

---

## useLayoutConfig Hook

Manages `LayoutConfig` state for a session, replacing the relevant parts of `usePanel`.

```typescript
function useLayoutConfig(sessionId: string): {
  layoutConfig: LayoutConfig;
  isLoading: boolean;

  // Preset operations
  applyPreset: (presetId: LayoutPresetId) => void;

  // Panel operations
  movePanel: (panelId: PanelId, targetCellId: string) => void;
  closePanel: (panelId: PanelId) => void;
  openPanel: (panelId: PanelId) => void;
  swapPanels: (panelIdA: PanelId, panelIdB: PanelId) => void;

  // Size operations (called by react-resizable-panels callbacks)
  updateSizes: (cellId: string, sizes: number[]) => void;
}
```

**Behavior**:
- Loads `layoutConfig` from backend on mount (falls back to legacy migration)
- Auto-saves to backend with 100ms debounce on any change (reuses existing `panelStateApi`)
- All operations are pure state transitions — no side effects beyond the save

---

## LAYOUT_PRESETS Constant

Static export defining all available presets. Imported by both `LayoutPresetPicker` and `useLayoutConfig`.

```typescript
// frontend/src/constants/layoutPresets.ts

export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPreset> = {
  'equal-3col': {
    id: 'equal-3col',
    label: 'Equal 3 Columns',
    description: 'Three equal panels side by side',
    slotCount: 3,
    structure: { orientation: 'horizontal', children: ['cell', 'cell', 'cell'], defaultSizes: [33, 34, 33] },
    icon: 'LayoutEqual3Col',
  },
  '2left-1right': {
    id: '2left-1right',
    label: '2 Left + 1 Right',
    description: 'Two stacked panels on the left, one wide panel on the right',
    slotCount: 3,
    structure: {
      orientation: 'horizontal',
      children: [
        { orientation: 'vertical', children: ['cell', 'cell'], defaultSizes: [50, 50] },
        'cell',
      ],
      defaultSizes: [33, 67],
    },
    icon: 'Layout2Left1Right',
  },
  // ... (all 6 presets)
};
```
