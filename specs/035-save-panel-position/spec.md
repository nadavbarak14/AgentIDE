# Feature Specification: Save Panel Position

**Feature Branch**: `035-save-panel-position`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "claude code position whenever something else is opened is default up and left, and saved when going in and out. exact panel view should be saved"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Terminal Stays in Top Zone When Panels Open (Priority: P1)

When a user opens a side panel (files, git, preview, issues, or any extension panel), the Claude Code terminal should remain in the top zone of the layout instead of being pushed to the bottom. Currently, the terminal auto-moves from `center` (top zone, horizontal alongside panels) to `bottom` (below panels, full-width) whenever any panel opens. The new default should keep the terminal in the top zone so it shares horizontal space with the opened panels — files on the left, terminal in the center/left area, other panels on the right.

**Why this priority**: This is the core behavior change. Users lose their context and workspace flow when the terminal jumps to the bottom every time they open a panel. Keeping it in the top zone preserves the spatial arrangement they expect.

**Independent Test**: Can be fully tested by opening any side panel and verifying the Claude Code terminal stays in the top horizontal zone rather than moving to the bottom.

**Acceptance Scenarios**:

1. **Given** the Claude Code terminal is centered (no panels open), **When** the user opens the file browser panel, **Then** the terminal stays in the top zone with files on its left and terminal taking the remaining horizontal space.
2. **Given** the Claude Code terminal is centered (no panels open), **When** the user opens the git or preview panel, **Then** the terminal stays in the top zone with the panel appearing to its right.
3. **Given** the terminal is in the top zone with panels open, **When** the user closes all side panels, **Then** the terminal returns to its centered full-space position.
4. **Given** the user has manually moved the terminal to the bottom position, **When** the user opens/closes panels, **Then** the system respects this manual override and does not auto-reposition.

---

### User Story 2 - Persist Exact Panel Layout When Toggling Panels (Priority: P1)

When a user has arranged their panels in a specific configuration (specific widths, heights, positions) and then closes a panel, the system must remember that exact layout. When the user reopens the same panel, the layout should restore to exactly what it was before — same widths, same heights, same positions. This includes persisting across session re-entries (leaving and returning to a session).

**Why this priority**: Equally critical to the default positioning. Without persistence, users would need to manually resize and rearrange panels every time they toggle a panel, which is extremely disruptive to their workflow.

**Independent Test**: Can be tested by arranging panels to a specific layout, closing a panel, reopening it, and verifying the layout matches the previous arrangement.

**Acceptance Scenarios**:

1. **Given** the user has the terminal at 60% width and preview panel at 40% width, **When** the user closes the preview panel and then reopens it, **Then** the layout restores to terminal at 60% and preview at 40%.
2. **Given** the user has resized panels to custom dimensions, **When** the user navigates away from the session and returns later, **Then** the exact layout is restored from persistent storage.
3. **Given** the user has a three-zone layout (files left, terminal center, git right) with specific widths, **When** the user closes and reopens the git panel, **Then** all three zones return to their previous widths.

---

### User Story 3 - Per-Panel-Combination Layout Memory (Priority: P2)

The system should remember different layouts for different panel combinations. For example, the layout when only the files panel is open should be independent of the layout when files + git panels are open.

**Why this priority**: Enhances the experience beyond basic persistence. Users often switch between different panel configurations and want each to have its own optimized layout.

**Independent Test**: Can be tested by setting up distinct layouts for two different panel combinations and verifying they are recalled independently.

**Acceptance Scenarios**:

1. **Given** the user sets terminal to 50% width with only the files panel open, and separately sets terminal to 30% width when both files and git panels are open, **When** the user switches between these two panel combinations, **Then** each combination restores its own saved layout.
2. **Given** a layout was saved for the "files only" combination, **When** the user opens a panel combination that has never been configured before, **Then** the system uses sensible defaults.

---

### Edge Cases

- What happens when the screen is resized after a layout is restored? The system should clamp panel sizes to respect minimum width/height constraints while maintaining proportions.
- What happens on mobile devices? Mobile layout should remain unchanged — panels are not shown side-by-side on mobile, so position saving does not apply.
- What happens when Claude Code is the only panel and the user hasn't opened anything else? Claude Code remains centered as it does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST keep the Claude Code terminal in the top zone (horizontal layout with panels) when any side panel is opened, instead of auto-moving it to the bottom zone.
- **FR-002**: System MUST return the Claude Code terminal to its centered full-space position when all side panels are closed.
- **FR-003**: System MUST save the exact panel layout (widths, heights, positions) whenever the user modifies it (resize, toggle).
- **FR-004**: System MUST restore the previously saved panel layout when the user reopens a panel that was previously open.
- **FR-005**: System MUST persist panel layouts across session navigation (leaving and returning to a session).
- **FR-006**: System MUST respect minimum panel size constraints when restoring saved layouts.
- **FR-007**: System SHOULD remember separate layouts for different panel combinations (e.g., "files only" vs "files + git").
- **FR-008**: System MUST NOT alter the existing mobile layout behavior.
- **FR-009**: System MUST allow users to manually move the terminal to the bottom position, and that override should be respected.

### Key Entities

- **Panel Layout State**: The complete arrangement of panels for a given session — which panels are open, their positions, and their size percentages.
- **Panel Combination Key**: An identifier for a specific set of open panels (e.g., "files", "files+git") used to look up the saved layout for that combination.
- **Layout Snapshot**: A capture of panel dimensions for a specific combination, stored for later restoration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a side panel is opened, the Claude Code terminal remains in the top zone without visible layout jump or flash.
- **SC-002**: After closing and reopening any panel, the restored layout matches the previously saved layout with exact percentage values.
- **SC-003**: Panel layouts persist across page reloads and session re-entries.
- **SC-004**: 100% of existing panel operations (open, close, resize, toggle) continue to work without regression.
- **SC-005**: Mobile layout remains completely unchanged by this feature.

## Assumptions

- "Up" means the terminal stays in the top zone (horizontal layout alongside panels) rather than moving to the bottom zone. The existing left/right panel arrangement is preserved — files on the left, terminal center, git/preview on the right.
- The existing panel state persistence infrastructure (database table, API endpoints, auto-save debouncing) will be extended rather than replaced.
- "Going in and out" refers to toggling panels open and closed within a session, as well as leaving and returning to a session.
- Per-panel-combination memory (User Story 3 / FR-007) is a SHOULD requirement — core value is delivered by Stories 1 and 2 alone.
