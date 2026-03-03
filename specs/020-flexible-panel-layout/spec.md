# Feature Specification: Flexible Panel Layout Manager

**Feature Branch**: `020-flexible-panel-layout`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "we need vs code level of panels. we can drag and control panels anywhere, and any panels. also a way to control grid view. instead of 3 in one line, maybe have 2 in line and 1 in other, like tmux"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drag Panel to New Position (Priority: P1)

A developer is working with the IDE and wants to move the terminal panel from the bottom-right to a different position in the workspace. They grab the panel's header bar, drag it over a new drop zone, and release it — the panel snaps to its new position and all other panels reflow to fill the space.

**Why this priority**: This is the core drag-and-drop capability. Without it, no other layout management feature is meaningful. It delivers immediate, visible value on its own.

**Independent Test**: Can be tested by launching the IDE, dragging any panel to a different grid cell, and verifying it lands in the new position while other panels adjust.

**Acceptance Scenarios**:

1. **Given** the IDE is open with multiple panels, **When** the user drags a panel header to a different grid area, **Then** the panel moves to the target position and neighboring panels reflow without overlap.
2. **Given** a panel is being dragged, **When** the user hovers over a valid drop zone, **Then** a visual highlight or placeholder indicates where the panel will land.
3. **Given** a panel is being dragged, **When** the user releases over an invalid area (outside the grid), **Then** the panel snaps back to its original position.
4. **Given** a panel has been moved, **When** the user refreshes or reopens the IDE, **Then** the panel remains in its new position (layout is persisted).

---

### User Story 2 - Resize Panels by Dragging Dividers (Priority: P2)

A developer wants to give more vertical space to the code diff panel and less to the terminal. They hover over the divider between the two panels, see a resize cursor, and drag the divider to resize both panels simultaneously.

**Why this priority**: Drag-to-resize is essential for panel utility — being able to move a panel without controlling its size is only half the solution. This story is independently useful without requiring layout presets.

**Independent Test**: Can be tested by hovering over a panel divider, dragging it, and confirming both adjacent panels resize proportionally.

**Acceptance Scenarios**:

1. **Given** two panels share a border, **When** the user hovers over the divider, **Then** a resize cursor appears.
2. **Given** the user drags a divider, **When** they move it, **Then** both adjacent panels resize in real-time without flickering or content loss.
3. **Given** a panel is resized to its minimum allowed size, **When** the user tries to shrink it further, **Then** the divider stops and does not collapse the panel below usability.
4. **Given** panels have been resized, **When** the user reopens the IDE, **Then** the panel sizes are restored to the last saved configuration.

---

### User Story 3 - Switch Grid Layout Presets (Priority: P2)

A developer is working with three open panels and wants to switch from the default 3-in-a-row layout to a tmux-like arrangement: two panels stacked on the left and one wide panel on the right. They open a layout picker, select a preset, and the panels rearrange instantly.

**Why this priority**: Preset layouts let users quickly switch between known configurations without manually dragging every panel. This is independently useful even without free-form drag-and-drop.

**Independent Test**: Can be tested by opening the layout picker, selecting a 2+1 or 1+2 preset, and verifying the panel grid reorganizes to match the chosen template.

**Acceptance Scenarios**:

1. **Given** the IDE has panels open, **When** the user opens the layout picker and selects a preset (e.g., "2 left + 1 right"), **Then** the panels rearrange to match that grid configuration.
2. **Given** a layout preset is selected, **When** the panels rearrange, **Then** all panels remain visible and no panel content is lost.
3. **Given** more panels are open than a preset can show, **When** the user selects that preset, **Then** excess panels are collapsed or stacked within the nearest grid cell (not hidden or destroyed).
4. **Given** no panels are open, **When** the user selects a layout preset, **Then** the grid structure changes but empty slots are shown as placeholders.

---

### User Story 4 - Close and Reopen Panels (Priority: P3)

A developer wants to temporarily hide the file browser panel to maximize their working area. They click a close button on the panel header and the panel hides, with neighboring panels expanding to fill the freed space. Later, they restore it from the panel menu.

**Why this priority**: Closing and restoring panels increases workspace flexibility, but is not essential for the core drag-and-drop or grid layout features.

**Independent Test**: Can be tested by closing any panel, verifying neighbors expand, then reopening the panel from the panel menu.

**Acceptance Scenarios**:

1. **Given** a panel is visible, **When** the user clicks the close icon on the panel header, **Then** the panel hides and adjacent panels expand to fill the space.
2. **Given** a panel is hidden, **When** the user opens the panel menu and selects the hidden panel, **Then** the panel reappears in its last position or a default position.
3. **Given** only one panel remains visible, **When** the user tries to close it, **Then** the action is blocked (minimum one visible panel enforced).

---

### Edge Cases

- What happens when a panel is dragged onto another panel occupying the same cell? The target panel swaps positions with the dragged panel.
- What happens when the browser window is resized significantly (e.g., from desktop to narrow)? Panels reflow to maintain usability; minimum panel widths are enforced and a scrollbar or collapsed view is used if needed.
- What happens when a layout preset has fewer cells than the number of open panels? Panels are stacked or tabbed within the available cells — none are silently destroyed.
- What happens when the user rapidly switches between layout presets? Each switch is applied cleanly; intermediate states do not persist.
- What happens if saved layout data is corrupted or incompatible (e.g., after an app update that removed a panel type)? The layout falls back to the default 3-in-a-row configuration with a notification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to drag any panel by its header to a different position in the workspace grid.
- **FR-002**: The system MUST show a visual drop zone indicator when a panel is dragged over a valid target position.
- **FR-003**: The system MUST prevent panels from being dropped outside the valid grid area, returning them to their original position if released in an invalid zone.
- **FR-004**: Users MUST be able to resize adjacent panels by dragging the shared divider between them.
- **FR-005**: The system MUST enforce a minimum panel size so no panel can be made too small to use.
- **FR-006**: Users MUST be able to select from a set of predefined grid layout presets (e.g., 3-in-a-row, 2-left-1-right, 1-left-2-right, 2-top-1-bottom, equal split).
- **FR-007**: The system MUST rearrange all visible panels when a new layout preset is applied, without closing or destroying any panel's content.
- **FR-008**: Users MUST be able to close individual panels from the panel header, causing neighboring panels to expand into the freed space.
- **FR-009**: Users MUST be able to reopen closed panels from a panel visibility menu or toolbar.
- **FR-010**: The system MUST persist the current layout (panel positions, sizes, and visibility) across page reloads and application restarts.
- **FR-011**: The system MUST prevent closing the last remaining visible panel.
- **FR-012**: When a layout preset is applied that has fewer slots than open panels, the system MUST stack or tab overflow panels within available cells rather than hiding them.

### Key Entities

- **Panel**: A discrete workspace section displaying a specific tool or view (e.g., terminal, file browser, diff viewer, session output). Has a type, position, size, and visibility state.
- **Grid Layout**: The overall arrangement of panels in rows and columns. Can be a preset template or a custom configuration resulting from user drag-and-drop.
- **Layout Preset**: A named, predefined grid configuration (e.g., "2+1 Split", "Equal 3-Column") that the user can select from a picker.
- **Panel Cell**: A slot in the grid that one or more panels can occupy. Can be empty, contain one panel, or stack multiple panels as tabs.
- **Divider**: The resizable border between adjacent panel cells. Dragging a divider redistributes space between neighboring panels.
- **Saved Layout State**: The persisted snapshot of the full grid configuration, including each panel's position, size, and visibility — restored on next launch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can drag any panel to a new position and see it land correctly in under 1 second from release.
- **SC-002**: Users can switch between layout presets with visible rearrangement completing in under 500 milliseconds.
- **SC-003**: Panel positions, sizes, and visibility are fully restored after a page reload or application restart — no manual reconfiguration needed.
- **SC-004**: At least 5 predefined layout presets are available, covering the most common split configurations (equal columns, 2+1, 1+2, stacked rows, mixed).
- **SC-005**: No panel content is lost or reset when a drag, resize, or layout switch operation is performed.
- **SC-006**: The layout system works correctly across all screen sizes supported by the application — from standard laptop screens (1280px wide) to large desktop monitors.
- **SC-007**: 90% of users can rearrange panels to their preferred layout without needing documentation or tooltips.

## Assumptions

- The existing panel system has a defined set of panel types (terminal, file browser, session output, diff viewer, browser preview, etc.) — the new layout system must support all of them.
- The current default layout (3 panels in a row) is preserved as one of the available presets.
- Panels are identified by type, not by instance, so each panel type appears at most once in the grid at a time.
- Layout state is stored locally per user session (not synced across multiple devices or browser tabs simultaneously).
- The feature targets mouse/trackpad interaction; touch-screen drag-and-drop is out of scope for this version.
- Panel tabs (stacking multiple panels in one cell) is a fallback for overflow — primary interaction is one panel per cell.
