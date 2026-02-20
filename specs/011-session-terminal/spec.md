# Feature Specification: Session Terminal

**Feature Branch**: `011-session-terminal`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "We need to implement a terminal option also for each session, can be bash/cmd depends on OS i guess. do we even support windows? if not thats fine just to know"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a Bash Terminal Alongside Claude Session (Priority: P1)

As a developer using ClaudeQueue, I want to open a general-purpose bash terminal within my active session so that I can run commands, inspect files, and test code changes without leaving the session context.

Currently, each session has a terminal that runs the Claude CLI process. Users need a way to also have a standard shell terminal (bash on Linux/macOS) tied to the same session, operating in the same working directory.

**Why this priority**: This is the core feature — without a shell terminal, users must switch to an external terminal application to run commands, breaking their workflow and losing context.

**Independent Test**: Can be fully tested by opening a session, launching a bash terminal panel, running standard shell commands (ls, git status, npm test), and verifying output appears correctly.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the user opens the terminal option, **Then** a bash shell terminal appears within the session interface, starting in the session's working directory.
2. **Given** an active session with a bash terminal open, **When** the user types a command and presses Enter, **Then** the command executes and output is displayed in real-time.
3. **Given** an active session, **When** the user opens the terminal, **Then** the bash terminal appears as a separate panel below the Claude terminal, and both are accessible simultaneously.

---

### User Story 2 - Terminal Persists Across Session Views (Priority: P2)

As a developer, I want my bash terminal session to remain active when I navigate away from the session card and return, so that I don't lose running processes or command history.

**Why this priority**: Without persistence, the terminal would reset every time a user switches between sessions, destroying running processes and losing context — making it impractical for real work.

**Independent Test**: Can be tested by opening a terminal, running a long-running command (e.g., `sleep 60`), switching to another session, returning, and verifying the command is still running and previous output is visible.

**Acceptance Scenarios**:

1. **Given** a session with an active bash terminal running a command, **When** the user navigates away and returns to the session, **Then** the terminal output history is preserved and the process is still running.
2. **Given** a session with a bash terminal, **When** the session is auto-suspended and later continued, **Then** the user is informed that the previous shell session was terminated, and a new terminal can be opened.

---

### User Story 3 - Terminal Auto-Detects Shell Based on OS (Priority: P3)

As a developer working on macOS or Linux, I want the terminal to automatically use the appropriate default shell for my operating system so that I don't need to configure it manually.

**Why this priority**: Reasonable default behavior avoids manual configuration for the majority of users. The platform is Linux/macOS only, so bash/zsh detection covers all supported environments.

**Independent Test**: Can be tested by checking that the spawned shell matches the system's default shell (e.g., `/bin/bash` on Linux, `/bin/zsh` on macOS).

**Acceptance Scenarios**:

1. **Given** a Linux host system, **When** a session terminal is opened, **Then** the terminal uses the user's default shell (typically bash).
2. **Given** a macOS host system, **When** a session terminal is opened, **Then** the terminal uses the user's default shell (typically zsh).

---

### Edge Cases

- What happens when the user closes and reopens the bash terminal quickly? The previous shell process should be cleaned up before spawning a new one.
- How does the system handle a shell that crashes or exits unexpectedly? The UI should indicate the terminal has stopped and offer to restart it.
- What happens when the session's working directory no longer exists (e.g., deleted externally)? The shell should fall back to the user's home directory and display a warning.
- What happens when multiple browser clients view the same session? All clients should see the same terminal output (shared PTY, same as the existing Claude terminal behavior).
- What if a user runs a resource-intensive process in the bash terminal? There is no additional resource limiting beyond what the OS provides — the shell runs as the same user as the server.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an optional way for users to open a general-purpose shell terminal within an active session (not opened by default).
- **FR-002**: The shell terminal MUST start in the session's configured working directory.
- **FR-003**: The shell terminal MUST use the system's default shell (detected from the `SHELL` environment variable, falling back to `/bin/bash`).
- **FR-004**: The shell terminal MUST support real-time bidirectional input/output (user types commands, sees output immediately).
- **FR-005**: The shell terminal MUST appear as a separate panel below the Claude terminal by default, consistent with the existing panel system. Both must be accessible without closing either.
- **FR-006**: The shell terminal output MUST be persisted (scrollback) so that returning to a session restores previous output.
- **FR-007**: The shell terminal process MUST be terminated when the session is suspended or completed.
- **FR-008**: The shell terminal MUST be shareable across multiple connected clients (same as existing Claude terminal behavior).
- **FR-009**: System MUST allow the user to restart a terminated shell terminal without restarting the session.
- **FR-010**: The shell terminal MUST support terminal resize when the UI panel is resized.

### Key Entities

- **Shell Terminal**: A general-purpose OS shell (bash/zsh) instance tied to a specific session. Represents a user's command-line workspace alongside the Claude conversation. Has its own PTY process, scrollback history, and lifecycle independent of the Claude process.
- **Session**: Extended to support an optional shell terminal in addition to the existing Claude terminal. A session may have zero or one active shell terminal at any time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open a shell terminal within 1 second of requesting it.
- **SC-002**: Shell command output appears with no perceptible delay (under 100ms latency from execution to display).
- **SC-003**: Terminal scrollback history is fully preserved when navigating away from and returning to a session.
- **SC-004**: The shell terminal uses the correct default shell for the host OS on 100% of supported platforms (Linux, macOS).
- **SC-005**: Both the Claude terminal and shell terminal are usable simultaneously without one blocking or interfering with the other.

## Clarifications

### Session 2026-02-20

- Q: Is the shell terminal mandatory for every session or optional? → A: Optional — the terminal is an opt-in feature the user can choose to open, not automatically present in every session.
- Q: How should the shell terminal be laid out relative to the Claude terminal? → A: Separate panel below the Claude terminal by default, similar to the existing panel system. Not tabs or split — its own distinct panel.

## Assumptions

- **Platform scope**: Linux and macOS only. Windows is not supported and no Windows-specific shell detection (cmd/PowerShell) is needed.
- **Shell detection**: The system will read the `SHELL` environment variable to determine the user's preferred shell, falling back to `/bin/bash` if unset.
- **Resource limits**: No additional resource limiting is applied to the shell terminal beyond standard OS-level process controls.
- **Single terminal per session**: Each session supports at most one shell terminal instance at a time. Users who need multiple shells can open multiple sessions.
- **No custom shell configuration**: The shell terminal will inherit the user's standard shell configuration (`.bashrc`, `.zshrc`, etc.) — no ClaudeQueue-specific shell customization is provided.
- **Lifecycle coupling**: The shell terminal's lifecycle is coupled to the session — when the session ends or suspends, the shell process is terminated.
- **Opt-in only**: The shell terminal is not spawned automatically. Users explicitly choose to open it when needed.
