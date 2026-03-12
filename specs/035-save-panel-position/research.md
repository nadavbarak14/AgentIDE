# Research: Save Panel Position

## R1: Terminal Auto-Positioning Default

**Decision**: Change the auto-positioning logic so the terminal stays in `'center'` (top zone, horizontal with panels) when panels open, instead of auto-moving to `'bottom'`. The existing left/right panel arrangement is unchanged — files on the left, terminal in center, git/preview on the right.

**Rationale**: The current `useEffect` in `SessionCard.tsx` (lines 553-578) auto-moves the terminal to the bottom zone whenever any left/right panel opens. Users want the terminal to stay "up" — sharing horizontal space with panels in the top zone. This is a one-line change: remove or invert the auto-positioning effect.

**Alternatives considered**:
- Adding a new terminal position value (e.g., `'top-left'`) — rejected; `'center'` already keeps the terminal in the top zone. We just need to stop auto-switching away from it.
- Making the default configurable — rejected as overengineering; just change the default behavior.

## R2: Layout Persistence on Panel Toggle

**Decision**: When a panel is toggled (opened/closed), save the current layout dimensions before the toggle and restore saved dimensions for the new panel arrangement. Use the existing auto-save mechanism (100ms debounce via `scheduleSave`) which already persists all width/height percentages.

**Rationale**: The existing `usePanel.ts` hook already saves all panel state (`leftWidthPercent`, `rightWidthPercent`, `bottomHeightPercent`, etc.) on every change via a debounced auto-save. The panel widths are already persisted per session. The main gap is that when toggling panels, the widths from one combination overwrite another. Per-combination snapshots (R3) address this.

**Alternatives considered**:
- Saving only on explicit panel close — rejected because the user might resize without closing; the existing auto-save captures all changes.

## R3: Per-Combination Layout Snapshots

**Decision**: Store layout dimension snapshots per panel combination using a new `panel_layout_snapshots` table with a composite key of `(session_id, view_mode, combination_key)`. The combination key is a sorted, `+`-joined string of open panel names (e.g., `"files"`, `"files+git"`).

**Rationale**: The existing `panel_states` table stores one set of dimensions per session. When the user switches from "files only" to "files+git", the dimensions for "files only" are overwritten. A separate table allows independent recall of dimensions per combination.

**Alternatives considered**:
- JSON blob in `panel_states` — rejected because querying is awkward and INSERT OR REPLACE risks data loss.
- Client-side localStorage — rejected; inconsistent with the server-side persistence pattern used throughout the app.

## R4: Default Layout When No Snapshot Exists

**Decision**: When opening a panel combination for the first time (no saved snapshot), use the existing defaults: `leftWidthPercent: 25`, `rightWidthPercent: 35`, terminal gets the remaining space. These defaults already work well for the top-zone horizontal layout.

**Rationale**: The current defaults were designed for exactly this layout mode (`terminalPosition === 'center'`). Since we're keeping the terminal in center instead of moving it to bottom, the existing defaults apply perfectly.
