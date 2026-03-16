# Feature Specification: Memory Optimization

**Feature Branch**: `039-memory-optimization`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "we have issues the hub takes a LOTTTT of RAM. also the remote agent. you need to fix it. i think the preview browser also takes a lot of ram we need to make sure we clean everthing"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hub Memory Stays Stable During Extended Use (Priority: P1)

As an operator running the AgentIDE hub for multiple users and sessions over hours or days, I need the hub's memory usage to remain stable and not grow unboundedly, so that the server does not slow down, crash, or require manual restarts.

**Why this priority**: The hub is the central process serving all users. Unbounded memory growth here affects every user and is the most impactful issue to fix. Multiple in-memory stores (widget store, pending commands, cookie jar, known ports, WebSocket client maps) accumulate data without cleanup when sessions end.

**Independent Test**: Can be tested by running the hub, creating and completing multiple sessions, and verifying that memory usage returns to near-baseline after sessions are cleaned up.

**Acceptance Scenarios**:

1. **Given** the hub has been running for 4+ hours with sessions being created and completed, **When** all sessions have been completed or removed, **Then** hub memory usage is within 20% of baseline (memory measured after initial startup with no active sessions).
2. **Given** a session is completed or removed, **When** the system performs cleanup, **Then** all in-memory data associated with that session (widgets, pending commands, cookies, port data, WebSocket references, scrollback buffers) is released.
3. **Given** a remote worker disconnects and reconnects, **When** the reconnection completes, **Then** the old WebSocket connection and tunnel resources are fully released before new ones are created.

---

### User Story 2 - Preview Browser Proxy Cleans Up After Itself (Priority: P1)

As a user using the browser preview feature across multiple sessions and ports, I need the preview proxy to clean up cached cookies, buffered responses, and stale proxy state, so that memory does not grow unboundedly during a working session.

**Why this priority**: The preview proxy buffers entire HTML responses in memory for script injection, stores cookies indefinitely per session-port combination, and has no eviction policy. With many preview sessions across different ports, this can consume significant RAM.

**Independent Test**: Can be tested by opening and closing multiple preview tabs across different ports, then verifying that memory associated with closed previews is reclaimed.

**Acceptance Scenarios**:

1. **Given** a user has been using browser preview across 10+ different ports during a session, **When** those preview ports are no longer in use, **Then** the associated cookie data and buffered responses are cleaned up.
2. **Given** a large HTML page (>5MB) is being proxied, **When** the response has been fully sent to the client, **Then** the buffered response data is released from memory immediately.
3. **Given** a session is completed, **When** session cleanup runs, **Then** all cookie jar entries and proxy state associated with that session are removed.

---

### User Story 3 - Remote Agent Memory Stays Bounded (Priority: P2)

As an operator running remote agents (workers) connected to the hub, I need the remote agent process memory to stay bounded, so that remote servers remain stable and responsive.

**Why this priority**: Remote agents accumulate SSH channel references, output buffers, scrollback data, session-worker mappings, and port scan history without proper cleanup. While each individual item is small, they accumulate over time with many sessions.

**Independent Test**: Can be tested by running a remote agent, creating and completing multiple remote sessions, and verifying that the agent's memory returns to near-baseline.

**Acceptance Scenarios**:

1. **Given** a remote agent has handled 20+ sessions over several hours, **When** all sessions are completed, **Then** agent memory usage is within 20% of baseline.
2. **Given** a remote session ends (normally or abnormally), **When** cleanup runs, **Then** all associated SSH channels, output buffers, scrollback data, terminal parsers, and session-worker mappings are released.
3. **Given** the port scanner detects ports that later become inactive, **When** those ports are no longer listening, **Then** the port entries are removed from the known ports map.

---

### User Story 4 - Terminal and PTY Processes Are Cleaned Up (Priority: P2)

As a user running terminal sessions (local or remote), I need terminal processes and their associated buffers to be fully cleaned up when sessions end, so that orphaned processes do not consume system resources.

**Why this priority**: Each terminal session maintains output buffers, scrollback writers, terminal parsers, and PTY process references. If any of these fail to clean up (especially on abnormal termination), they persist in memory indefinitely.

**Independent Test**: Can be tested by creating and killing multiple terminal sessions (including simulating crashes) and verifying all maps and buffers are empty afterward.

**Acceptance Scenarios**:

1. **Given** a terminal session ends normally, **When** cleanup completes, **Then** the PTY process, output buffer, scrollback writer, scrollback pending data, terminal parser, and dimensions entry are all removed.
2. **Given** a terminal session crashes or is force-killed, **When** the crash is detected, **Then** all associated resources are cleaned up within 30 seconds.
3. **Given** scrollback data is pending flush when a session ends, **When** session cleanup runs, **Then** the pending scrollback is either flushed to disk or discarded, and the memory is freed.

---

### User Story 5 - Tunnel and Connection Cleanup on Disconnect (Priority: P3)

As an operator, I need SSH tunnels and TCP pipe connections to be fully cleaned up when workers disconnect, so that file descriptors and memory are not leaked.

**Why this priority**: SSH tunnel reconnections can leave orphaned SSH clients, TCP sockets, and reconnect timers. While individually small, leaked connections consume file descriptors and memory over time.

**Independent Test**: Can be tested by simulating worker disconnects and reconnects, then verifying that no orphaned SSH clients, timers, or TCP sockets remain.

**Acceptance Scenarios**:

1. **Given** a worker disconnects, **When** the disconnect handler runs, **Then** the SSH client, all active channels, reconnect timers, and TCP pipe sockets are fully destroyed.
2. **Given** a worker reconnects after a disconnect, **When** the old connection is replaced, **Then** the old connection's resources are fully released before the new connection is established.
3. **Given** tunnel cleanup encounters an error (e.g., socket already destroyed), **When** the error occurs, **Then** cleanup continues for remaining resources instead of silently aborting.

---

### Edge Cases

- What happens when a session ends while a large response is being buffered by the preview proxy? The in-flight buffer should be aborted and released.
- How does the system handle cleanup if the cleanup code itself throws an error? Cleanup should use try/catch per resource and continue cleaning remaining resources.
- What happens when multiple workers disconnect simultaneously? Each disconnect should clean up independently without interfering with others.
- How does the system behave when a PTY process becomes a zombie? A periodic sweep should detect and reap orphaned PTY processes.
- What happens when the SQLite WAL file grows very large due to infrequent checkpoints? Periodic checkpoints should be triggered to keep WAL file size bounded.
- How does the system handle cleanup when the hub process itself is shutting down? A graceful shutdown handler should clean up all resources in order.

## Requirements *(mandatory)*

### Functional Requirements

**Hub Cleanup:**

- **FR-001**: System MUST clean up all session-scoped in-memory data (widgets, pending commands, cookies, port data, client references) when a session is completed or removed.
- **FR-002**: System MUST evict widget store entries when their associated session is no longer active, releasing stored HTML and result data.
- **FR-003**: System MUST clean up stale pending commands that have exceeded their timeout, preventing accumulation of abandoned command state.
- **FR-004**: System MUST release old WebSocket connection resources before establishing replacement connections when a worker reconnects.

**Preview Proxy Cleanup:**

- **FR-005**: System MUST evict cookie jar entries when the associated session ends or when cookie entries exceed a configurable maximum age.
- **FR-006**: System MUST release buffered response data immediately after the proxied response has been fully sent to the client.
- **FR-007**: System MUST enforce a maximum size limit for individual buffered responses to prevent a single large page from consuming excessive memory.

**Remote Agent Cleanup:**

- **FR-008**: System MUST clean up SSH channel references, output buffers, scrollback data, terminal parsers, and session-worker mappings when a remote session ends.
- **FR-009**: System MUST remove stale port entries from the known ports map when the scanned ports are no longer active.
- **FR-010**: System MUST clean up idle poller resources when no remote sessions are active.

**Terminal/PTY Cleanup:**

- **FR-011**: System MUST clean up all PTY-associated resources (process, output buffer, scrollback writer, scrollback pending, terminal parser, dimensions) when a terminal session ends, whether normally or abnormally.
- **FR-012**: System MUST detect orphaned PTY processes (sessions that ended without triggering cleanup) and clean them up within a reasonable timeframe.

**Tunnel Cleanup:**

- **FR-013**: System MUST fully destroy SSH clients, channels, reconnect timers, and TCP pipe sockets when a worker disconnects.
- **FR-014**: System MUST handle errors during cleanup gracefully, continuing to clean up remaining resources even if one cleanup step fails.

**Monitoring:**

- **FR-015**: System MUST provide a way to observe current memory-related state (number of active widgets, open connections, cached cookies, active PTY processes) for debugging purposes.

### Key Entities

- **Session**: The central unit of work; all in-memory resources are scoped to sessions and should be cleaned up when the session lifecycle ends.
- **Widget**: Skill UI component stored in hub memory with HTML content and result data; scoped to a session.
- **Cookie Jar Entry**: Cached cookies for preview proxy; scoped to a session-port combination.
- **PTY Process**: Terminal process with associated buffers; scoped to a session.
- **SSH Tunnel**: Connection to a remote worker with channels and TCP pipes; scoped to a worker.
- **Known Port**: Detected listening port on a worker; accumulates over time if not evicted.

## Assumptions

- Memory "baseline" is defined as the process's RSS (Resident Set Size) measured 30 seconds after startup with zero active sessions.
- The 20% threshold for memory return is measured after garbage collection has had an opportunity to run (e.g., after a brief idle period).
- Session cleanup hooks already exist in the session manager's lifecycle events; this feature adds resource release logic to those hooks.
- The current preview proxy response buffering approach (buffer, decompress, inject, recompress) is architecturally required; optimization focuses on releasing buffers promptly rather than eliminating buffering.
- WAL file growth is addressed by periodic checkpoints rather than schema changes.
- The hub runs as a long-lived process (hours to days); memory stability over this timeframe is the primary goal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After creating and completing 50 sessions over 2 hours, hub memory usage is within 20% of the baseline measured at startup with no sessions.
- **SC-002**: After a session completes, all session-scoped in-memory entries (widgets, cookies, buffers, client references) reach zero for that session within 60 seconds.
- **SC-003**: The preview proxy cookie jar size never exceeds the number of currently active session-port combinations plus a small grace buffer.
- **SC-004**: Remote agent memory usage after completing 20 remote sessions is within 20% of baseline.
- **SC-005**: No orphaned PTY processes remain running more than 60 seconds after their parent session has ended.
- **SC-006**: Operator can inspect current resource counts (active widgets, open connections, cookie entries, PTY processes) to verify cleanup is working.
- **SC-007**: Hub can run for 24 hours under typical multi-user workload without requiring a restart due to memory pressure.
