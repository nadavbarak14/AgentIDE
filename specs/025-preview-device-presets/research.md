# Research: Preview Device Presets & Layout Persistence

**Feature**: 025-preview-device-presets
**Date**: 2026-03-06

## R1: Dropdown/Popover Pattern for Toolbar

**Decision**: Use the existing ProjectPicker three-dot menu pattern (useState + useRef + mousedown click-outside) - no new dependencies needed.

**Rationale**: The codebase already has two dropdown implementations (ProjectPicker.tsx, DirectoryPicker.tsx) using the same pattern: `useState` for open/close, `useRef` for DOM reference, `mousedown` document listener for click-outside dismissal. This is lightweight, consistent, and well-tested in the existing codebase.

**Alternatives considered**:
- Headless UI / Radix UI library: Adds bundle size and a new dependency for a simple dropdown. Rejected per Constitution VI (Frontend Plugin Quality) - custom implementation preferred when simple.
- HTML `<details>/<summary>`: Limited styling control, inconsistent cross-browser behavior for positioning. Rejected.

**Implementation pattern**:
```tsx
const [menuOpen, setMenuOpen] = useState(false);
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!menuOpen) return;
  const handler = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [menuOpen]);
```

## R2: Device Preset Data Structure

**Decision**: Define device presets as a static TypeScript constant array with id, name, category, width, and height fields. Store only the preset `id` in the panel state.

**Rationale**: Presets are read-only application data, not user-generated. Storing a simple string ID in the database is simpler and more forward-compatible than storing full dimensions. If presets change in future updates, stored IDs can be validated against the current list.

**Alternatives considered**:
- Store full width/height in panel state: Redundant since presets are static. Would need migration if a preset's dimensions are corrected. Rejected.
- Make presets user-configurable: Over-engineering for current needs. The custom viewport mode already handles arbitrary dimensions. Rejected per Constitution IV (Simplicity/YAGNI).

## R3: Viewport Mode Type Extension

**Decision**: Extend `ViewportMode` from `'desktop' | 'mobile' | 'custom'` to include device preset IDs, OR keep `'mobile'` as the viewport mode and add a separate `mobileDeviceId` field to panel state.

**Analysis**: The separate field approach is cleaner:
- `previewViewport` stays as `'desktop' | 'mobile' | 'custom'` (no type break)
- New `mobileDeviceId: string | null` field stores which device preset is selected
- When `previewViewport === 'mobile'`, the `mobileDeviceId` determines dimensions
- Fallback: if `mobileDeviceId` is null or invalid, use first phone preset as default

**Decision**: Add `mobileDeviceId` field. Minimal schema change, backward compatible.

**Alternatives considered**:
- Encode preset ID into ViewportMode (e.g., `'mobile:iphone-15-pro'`): Breaks existing type checks, requires parsing everywhere. Rejected.
- Reuse customViewportWidth/Height for mobile presets: Conflates two concepts, loses the "which device" information. Rejected.

## R4: Database Schema Change

**Decision**: Add one column to `panel_states` table: `mobile_device_id TEXT DEFAULT NULL`.

**Rationale**: Minimal migration. The existing `preview_viewport` column continues to store 'desktop'/'mobile'/'custom'. The new column stores which device preset is active when in mobile mode. NULL means "use default device" (backward compat).

**Migration SQL**:
```sql
ALTER TABLE panel_states ADD COLUMN mobile_device_id TEXT DEFAULT NULL;
```

## R5: Terminal Position Persistence Status

**Decision**: Terminal position and bottom height are already persisted. The issue is the auto-switching logic that overrides user choices.

**Research findings**:
- `terminalPosition` and `bottomHeightPercent` are both in the auto-save watch array and correctly persisted to `panel_states` table
- The auto-switching logic (lines ~514-519 of usePanel.ts) automatically moves terminal from 'center' to 'bottom' when panels open and vice versa
- This auto-switching can override the user's explicit preference
- The fix: track whether the user has explicitly set the terminal position and skip auto-switching when they have

**Decision**: Add a `userSetTerminalPosition` flag (local state only, not persisted) that gets set to `true` when the user manually toggles terminal position. When this flag is true, skip the auto-switching logic. Reset the flag when panels are all closed (terminal naturally returns to center).

**Alternatives considered**:
- Persist the flag: Unnecessary - the saved `terminalPosition` already records the user's last choice. The flag just prevents runtime auto-switching from overriding it. Rejected.
- Remove auto-switching entirely: Would break the current UX where terminal moves down when panels open. Rejected - the auto-switch is good default behavior, we just need to respect explicit user choices.

## R6: Screenshot/Recording Dropdown Behavior

**Decision**: Replace the separate View/Full toggle buttons AND action buttons with a single button that shows a dropdown. Selecting from the dropdown immediately triggers the action.

**Current flow**: Select mode (View/Full toggle) → Click action button (camera/record)
**New flow**: Click action button → Dropdown appears → Select View or Full → Action triggers

**Rationale**: Reduces 3 clicks to 2 clicks, removes 4 buttons (2 View/Full pairs) from the toolbar, simplifies the mental model.

**Special case - recording stop**: When recording is active, clicking the record button stops recording immediately (no dropdown). This matches user expectation - you want to stop NOW, not choose a mode.
