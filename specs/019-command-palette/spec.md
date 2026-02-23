# Feature Specification: Command Palette

**Feature Branch**: `019-command-palette`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "Add a command palette with keyboard-first navigation. Use existing Ctrl+. chord system (e.g., Ctrl+. H for help). Include a visible UI button that teaches users the shortcut. Focus on keyboard control as a first-class experience."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open and Execute Commands via Keyboard (Priority: P1)

As a user, I want to press a keyboard shortcut to open a searchable command palette, type a few characters to filter available commands, and press Enter to execute one — all without touching my mouse.

**Why this priority**: The command palette is the core feature. Without it, nothing else matters. Keyboard-first execution of commands is the primary value proposition.

**Independent Test**: Can be fully tested by pressing `Ctrl+. H`, verifying the palette opens, typing a filter term, selecting a command with arrow keys, and pressing Enter to execute it.

**Acceptance Scenarios**:

1. **Given** the user is anywhere in the IDE, **When** they press `Ctrl+. H`, **Then** a command palette overlay appears centered on screen with a text input focused and ready to type
2. **Given** the command palette is open, **When** the user types characters, **Then** the command list filters in real-time to show only matching commands (matching against command name and description)
3. **Given** the command palette shows filtered results, **When** the user presses Up/Down arrows, **Then** the selection highlight moves between commands
4. **Given** a command is highlighted in the palette, **When** the user presses Enter, **Then** the command executes immediately and the palette closes
5. **Given** the command palette is open, **When** the user presses Escape, **Then** the palette closes without executing anything

---

### User Story 2 - Visible Button That Teaches the Shortcut (Priority: P2)

As a new user who doesn't know about keyboard shortcuts, I want to see a visible button in the UI that opens the command palette and shows me the keyboard shortcut, so I can discover and learn the shortcut over time.

**Why this priority**: Discoverability is critical for adoption. A hidden shortcut that nobody knows about provides no value. The button bridges new users into keyboard-first workflows.

**Independent Test**: Can be tested by visually confirming the button is visible in the top bar, clicking it to open the palette, and verifying the shortcut hint is displayed on the button.

**Acceptance Scenarios**:

1. **Given** the user is on the dashboard, **When** they look at the top bar, **Then** they see a button with a recognizable icon (e.g., a command/search icon) and the shortcut hint `Ctrl+. H` displayed as a keyboard badge
2. **Given** the user clicks the button, **When** the palette opens, **Then** it behaves identically to the keyboard-triggered palette
3. **Given** the user hovers over the button, **When** a tooltip appears, **Then** it reads "Command Palette (Ctrl+. H)"

---

### User Story 3 - Complete Command Registry (Priority: P3)

As a user, I want the command palette to list ALL available actions in the IDE — panel toggles, session actions, navigation, and any other commands — so it serves as a single place to discover and execute everything.

**Why this priority**: The palette's value grows with the number of commands it exposes. A palette with only a few commands isn't worth opening. This story ensures completeness.

**Independent Test**: Can be tested by opening the command palette with an empty filter and verifying that every existing keyboard shortcut action appears in the list, plus any additional commands not bound to shortcuts.

**Acceptance Scenarios**:

1. **Given** the palette is open with an empty filter, **When** the user scrolls through the list, **Then** they see all existing shortcut actions (Toggle Files, Toggle Git, Toggle Preview, Toggle Claude, Toggle Issues, Toggle Shell, Focus Next/Previous, Zoom Session, Kill Session, Search Files, Show Shortcuts Help) AND all button-only actions (Toggle Sidebar, Open Settings, Toggle Terminal Position, Decrease Font Size, Increase Font Size, Pin/Unpin Session, Continue Session, New Session, Toggle Explorer/Search)
2. **Given** a command has a keyboard shortcut, **When** it appears in the palette list, **Then** its shortcut key is displayed as a right-aligned badge (e.g., `E` for Toggle Files). Commands without shortcuts show no badge.
3. **Given** the user executes any command from the palette, **Then** the effect is identical to clicking the corresponding button or pressing the shortcut directly

---

### Edge Cases

- What happens when the palette is open and the user presses `Ctrl+. H` again? The palette should close (toggle behavior).
- What happens when no commands match the filter? A "No matching commands" message should appear with the filter text highlighted.
- What happens when the palette is open and the user clicks outside it? The palette should close.
- What happens when the terminal has focus and `Ctrl+. H` is pressed? The chord system should intercept it before the terminal, consistent with how all other `Ctrl+.` chords work today.
- What happens when the user has customized keybindings? The palette should reflect the user's custom keys, not the defaults.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a command palette overlay that opens via the keyboard chord `Ctrl+. H`
- **FR-002**: The palette MUST include a text input field that is auto-focused on open, allowing immediate typing to filter commands
- **FR-003**: Filtering MUST be case-insensitive and match against both the command name and its category/description
- **FR-004**: The palette MUST support full keyboard navigation: Up/Down arrows to move selection, Enter to execute, Escape to dismiss
- **FR-005**: The palette MUST close immediately after a command is executed
- **FR-006**: A visible button MUST be displayed in the dashboard top bar that opens the command palette when clicked
- **FR-007**: The button MUST display the shortcut hint `Ctrl+. H` as a keyboard badge so users learn the shortcut
- **FR-008**: The palette MUST list ALL executable actions in the IDE — both keyboard shortcut actions AND button-only actions that have no shortcut. This includes at minimum: all existing chord shortcuts, plus Toggle Sidebar, Open Settings, Toggle Terminal Position, Decrease Font Size, Increase Font Size, Pin/Unpin Session, Continue Session, New Session, and Toggle Explorer/Search view. Each command displays its name, category, and shortcut key (if any)
- **FR-009**: Commands displayed in the palette MUST reflect the user's custom keybindings (if any), not just the defaults
- **FR-010**: Pressing `Ctrl+. H` while the palette is open MUST close it (toggle behavior)
- **FR-011**: Clicking outside the palette MUST close it
- **FR-012**: The palette MUST integrate with the existing chord system — opening the palette should disarm the chord state, and executing a command from the palette should produce the same effect as pressing the shortcut directly

### Key Entities

- **Command**: A single executable action with a name, category (e.g., "Panels", "Navigation", "Session Actions", "View", "Settings"), an optional keyboard shortcut, and an execute function. Commands may originate from the chord shortcut system OR from UI buttons that have no shortcut.
- **Command Registry**: The complete, centralized list of all available commands that the palette can display and execute. Any new button or action added to the IDE in the future MUST also be registered in the command registry so it appears in the palette.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open the command palette and execute any command in under 3 seconds (shortcut → type filter → Enter)
- **SC-002**: 100% of executable actions in the IDE (both shortcut-bound and button-only) are discoverable through the command palette
- **SC-003**: New users can find and use the command palette within 10 seconds of first seeing the dashboard (via the visible button)
- **SC-004**: The palette appears in under 200 milliseconds after the shortcut is pressed — it must feel instant
- **SC-005**: Zero regressions to existing keyboard shortcuts — all `Ctrl+.` chords continue to work exactly as before

## Assumptions

- `Ctrl+. H` is not currently bound to any action (verified: `H` is available in the chord map)
- The command palette is a frontend-only feature — no backend changes or new API endpoints needed
- The palette does not replace the existing Shortcuts Help modal (`Ctrl+. ?`) — both coexist, with the palette focused on execution and the help modal focused on viewing/customizing bindings
- The palette only contains actions that can be executed in the current context (e.g., session-specific actions require an active session)
- No fuzzy matching is required — simple substring matching is sufficient for the initial implementation
- The command palette does not persist any state — it opens fresh each time
