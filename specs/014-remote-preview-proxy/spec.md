# Feature Specification: Remote Preview Proxy & Full Remote Worker Feature Parity

**Feature Branch**: `014-remote-preview-proxy`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Enable browser preview proxy and all IDE features to work on remote SSH workers with full parity"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview a Remote Dev Server (Priority: P1)

A developer has a session running on a remote SSH worker. Claude (or the developer) starts a dev server (e.g., `npm run dev`) on the remote machine. The lightweight remote agent running on that machine detects the listening port and reports it to the hub. The developer opens the browser preview panel, which loads the remote dev server's web page through the remote agent's proxy — identically to how local previews work. The page renders correctly, relative paths resolve, navigation works, and the developer can interact with the app normally.

**Why this priority**: The browser preview is the core feature that is entirely broken for remote workers. Without this, developers cannot visually inspect or interact with their web applications running on remote machines.

**Independent Test**: Can be tested by installing the remote agent on a server, adding it as a remote worker, starting a session, running a simple HTTP server (e.g., `npx serve`), and verifying the preview panel loads the page correctly.

**Acceptance Scenarios**:

1. **Given** a session running on a remote worker with the remote agent active and a dev server on port 3000, **When** the agent scans for ports, **Then** port 3000 is detected and a notification is sent to the frontend via the hub.
2. **Given** a detected remote port, **When** the user opens the browser preview and navigates to `localhost:3000`, **Then** the page loads correctly through the remote agent's proxy with all assets (CSS, JS, images) resolving properly.
3. **Given** a proxied remote page with relative links, **When** the user clicks a link, **Then** navigation stays within the proxy and the new page loads correctly.
4. **Given** a proxied remote page that sets cookies, **When** the page is reloaded, **Then** cookies are preserved and scoped to the proxy path.

---

### User Story 2 - Inspect, Screenshot, and Record a Remote Preview (Priority: P2)

A developer previewing a remote web application wants to use the inspect bridge tools: selecting elements to see their properties, capturing screenshots of the current page, and recording short video clips of interactions. All inspect bridge capabilities work identically whether the session is local or remote.

**Why this priority**: Inspect, screenshot, and recording are key collaboration and debugging features. They build on the preview proxy (P1) and provide significant additional value for remote development workflows.

**Independent Test**: Can be tested by previewing a remote page, entering inspect mode, clicking an element, capturing a screenshot, and starting/stopping a recording — verifying all outputs match the expected format.

**Acceptance Scenarios**:

1. **Given** a remote preview is loaded in the iframe, **When** the user enters inspect mode and clicks an element, **Then** the element is highlighted and its properties (tag, dimensions, accessibility info) are displayed.
2. **Given** a remote preview is loaded, **When** the user captures a screenshot, **Then** a PNG image of the current page is generated and available for download or annotation.
3. **Given** a remote preview is loaded, **When** the user starts a recording and interacts with the page for 10 seconds, **Then** a video recording is captured and made available.

---

### User Story 3 - Browse and Edit Remote Project Files (Priority: P2)

A developer working on a remote session needs to browse the project file tree, read file contents, edit files, and search across the project — all through the IDE's file panel. The remote agent handles all file operations natively on the remote machine, so the experience is identical to working with local files.

**Why this priority**: File browsing, reading, and editing are fundamental IDE operations. Without remote file access, the developer cannot review code, make manual edits, or navigate the project structure on the remote worker.

**Independent Test**: Can be tested by creating a remote session, expanding the file tree, opening a file, editing its content, saving, and confirming the change persists on the remote machine.

**Acceptance Scenarios**:

1. **Given** a session on a remote worker, **When** the user opens the file tree panel, **Then** the remote project's directory structure is listed correctly.
2. **Given** a remote file tree is visible, **When** the user clicks a file, **Then** the file content is loaded and displayed in the editor.
3. **Given** a remote file is open in the editor, **When** the user modifies the content and saves, **Then** the changes are written to the file on the remote worker.
4. **Given** a remote session, **When** the user performs a text search, **Then** matching results from the remote project are returned with file paths and line numbers.

---

### User Story 4 - View Git Diff for Remote Sessions (Priority: P3)

A developer wants to review the git diff for changes made during a remote session. The remote agent runs git locally on the remote machine, and the diff panel shows staged and unstaged changes formatted identically to local diffs.

**Why this priority**: Git diff is a supplementary feature that aids code review. It depends on remote file access but is less critical than browsing/editing files or previewing the app.

**Independent Test**: Can be tested by making a change to a file on the remote worker (via the session), opening the diff panel, and verifying the diff shows the correct additions and deletions.

**Acceptance Scenarios**:

1. **Given** a remote session with uncommitted changes, **When** the user opens the diff panel, **Then** the combined staged and unstaged diff is displayed correctly.
2. **Given** a remote session in a non-git directory, **When** the user opens the diff panel, **Then** an empty diff is shown gracefully (no error).

---

### User Story 5 - Real-Time File Change Notifications for Remote Sessions (Priority: P3)

When files change on the remote worker (e.g., Claude writes code, a build tool generates output), the remote agent detects the changes using native OS file watching (chokidar) and notifies the hub. The IDE updates the file tree and editor accordingly, providing the same "live" experience as local sessions.

**Why this priority**: File change notifications enhance the developer experience but are not blocking. The IDE remains fully functional without them — users can manually refresh. This is a quality-of-life improvement.

**Independent Test**: Can be tested by opening a remote session with the file tree visible, then modifying a file on the remote machine (via the terminal), and verifying the file tree updates within a few seconds.

**Acceptance Scenarios**:

1. **Given** a remote session with the file tree open, **When** a file is modified on the remote worker, **Then** the IDE receives a change notification within 2 seconds (native chokidar watching, no polling fallback needed).
2. **Given** a remote session, **When** a new file is created on the remote worker, **Then** the file tree reflects the addition after a change notification.

---

### User Story 6 - Install and Manage the Remote Agent (Priority: P1)

A system administrator or developer installs the remote agent on a server before adding it as a remote worker in AgentIDE. The installation is a simple manual process (e.g., download and run a script, or install via a package manager). Once installed, the agent runs as a background service and the hub connects to it when the worker is added.

**Why this priority**: Without the remote agent installed and running, none of the remote features work. This is a prerequisite for all other stories.

**Independent Test**: Can be tested by following the installation instructions on a fresh server, verifying the agent starts and is reachable, then adding the server as a remote worker in AgentIDE and confirming the connection succeeds.

**Acceptance Scenarios**:

1. **Given** a server with Node.js installed, **When** the administrator runs the agent installation command, **Then** the remote agent starts and listens for connections.
2. **Given** a running remote agent, **When** the hub connects via SSH tunnel, **Then** the hub can communicate with the agent and verify its health.
3. **Given** a remote worker configured in AgentIDE, **When** the hub connects to the worker, **Then** the hub verifies the remote agent is running and reports the worker as ready.
4. **Given** a remote agent that is not running on a worker, **When** the hub attempts to connect, **Then** the hub reports a clear error indicating the remote agent needs to be installed or started.

---

### Edge Cases

- What happens when the SSH connection drops while the preview proxy is active? The hub should return an appropriate error (e.g., 502) and automatically reconnect to the remote agent when the SSH tunnel is restored.
- What happens when a remote dev server binds to a non-standard interface (e.g., `0.0.0.0` vs `127.0.0.1`)? The remote agent's port scanner detects it regardless of bind address since it runs locally on the remote machine.
- What happens when multiple remote sessions run on the same worker? The single remote agent instance serves all sessions on that worker, sharing resources efficiently.
- What happens when the remote file is very large (>10MB)? The remote agent enforces the same size limits as the hub's local file reader.
- What happens when a remote session ends? The hub stops routing requests for that session to the remote agent. The agent continues running for other sessions.
- What happens when the remote agent process crashes? The hub detects the loss of connectivity and reports the worker as unhealthy. Sessions on that worker are marked as errored. The agent can be restarted independently.

## Clarifications

### Session 2026-02-23

- Q: Should the preview panel skip the proxy entirely for same-machine access? → A: Yes, use a direct iframe (no proxy, no rewriting, no restrictions) when the hub is accessed via localhost AND the session is local. Full proxy only applies when the hub is accessed remotely or the session runs on a remote worker.
- Q: Should the remote agent have its own authentication beyond the SSH tunnel? → A: No, SSH tunnel is the sole security boundary. (Deferred — not in scope for current iteration; only localhost direct iframe is being implemented now.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST include a lightweight remote agent that can be installed and run on remote worker machines independently of the hub.
- **FR-002**: The remote agent MUST expose the same file, preview, and utility APIs as the hub's local session routes (file listing, file reading, file writing, file search, git diff, preview proxy, file serving, port scanning, file watching).
- **FR-003**: The hub MUST communicate with the remote agent over an SSH-tunneled connection when handling requests for remote sessions.
- **FR-004**: The hub MUST transparently proxy API requests for remote sessions to the appropriate remote agent, so the frontend requires no changes.
- **FR-005**: The remote agent MUST detect listening ports on the worker machine by scanning local network state and report them to the hub.
- **FR-006**: The remote agent MUST proxy HTTP traffic to local dev server ports with the same HTML rewriting, cookie handling, and bridge script injection as the hub's local proxy.
- **FR-007**: The remote agent MUST watch the session's working directory for file changes using native OS-level monitoring and report changes to the hub.
- **FR-008**: The remote agent MUST compute git diffs locally and return them in the same format as the hub's local diff endpoint.
- **FR-009**: The hub MUST verify that the remote agent is running and healthy when a worker is connected, and report a clear error if it is not.
- **FR-010**: The hub MUST clean up tunnel connections and stop routing to a remote agent when all sessions on that worker have ended.
- **FR-011**: The system MUST NOT break any existing functionality for local sessions — all changes must be backward-compatible.
- **FR-015**: When the hub is accessed via localhost and the session is local, the preview panel MUST use a direct iframe pointing at `localhost:<port>` with no proxy, URL rewriting, or script injection. The full proxy (HTML rewriting, cookie handling, bridge script) MUST only be used when the hub is accessed remotely (non-localhost) or when the session runs on a remote worker.
- **FR-012**: The hub MUST handle remote agent unavailability gracefully, returning appropriate errors to the user and recovering automatically when the agent becomes available again.
- **FR-013**: The remote agent MUST be installable via a simple manual process (script or package) that requires only Node.js as a prerequisite.
- **FR-014**: The inspect bridge (element inspection, screenshots, recordings) MUST work for remote previews identically to local previews with no additional configuration.

### Key Entities

- **Remote Agent**: A lightweight server process running on a remote worker machine. Handles file operations, preview proxying, port scanning, and file watching locally. Communicates with the hub over an SSH tunnel.
- **Agent Connection**: Represents the SSH-tunneled link between the hub and a remote agent. Attributes: worker identity, tunnel port, health status, connection state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can preview web applications running on remote workers with the same visual fidelity and interactivity as local previews — all pages, assets, and navigation work correctly.
- **SC-002**: Port detection on remote workers identifies new listening ports within 10 seconds of the dev server starting.
- **SC-003**: All inspect bridge features (element selection, screenshots, recordings) produce correct results on remote previews.
- **SC-004**: Users can browse, read, edit, and search remote project files through the IDE panels with no functional difference from local files.
- **SC-005**: Git diffs for remote sessions display correctly and include both staged and unstaged changes.
- **SC-006**: File change notifications for remote sessions are delivered within 2 seconds of the change occurring.
- **SC-007**: Existing local session functionality has zero regressions — all current tests continue to pass.
- **SC-008**: The remote agent can be installed on a fresh server with Node.js in under 5 minutes following the provided instructions.
- **SC-009**: When the remote agent is unavailable, the hub provides a clear, actionable error message to the user within 5 seconds.

## Assumptions

- Remote workers have Node.js installed (required for running the remote agent).
- The remote agent is manually installed on the remote machine by the administrator before adding it as a worker in AgentIDE. The hub does not auto-deploy the agent.
- The SSH connection between hub and worker is already established and managed by the existing tunnel infrastructure.
- Remote dev servers bind to `localhost` or `0.0.0.0` on standard ports (1024-65535).
- The same file size limits that apply to local operations (1MB for file reading) apply to remote operations.
- A single remote agent instance serves all sessions on a given worker machine.
