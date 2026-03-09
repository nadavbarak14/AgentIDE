# Feature Specification: Remote Agent Tunnel Resilience

**Feature Branch**: `030-remote-agent-reconnect`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "We need this fix. Sessions after restart or just sessions, MUST try to connect to remote agent, even reconnect."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sessions work immediately after server restart (Priority: P1)

A user restarts the hub server and opens the UI. They have an existing remote worker (e.g., "oracle") with active sessions. The system should not show sessions as available until the remote agent tunnel is fully established. Once the tunnel is ready, sessions become usable without the user needing to do anything.

**Why this priority**: This is the core bug — after a server restart, users see remote sessions as ready but get "Remote agent unavailable" errors when they try to use them. This is the most common and frustrating scenario.

**Independent Test**: Restart the hub server with a configured remote worker, wait for the worker status to transition from "connecting" to "connected", then open a remote session and verify file browsing/editor works without errors.

**Acceptance Scenarios**:

1. **Given** a hub server with a remote worker configured, **When** the server restarts, **Then** the remote worker status shows "connecting" until both the SSH tunnel and agent tunnel are fully established.
2. **Given** a hub server that just restarted, **When** the SSH and agent tunnels finish connecting, **Then** the worker status transitions to "connected" and all remote sessions become usable.
3. **Given** a hub server that just restarted, **When** a user tries to access a remote session before the tunnel is ready, **Then** the system indicates the worker is still connecting (not a hard error) and the UI conveys that the session is temporarily unavailable.

---

### User Story 2 - Automatic reconnection on tunnel drop (Priority: P2)

A user is working with a remote worker. The SSH connection drops due to network issues. The system automatically detects the disconnection and attempts to re-establish the tunnel without user intervention. Sessions tied to the worker are temporarily marked as unavailable during reconnection and resume once the tunnel is back.

**Why this priority**: Network drops happen frequently with remote machines. Without auto-reconnect, users must manually restart the server or re-add the worker to restore connectivity.

**Independent Test**: Establish a remote worker connection, simulate a network interruption (e.g., kill the SSH tunnel), wait, and verify the system automatically reconnects and sessions resume.

**Acceptance Scenarios**:

1. **Given** a connected remote worker, **When** the SSH tunnel drops unexpectedly, **Then** the system detects the disconnection within 30 seconds and begins automatic reconnection.
2. **Given** a worker in reconnecting state, **When** the reconnection succeeds, **Then** all active sessions for that worker become usable again and the agent tunnel is re-established.
3. **Given** a worker in reconnecting state, **When** the reconnection fails, **Then** the system retries with exponential backoff (up to a maximum interval) and updates the worker status to reflect the ongoing retry.

---

### User Story 3 - Clear worker status visibility in the UI (Priority: P3)

A user opens the dashboard and can see at a glance which remote workers are fully connected, which are connecting/reconnecting, and which have errors. Sessions tied to workers that are not fully connected show a clear status indicator so the user understands why they can't interact yet.

**Why this priority**: Without clear status visibility, users see confusing 502 errors. A "connecting..." indicator sets correct expectations and eliminates confusion.

**Independent Test**: View the workers list and session list during various tunnel states (connecting, connected, reconnecting, error) and verify appropriate status indicators are shown.

**Acceptance Scenarios**:

1. **Given** a remote worker that is establishing its tunnel, **When** the user views the workers list, **Then** the worker shows a "connecting" status with a visual indicator.
2. **Given** a session tied to a worker that is reconnecting, **When** the user views the session, **Then** the session shows a temporary unavailability message rather than an error.
3. **Given** a worker whose reconnection has failed after retries, **When** the user views the workers list, **Then** the worker shows an "error" status with information about the failure.

---

### Edge Cases

- What happens when two server instances start simultaneously and compete for the same SSH tunnel? (The old process must be killed or the new one must wait.)
- How does the system behave when the remote machine is reachable via SSH but the agent process is not running on the configured port?
- What happens when the remote agent port changes between restarts?
- How does the system handle a worker that has been removed from the database but still has active sessions?
- What happens during reconnection if the SSH key file has been moved, deleted, or had its permissions changed?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST set the worker status to "connecting" when initiating the SSH and agent tunnel connection, and only transition to "connected" after both are fully established.
- **FR-002**: System MUST NOT allow new session creation targeting a worker that is in "connecting" or "reconnecting" state — the UI should disable or grey out the worker option.
- **FR-003**: System MUST return HTTP 503 (Service Unavailable) with a `Retry-After` header when a request targets a remote session whose worker tunnel is not yet established, instead of the current 502 error.
- **FR-004**: System MUST automatically detect SSH tunnel disconnection and initiate reconnection with exponential backoff (starting at 1 second, maximum 60 seconds).
- **FR-005**: System MUST re-establish the agent tunnel (port forwarding) as part of the reconnection process, not just the SSH tunnel.
- **FR-006**: System MUST re-register all active sessions with the remote agent after a successful reconnection.
- **FR-007**: The frontend MUST display the worker's connection state (connecting, connected, reconnecting, error) visually in the worker list and session views.
- **FR-008**: The frontend MUST retry failed requests to remote sessions when receiving a 503 response, with a brief delay, showing a "reconnecting" indicator to the user.
- **FR-009**: System MUST update the worker's `lastHeartbeat` timestamp on successful reconnection.

### Key Entities

- **Worker**: Represents a compute target (local or remote). Key attributes: status (connecting | connected | reconnecting | error | disconnected), tunnel health, last heartbeat.
- **Agent Tunnel**: A local TCP listener that forwards connections through SSH to the remote agent port. Key attributes: local port, remote port, health status.
- **Session**: A user's working session tied to a worker. Temporarily unavailable when its worker's tunnel is down.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a server restart, remote sessions become usable within 15 seconds (typical SSH connection time) without any user intervention.
- **SC-002**: Users never see "Remote agent unavailable" errors — they see a clear "connecting" or "reconnecting" status instead.
- **SC-003**: After a network interruption, the system automatically reconnects and restores session usability within 60 seconds (assuming network is restored).
- **SC-004**: Worker connection state is always accurate — the UI reflects the actual tunnel status at all times with no more than 5 seconds of staleness.

## Assumptions

- The SSH key and credentials for remote workers remain valid across restarts.
- The remote agent process is managed independently (outside the hub's control) and is expected to be running when the remote machine is reachable.
- The exponential backoff for reconnection resets to the initial delay after a successful connection.
- The existing `TunnelManager` already handles SSH-level reconnection on disconnect; this feature extends that to cover the agent tunnel layer and improves status visibility.
