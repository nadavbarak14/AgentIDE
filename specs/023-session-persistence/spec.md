# Feature Specification: Session Persistence & Crash Recovery

**Feature Branch**: `023-session-persistence`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Make sure sessions are saved only if project crashed. Both remote and local sessions. Persistent between runs and when running again we will be attached again. For remote sessions for sure. For local sessions, we also need to have tmux-like behaviour really saving the sessions so after restart we can go back in. This feature needs good tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remote Session Survives Hub Crash (Priority: P1)

A user has 3 remote Claude sessions running on different workers. The hub process crashes unexpectedly. The remote Claude processes continue running on their respective workers (since they're separate machines). When the user restarts the hub, all 3 sessions appear in the dashboard in a "reconnecting" state. Within seconds, the hub re-establishes SSH tunnels to the workers, finds the still-running Claude processes, and reattaches to them. The user sees the sessions become active again with their terminal output continuing from where it left off.

**Why this priority**: Remote sessions are the highest-value recovery target because the Claude processes genuinely survive hub crashes (they run on separate machines). This is the most impactful and achievable recovery scenario.

**Independent Test**: Can be fully tested by starting a remote session, killing the hub process, restarting it, and verifying the session reconnects and shows continued output.

**Acceptance Scenarios**:

1. **Given** a hub with 3 active remote sessions, **When** the hub process crashes and restarts, **Then** all 3 sessions appear in the dashboard and reconnect to the still-running remote Claude processes.
2. **Given** a hub that just restarted after a crash, **When** a remote Claude process has finished while the hub was down, **Then** the session appears as completed with its final scrollback preserved.
3. **Given** a hub that crashes with a remote session, **When** the remote worker itself also crashed (process no longer running), **Then** the session is marked as "lost" with its last-known scrollback preserved for review.

---

### User Story 2 - Local Session Scrollback Recovery After Crash (Priority: P2)

A user has 2 local Claude sessions running. The hub process crashes. The local PTY processes are orphaned and eventually exit. When the user restarts the hub, the sessions appear in the dashboard marked as "crashed" with their full terminal scrollback preserved. The user can review what each session was doing when it crashed, see the output history, and decide whether to start a new session to continue the work.

**Why this priority**: Local PTY processes cannot survive a hub crash (they lose their controlling terminal), so full reattachment is not possible. However, preserving the scrollback and session metadata lets users understand what happened and resume work manually. This is the tmux-like "session history" behavior.

**Independent Test**: Can be tested by starting a local session, killing the hub process, restarting it, and verifying the session appears with its scrollback history intact.

**Acceptance Scenarios**:

1. **Given** a hub with 2 active local sessions, **When** the hub crashes and restarts, **Then** both sessions appear in the dashboard as "crashed" with their scrollback visible.
2. **Given** a crashed local session showing in the dashboard, **When** the user opens the session terminal, **Then** they see the full scrollback history from before the crash.
3. **Given** a crashed local session, **When** the user clicks "dismiss" or "close", **Then** the session is removed from the dashboard.

---

### User Story 3 - Clean Shutdown Preserves No Sessions (Priority: P2)

When the user intentionally stops the hub (Ctrl+C, process signal), sessions that completed normally should still be auto-deleted as they do today. Only sessions that were actively running at the time of an unexpected crash should be preserved for recovery.

**Why this priority**: This ensures the new persistence behavior doesn't interfere with the existing clean auto-delete workflow from feature 021. Users should not see stale sessions after a normal shutdown.

**Independent Test**: Can be tested by starting sessions, letting them complete, stopping the hub normally, restarting, and verifying no old sessions appear.

**Acceptance Scenarios**:

1. **Given** a hub with completed sessions, **When** the hub shuts down gracefully (SIGTERM/SIGINT), **Then** no sessions are preserved for recovery on next start.
2. **Given** a hub with active sessions, **When** the hub shuts down gracefully, **Then** active sessions are marked as completed and auto-deleted (existing behavior).
3. **Given** a hub that was shut down gracefully and restarted, **When** the user views the dashboard, **Then** no crashed or recovered sessions appear.

---

### User Story 4 - Comprehensive Test Coverage (Priority: P3)

The session persistence and recovery feature must have thorough automated tests covering all recovery scenarios, edge cases, and the distinction between crash vs. clean shutdown. Tests should cover both local and remote session recovery paths, scrollback preservation, and the UI states for recovered sessions.

**Why this priority**: The user explicitly requested good tests. This feature involves complex state management across crashes, so testing is critical to ensure reliability.

**Independent Test**: Can be verified by running the test suite and confirming all persistence/recovery scenarios pass.

**Acceptance Scenarios**:

1. **Given** the test suite, **When** tests run, **Then** all crash recovery scenarios for both local and remote sessions pass.
2. **Given** the test suite, **When** tests run, **Then** clean shutdown scenarios confirm no sessions are preserved.
3. **Given** the test suite, **When** edge cases run (worker unreachable, scrollback corrupted, concurrent crashes), **Then** the system degrades gracefully.

---

### Edge Cases

- What happens when the hub crashes during scrollback file write (partial/corrupt scrollback)?
- What happens when a remote worker is unreachable on hub restart (network partition)?
- What happens when the hub crashes and restarts multiple times in rapid succession?
- What happens when the hub crashes mid-session-creation (session in database but no PTY spawned yet)?
- What happens when scrollback files exceed available disk space?
- What happens when a remote Claude process exits between crash and restart but scrollback was not synced?
- What happens when two hub instances start simultaneously and both try to recover the same sessions?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST distinguish between a crash (unexpected exit) and a clean shutdown (SIGTERM/SIGINT signal).
- **FR-002**: On clean shutdown, the system MUST mark all active sessions as completed and auto-delete them (preserving existing feature 021 behavior).
- **FR-003**: On crash, the system MUST preserve all sessions that were in "active" status at the time of the crash, retaining their metadata and scrollback.
- **FR-004**: On hub restart after a crash, the system MUST detect that the previous shutdown was not clean and enter recovery mode.
- **FR-005**: In recovery mode, the system MUST attempt to reconnect to remote sessions by re-establishing SSH tunnels and locating still-running Claude processes on remote workers.
- **FR-006**: For remote sessions that are successfully reconnected, the system MUST resume real-time terminal output streaming as if no crash occurred.
- **FR-007**: For remote sessions where the Claude process has exited while the hub was down, the system MUST mark the session as completed and preserve the last-known scrollback.
- **FR-008**: For local sessions that were active during a crash, the system MUST preserve the scrollback file and display the session as "crashed" with the scrollback viewable.
- **FR-009**: Users MUST be able to dismiss/close crashed sessions from the dashboard.
- **FR-010**: The system MUST persist scrollback data to disk frequently enough that a crash loses at most a few seconds of terminal output.
- **FR-011**: The system MUST record a "clean shutdown" flag that distinguishes intentional stops from crashes.
- **FR-012**: The system MUST handle the case where a remote worker is unreachable during recovery by marking those sessions as "lost" rather than silently deleting them.
- **FR-013**: The system MUST clean up recovered sessions that the user has dismissed, including their scrollback files.
- **FR-014**: The system MUST support recovering sessions across multiple remote workers simultaneously.

### Key Entities

- **Session Recovery State**: Represents the state of a session during recovery — whether it is reconnecting, reconnected, crashed (scrollback preserved), or lost (worker unreachable).
- **Shutdown Record**: A persistent flag indicating whether the last hub shutdown was clean or a crash, used to decide whether to enter recovery mode on startup.
- **Scrollback Snapshot**: The persisted terminal output for a session, saved to disk during normal operation and preserved through crashes for recovery viewing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a hub crash with active remote sessions, 100% of sessions where the remote Claude process is still running are successfully reconnected within 30 seconds of hub restart.
- **SC-002**: After a hub crash with active local sessions, 100% of sessions have their scrollback preserved and viewable on restart, with at most 5 seconds of terminal output lost.
- **SC-003**: After a clean shutdown and restart, zero recovered/crashed sessions appear in the dashboard.
- **SC-004**: The feature includes automated tests covering at minimum: remote session reconnection, local session scrollback recovery, clean vs. crash shutdown distinction, worker-unreachable handling, and scrollback corruption resilience.
- **SC-005**: Users can view and dismiss crashed sessions within one click from the dashboard.
- **SC-006**: Session recovery does not add more than 2 seconds to hub startup time when no recovery is needed.

## Assumptions

- Remote Claude processes continue running independently when the hub crashes (since they run on separate machines via SSH).
- Local PTY processes are killed or orphaned when the hub crashes and cannot be reattached (standard Unix PTY behavior).
- Scrollback files written to disk during normal operation are the primary source of terminal history for recovery.
- The existing `sessions` database table can be extended with recovery-related fields without breaking existing functionality.
- A "clean shutdown" flag stored in the database or filesystem is sufficient to detect crash vs. intentional shutdown.
- The SSH tunnel reconnection logic in the existing worker manager can be leveraged for remote session recovery.
