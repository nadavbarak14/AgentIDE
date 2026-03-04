# Feature Specification: Session Permission Flags

**Feature Branch**: `020-session-permissions`
**Created**: 2026-03-03
**Status**: Clarified
**Input**: User description: "I want a way to add option to run skip permissions for safely, what are the good ways we can do and add to our project when starting a session?"

## Clarifications

### Session 2026-03-03

- Q: Should permission selection use a mode dropdown, simple flag toggles, or a single toggle? → A: Free-form flags input — let users write/choose CLI flags that get passed to the Claude process at session start.
- Q: What is the MVP scope for the first iteration? → A: P1 (flags text field) + P2 (predefined quick-select options). P3 (default flags in settings) and P4 (visual indicators on session tiles) are deferred to a future iteration.
- Q: Where should the flags input appear in the session creation flow? → A: Inline on the existing session creation area, always visible alongside working directory and title fields. Users who don't need it simply leave it blank.
- Q: Which predefined flags should appear as quick-select options? → A: The existing session options (worktree / clean start) plus `--dangerously-skip-permissions`. The existing checkboxes for "Use worktree" and "Start fresh" should be unified into the same flags UX pattern alongside the new permissions flag.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write CLI Flags When Starting a Session (Priority: P1)

A user is about to start a new coding session. On the session creation area — inline alongside the working directory and title fields — they see a flags input field where they can type CLI flags (e.g., `--dangerously-skip-permissions`) that control how the AI agent behaves. The flags are passed directly to the spawned Claude process. The user can type any supported flag, giving them full control over the session's permission behavior. If they don't need special flags, they simply leave the field blank and the session starts with default behavior.

**Why this priority**: This is the core value of the feature. Users get direct, flexible control over session behavior using the same flags they would use on the command line.

**Independent Test**: Can be fully tested by typing a flag (e.g., `--dangerously-skip-permissions`) into the flags field, starting a session, and verifying the Claude process was spawned with that flag applied.

**Acceptance Scenarios**:

1. **Given** a user is on the session creation screen, **When** they type `--dangerously-skip-permissions` in the flags field and start a session, **Then** the session launches and the AI agent executes tool actions without prompting for user approval.
2. **Given** a user is on the session creation screen, **When** they leave the flags field empty and start a session, **Then** the session launches with default behavior (prompts for approval on restricted actions).
3. **Given** a user types multiple flags separated by spaces, **When** they start a session, **Then** all specified flags are passed to the Claude process.

---

### User Story 2 - Choose Flags from a Predefined List (Priority: P2)

A user may not remember the exact flag names or syntax. The system offers a set of commonly used flags as selectable options (e.g., checkboxes or clickable chips) alongside the free-form input. The predefined options include the existing session options — "Use worktree" (`--worktree`) and "Start fresh/clean" (no `--continue`) — unified into the same flags UX pattern alongside the new "Skip Permissions" (`--dangerously-skip-permissions`) option. The user can click to toggle a flag or type one manually. This makes the feature accessible and consolidates all session launch options into one consistent interface.

**Why this priority**: Lowers the barrier to entry and unifies the existing scattered checkboxes (worktree, clean start) with the new permissions flag into one cohesive flags interface.

**Independent Test**: Can be fully tested by clicking a predefined flag option, verifying it appears in the flags field, and starting a session to confirm it is applied.

**Acceptance Scenarios**:

1. **Given** a user is on the session creation screen, **When** they click the "Skip Permissions" quick-select option, **Then** the corresponding flag (e.g., `--dangerously-skip-permissions`) is added to the flags field.
2. **Given** a user clicks the "Worktree" quick-select option, **When** they start the session, **Then** the session is launched in worktree mode (same behavior as the existing worktree checkbox).
3. **Given** a user clicks the "Clean Start" quick-select option, **When** they start the session, **Then** the session launches fresh without continuing a previous conversation.
4. **Given** a user has selected a predefined flag, **When** they also type an additional flag manually, **Then** both flags are included when the session starts.
5. **Given** a user clicks a predefined flag that is already selected, **When** they click it again, **Then** the flag is removed (toggle behavior).

---

### User Story 3 - Set Default Flags for All Sessions (Priority: P3 — Deferred)

A power user who always starts sessions with the same flags does not want to type them every time. They go to the global settings page and configure default flags. All new sessions automatically include these flags unless the user removes them at session creation time.

**Why this priority**: Reduces repetitive input for users who consistently use the same flags. Builds on P1 by adding a "set once, use everywhere" convenience.

**Independent Test**: Can be fully tested by setting default flags in settings, then creating a new session and verifying the flags field is pre-populated.

**Acceptance Scenarios**:

1. **Given** a user has set `--dangerously-skip-permissions` as a default flag in settings, **When** they open the session creation screen, **Then** the flags field is pre-populated with `--dangerously-skip-permissions`.
2. **Given** a user has default flags set, **When** they remove a flag from the field at session creation time, **Then** the session launches without that flag (per-session override).
3. **Given** a user changes the default flags in settings, **When** the change is saved, **Then** subsequently created sessions use the new defaults (existing running sessions are unaffected).

---

### User Story 4 - See Active Flags on Running Sessions (Priority: P4 — Deferred)

A user has multiple sessions running and wants to quickly see which flags each session was started with. The active flags are visually indicated on each session tile so the user can distinguish at a glance which sessions are running with special permissions.

**Why this priority**: Provides situational awareness. Users managing multiple sessions need to know which ones are running with relaxed permissions.

**Independent Test**: Can be fully tested by starting two sessions with different flags and verifying that each session's tile displays its active flags.

**Acceptance Scenarios**:

1. **Given** a session was started with `--dangerously-skip-permissions`, **When** the user views the session grid, **Then** the session tile displays a visible indicator (e.g., a badge or icon) showing that permissions are skipped.
2. **Given** a session was started with no special flags, **When** the user views the session grid, **Then** the session tile shows no special permission indicator.

---

### Edge Cases

- What happens if the user types an invalid or unrecognized flag? The system should pass it to the Claude process as-is and let Claude handle the error (the system does not validate flag names itself).
- What happens when the user changes default flags while sessions are already running? Only new sessions should be affected; running sessions retain their original flags.
- What happens if a remote worker session is started with `--dangerously-skip-permissions`? The system should show a warning that skipping permissions on a remote machine carries additional risk.
- What happens if the flags field contains duplicate flags? The system should deduplicate before passing to the Claude process.
- What happens if the user types flags with values (e.g., `--allowedTools "Read,Grep"`)? The system should correctly parse and pass flag-value pairs to the Claude process.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a flags input field on the session creation interface where users can type CLI flags.
- **FR-002**: System MUST pass all user-specified flags to the Claude process when spawning a session.
- **FR-003**: System MUST offer a set of predefined, commonly used flags as quick-select options alongside the free-form input.
- **FR-004** *(Deferred)*: System MUST allow users to configure default flags in global settings that pre-populate the flags field for new sessions.
- **FR-005** *(Deferred)*: System MUST allow per-session flag overrides (adding or removing flags) that take precedence over defaults.
- **FR-006** *(Deferred)*: System MUST persist the user's default flags preference across application restarts.
- **FR-007** *(Deferred)*: System MUST display the active flags (or a summarized indicator) on each session tile in the session grid.
- **FR-008**: System MUST show a warning when the user includes flags that skip permissions (e.g., `--dangerously-skip-permissions`), informing them of the security implications.
- **FR-009**: System MUST deduplicate flags before passing them to the Claude process.
- **FR-010**: System MUST correctly handle flags with values (e.g., `--allowedTools "Read,Grep"`), preserving the flag-value association.

### Key Entities

- **Session Flags**: The set of CLI flags associated with a session. Attributes: raw flag string, parsed flag list, source (user-entered vs. default).
- **Default Flags**: The user's globally configured default flags. Attributes: flag string, last updated timestamp.
- **Predefined Flag**: A system-provided flag option shown as a quick-select. Attributes: display label, flag value, description, warning level (normal, caution). MVP set: "Skip Permissions" (`--dangerously-skip-permissions`, caution), "Worktree" (`--worktree`, normal), "Clean Start" (start fresh / no `--continue`, normal).

## Assumptions

- The underlying AI agent (Claude Code) accepts CLI flags that control permission behavior (e.g., `--dangerously-skip-permissions`, `--allowedTools`).
- The system does not validate flag names — invalid flags are passed through and Claude handles any errors.
- The existing `autoApprove` boolean setting in the database will be replaced by the richer default flags string.
- Predefined quick-select flags will include: `--dangerously-skip-permissions`, `--worktree`, and clean start (no `--continue`). The existing separate checkboxes for worktree and clean start will be consolidated into this unified flags interface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can add flags and start a session in under 5 seconds, with no additional configuration steps required.
- **SC-002**: 100% of user-specified flags are correctly passed to the spawned Claude process.
- **SC-003**: Users can visually identify the permission-related flags of any running session within 2 seconds of viewing the session grid.
- **SC-004**: Pre-populated default flags reduce the number of keystrokes needed to start a commonly configured session by at least 80%.
- **SC-005**: The predefined flags quick-select allows users to add a flag with a single click (no typing required).
