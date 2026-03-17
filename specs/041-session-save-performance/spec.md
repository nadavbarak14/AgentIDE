# Feature Specification: Session Save & Performance

**Feature Branch**: `041-session-save-performance`
**Created**: 2026-03-17
**Status**: Draft
**Input**: User description: "we need this change - make sure that all the sessions are always saved. after restart update crash everything. also it sometimes take a lot of time to load a new session and switch between sessions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sessions Survive Any Shutdown (Priority: P1)

As a user, I want all my active sessions to be fully preserved and automatically restored when the hub restarts, whether due to a crash, an update, or a manual restart. I should never lose a running session just because the hub went down.

**Why this priority**: This is the core pain point. Losing sessions on restart/update is the most disruptive issue — users lose context, running tasks, and have to manually recreate their work environment. This must work reliably before any performance work matters.

**Independent Test**: Start 3 sessions (mix of local and remote), force-kill the hub process, restart it, and verify all 3 sessions reappear in the UI with their previous state intact and terminals reconnected.

**Acceptance Scenarios**:

1. **Given** 3 active sessions exist, **When** the hub process is killed (SIGKILL), **Then** on restart all 3 sessions appear in the UI with status "recovered" or "active" and terminals show previous scrollback.
2. **Given** 2 active sessions exist, **When** the hub performs a clean restart (SIGTERM followed by startup), **Then** both sessions are preserved and automatically re-activated without user intervention.
3. **Given** 1 active local session and 1 active remote session exist, **When** the hub crashes and restarts, **Then** both sessions are recovered — local via tmux reattachment, remote via SSH tunnel re-establishment.
4. **Given** a session's tmux process has also died (not just the hub), **When** the hub restarts, **Then** the session shows as "crashed" with full scrollback history available for viewing.

---

### User Story 2 - Fast Session Switching (Priority: P2)

As a user, I want switching between existing sessions to feel instant. When I click on a different session, the terminal and panels should appear immediately without a loading delay.

**Why this priority**: Slow session switching directly impacts daily workflow. Users switch between sessions frequently, and multi-second delays compound into significant time waste and frustration.

**Independent Test**: Create 3 sessions, switch between them rapidly, and measure that each switch completes (terminal visible and interactive) within the target time.

**Acceptance Scenarios**:

1. **Given** 3 active sessions exist, **When** the user clicks on a different session, **Then** the terminal content and panel state appear within 500 milliseconds.
2. **Given** a session was previously viewed, **When** the user switches back to it, **Then** the switch is near-instant (under 200ms) due to cached state.
3. **Given** 5+ sessions are active simultaneously, **When** the user switches between any two sessions, **Then** switching speed does not degrade compared to having only 2 sessions.

---

### User Story 3 - Fast New Session Creation (Priority: P3)

As a user, I want creating a new session to be fast. After clicking "new session," the terminal should be ready for input quickly.

**Why this priority**: While less frequent than switching, slow session creation creates a poor first impression and slows down workflows that require spinning up new sessions.

**Independent Test**: Click "new session," start a timer, and measure until the terminal cursor appears and accepts input.

**Acceptance Scenarios**:

1. **Given** the user is on the session grid, **When** they create a new session, **Then** the terminal is interactive within 2 seconds.
2. **Given** 5 sessions already exist, **When** the user creates a 6th session, **Then** creation time is not noticeably slower than creating the first session.
3. **Given** the user creates a new session, **When** the terminal appears, **Then** the UI shows a loading indicator during the wait (no blank or frozen screen).

---

### User Story 4 - Continuous Session State Saving (Priority: P2)

As a user, I want my session state (terminal scrollback, panel layout, active tabs) to be continuously saved so that no matter when a disruption occurs, my most recent state is preserved.

**Why this priority**: This directly supports P1 (survival across restarts). Without continuous saving, there's always a window where recent work can be lost.

**Independent Test**: Interact with a session for 30 seconds (type commands, resize panels, switch tabs), kill the hub, restart, and verify the recovered session reflects the state from within the last 2 seconds before the kill.

**Acceptance Scenarios**:

1. **Given** a user is actively typing in a terminal, **When** the hub crashes, **Then** on recovery the scrollback includes all output up to at most 2 seconds before the crash.
2. **Given** a user rearranges panels and switches tabs, **When** the hub crashes, **Then** on recovery the panel layout and active tab match the state at time of crash.
3. **Given** a session has accumulated 30 minutes of scrollback, **When** the hub restarts, **Then** the full scrollback is preserved and viewable.

---

### Edge Cases

- What happens when the hub crashes during session recovery (double crash)? Sessions should remain in "crashed" state and be recoverable on the next restart.
- What happens when disk space is low and scrollback cannot be flushed? The system should warn the user but not crash; partial scrollback is acceptable.
- What happens when a remote worker becomes permanently unreachable after hub restart? The session should show as "crashed" with available scrollback rather than silently disappearing.
- What happens when the user switches sessions very rapidly (faster than the UI can render)? Only the final target session should render; intermediate switches should be debounced.
- What happens when the database file is locked during a crash? WAL recovery should handle this automatically; if the database is corrupted, sessions should be recreated from available scrollback files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preserve all active sessions across any type of hub shutdown (clean restart, crash, update, SIGKILL).
- **FR-002**: System MUST automatically attempt to re-activate preserved sessions on hub startup without user intervention.
- **FR-003**: System MUST continuously save terminal scrollback to disk with no more than 2 seconds of potential data loss.
- **FR-004**: System MUST continuously save panel layout state (active tabs, panel sizes, zoom state) so it survives restarts.
- **FR-005**: System MUST display session switching results (terminal content, panel state) within 500 milliseconds of the user clicking a different session.
- **FR-006**: System MUST create new sessions and present an interactive terminal within 2 seconds of the user's request.
- **FR-007**: System MUST NOT delete any session that was active at the time of shutdown, regardless of shutdown type.
- **FR-008**: System MUST show a clear visual indicator when a session is being recovered after a restart.
- **FR-009**: System MUST preserve session scrollback even when the underlying process (tmux/pty) cannot be recovered, allowing the user to view their last terminal state.
- **FR-010**: System MUST handle rapid session switching gracefully by debouncing or canceling intermediate requests.
- **FR-011**: System MUST NOT degrade session switching or creation performance as the number of active sessions increases (up to 10 concurrent sessions).
- **FR-012**: System MUST show a loading indicator during session creation and session switching to provide user feedback.

### Key Entities

- **Session**: Represents a user's working context including terminal process, scrollback history, panel layout, and metadata. Key attributes: id, status (active/crashed/recovered/completed/failed), working directory, scrollback path, panel state.
- **Session State Snapshot**: The combined state of a session at a point in time — terminal scrollback content, panel layout (widths, heights, active tabs), and zoom state. Continuously persisted to survive disruptions.
- **Recovery Attempt**: A record of the system trying to re-activate a crashed session, including the method used (tmux reattach, SSH reconnect) and the outcome (success, fallback to scrollback-only).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of active sessions are preserved and available in the UI after any type of hub restart (clean, crash, update).
- **SC-002**: Users can switch between existing sessions in under 500 milliseconds (time from click to interactive terminal).
- **SC-003**: New session creation completes (terminal ready for input) in under 2 seconds.
- **SC-004**: At most 2 seconds of terminal scrollback data is lost in a worst-case crash scenario.
- **SC-005**: Session switching performance does not degrade by more than 10% when going from 2 to 10 active sessions.
- **SC-006**: Panel layout (tabs, sizes, zoom) is restored to within-crash state on session recovery with 100% fidelity.
- **SC-007**: Users always see a visual indicator during session operations (creation, switching, recovery) — no blank or frozen screens.

## Assumptions

- tmux is available on the host system (existing requirement, enforced at startup).
- SQLite WAL mode provides sufficient crash resilience for the database file itself.
- The 2-second scrollback flush interval (existing) is an acceptable data loss window.
- Remote sessions depend on SSH tunnel re-establishment, which is bounded by network conditions outside our control — the spec targets "best effort" recovery for remote sessions.
- The existing panel_states table schema is sufficient for continuous state saving (no schema changes needed for layout persistence).
- Session switching performance targets assume the sessions are already activated (not recovering from crash).
