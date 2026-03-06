# Feature Specification: CLI Session Flags Redesign

**Feature Branch**: `026-cli-session-flags`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "about the flags for creating a sessions. lets change that by default it create a new, without flags just claude. replace clean start with continue latest which is -c. make sure these flags work. also, add an option to choose from sessions. after selecting a folder, if there are claude conversations there, we can show and have option to select one. if we select one, it resumes this session."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Default New Session (Priority: P1)

When a user creates a session through the UI without toggling any flags, the system spawns a fresh Claude conversation (no `--continue` flag). This is the simplest, most common path — just start working.

**Why this priority**: This is the default behavior every user encounters. Getting it right is essential since it changes the current default (which uses `--continue`).

**Independent Test**: Can be tested by creating a session in the UI with no flags toggled and verifying Claude starts a brand-new conversation without resuming any prior session.

**Acceptance Scenarios**:

1. **Given** a user fills in a title and directory, **When** they click "Create Session" with no flags toggled, **Then** the system spawns Claude without `--continue` (a fresh conversation).
2. **Given** a directory that has prior Claude conversations, **When** the user creates a session with no flags, **Then** a new conversation is started regardless of existing conversations.
3. **Given** the current "Clean Start" flag exists in the UI, **When** this feature is deployed, **Then** the "Clean Start" toggle is removed and replaced with "Continue Latest" (`-c`).

---

### User Story 2 - Continue Latest Session (Priority: P1)

A user can toggle a "Continue Latest" flag (mapped to `-c` / `--continue`) to resume the most recent Claude conversation in the selected directory, instead of starting fresh.

**Why this priority**: Resuming the latest conversation is a core workflow — users frequently want to pick up where they left off.

**Independent Test**: Can be tested by toggling the "Continue Latest" flag, creating a session, and verifying Claude resumes the most recent conversation in that directory.

**Acceptance Scenarios**:

1. **Given** a user selects a directory with existing Claude conversations, **When** they toggle "Continue Latest" and create a session, **Then** Claude starts with the `--continue` flag and resumes the most recent conversation.
2. **Given** a user selects a directory with no prior conversations, **When** they toggle "Continue Latest" and create a session, **Then** Claude starts a new conversation (since there is nothing to continue).
3. **Given** the "Continue Latest" flag fails (Claude exits quickly with non-zero), **When** the system detects the failure, **Then** it retries without `--continue` (existing retry logic is preserved).

---

### User Story 3 - Resume with Session Picker (Priority: P2)

A user can toggle a "Resume" flag that spawns Claude with `--resume` (no arguments), which opens Claude's built-in interactive session picker in the terminal. This lets users browse and select from their previous conversations directly within the Claude CLI interface.

**Why this priority**: Adds significant value for power users who have multiple conversations per project. Leverages Claude's own picker instead of building a custom UI.

**Independent Test**: Can be tested by toggling the "Resume" flag, creating a session, and verifying Claude spawns with `--resume` and shows its interactive session picker in the terminal.

**Acceptance Scenarios**:

1. **Given** a user has selected a directory in the session creation form, **When** they toggle "Resume" and create a session, **Then** the system spawns Claude with the `--resume` flag (no arguments), presenting Claude's interactive session picker in the terminal.
2. **Given** the user is viewing the terminal after toggling "Resume", **When** Claude's picker appears, **Then** the user can navigate and select a previous conversation to resume directly in the terminal.
3. **Given** a directory with no prior Claude conversations, **When** the user toggles "Resume" and creates a session, **Then** Claude's picker shows an empty list or starts a new conversation.

---

### Edge Cases

- What happens when the user toggles both "Continue Latest" and "Resume"? Only one can be active at a time — toggling one deactivates the other.
- What happens when `--resume` is used on a remote worker? The interactive picker runs in the remote terminal session, same as local.
- What happens when the user interacts with Claude's picker and cancels? Claude exits and the session is cleaned up normally (existing exit handling).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST spawn Claude without the `--continue` flag by default when creating a new session with no special flags toggled.
- **FR-002**: The system MUST provide a "Continue Latest" toggle in the session creation form that maps to the `--continue` flag.
- **FR-003**: The "Clean Start" toggle MUST be removed from the UI, since the default behavior is now a clean start.
- **FR-004**: When "Continue Latest" is toggled, the system MUST pass `--continue` to the Claude process on spawn.
- **FR-005**: The existing retry logic (if `--continue` fails within 30 seconds, retry without it) MUST be preserved.
- **FR-006**: The system MUST provide a "Resume" toggle in the session creation form that maps to the `--resume` flag (no arguments).
- **FR-007**: When "Resume" is toggled, the system MUST pass `--resume` to the Claude process on spawn, triggering Claude's built-in interactive session picker.
- **FR-008**: "Continue Latest" and "Resume" MUST be mutually exclusive — toggling one deactivates the other.
- **FR-009**: All existing session creation workflows (worktree, skip permissions, custom flags) MUST continue working unchanged.

### Key Entities

- **Session Flag**: A toggle or option that modifies how Claude is spawned (e.g., `--continue`, `--resume`, `--worktree`, `--dangerously-skip-permissions`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new session with default settings (no flags) and get a fresh Claude conversation 100% of the time.
- **SC-002**: Users can toggle "Continue Latest" and successfully resume their most recent conversation in the selected directory.
- **SC-003**: Users can toggle "Resume" and see Claude's interactive session picker in the terminal.
- **SC-004**: All existing session creation workflows (worktree, skip permissions, custom flags) continue working unchanged.

## Assumptions

- Claude CLI supports `--resume` (no arguments) to open an interactive session picker.
- Claude CLI supports `--continue` to resume the most recent conversation.
- The interactive picker from `--resume` runs within the terminal and works with the existing PTY/xterm.js setup.
