# Feature Specification: Clean Session & Connection UX

**Feature Branch**: `012-session-connect-ux`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "we need this - clean UX, don't expose all the directories, and easy create new session, and in what machine is it, local host or remote, and we need to connect the remote. i want to see how it works for real. think what we might more miss in thie area"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quick Session Creation from Projects (Priority: P1)

A user opens the dashboard and wants to start a new Claude session. Instead of typing a raw filesystem path, they see a **project picker** — a curated list of their recent projects and bookmarked directories, displayed as friendly project names (e.g., "MyApp" instead of `/home/ubuntu/projects/MyApp`). They select a project, optionally type a task title, and hit "Create". The session starts immediately.

If the user needs a directory not in their list, they can browse within their home directory to find it, and the system offers to bookmark it for next time. Directory browsing is restricted to the user's home directory for security — paths outside `$HOME` are not accessible.

**Why this priority**: This is the core daily interaction. Every session starts here. Making this fast and clean directly impacts how usable the product feels. Currently users must type raw paths, which is error-prone and exposes internal directory structures unnecessarily.

**Independent Test**: Can be fully tested by opening the dashboard, seeing the project list, selecting a project, and confirming a session is created with the correct working directory — all without typing a raw path.

**Acceptance Scenarios**:

1. **Given** a user has previously created sessions in 3 directories, **When** they open the "New Session" form, **Then** those 3 directories appear as named projects in a "Recent" section, most recent first
2. **Given** a user sees the project picker, **When** they click a project name, **Then** the directory is selected and they only need to (optionally) add a title before creating
3. **Given** no recent projects exist (first-time user), **When** they open "New Session", **Then** they see a clean empty state with a "Browse" button and a text field for entering a path
4. **Given** a user selects a directory not previously bookmarked, **When** the session is created, **Then** the system offers to save it as a named project for future quick access
5. **Given** a user sees the project list, **When** they look at the entries, **Then** they see project names (folder name or custom alias) — NOT full filesystem paths — with a subtle secondary label showing only the last 2 path segments (e.g., `projects/MyApp`)

---

### User Story 2 - Machine Visibility and Selection (Priority: P2)

A user has both a local machine and one or more remote workers configured. When creating a session, they can see which machines are available and their status (connected/disconnected, how many sessions running). Each session card and queue entry clearly shows which machine it is running on — a small label like "local" or the remote worker's name (e.g., "gpu-server").

When viewing the dashboard, the user can tell at a glance which sessions are local and which are remote without digging into settings.

**Why this priority**: Users managing multiple machines need situational awareness. Without this, they cannot make informed decisions about where to run sessions, and the remote worker feature (already partially built) remains invisible from the main workflow.

**Independent Test**: Can be tested by adding a remote worker in settings, then creating a session — the machine selector appears in the new session form, and after creation the session card shows the worker name.

**Acceptance Scenarios**:

1. **Given** only a local worker exists, **When** the user creates a session, **Then** no machine selector is shown (it defaults to local) and sessions show a subtle "local" label
2. **Given** multiple workers exist (local + remote), **When** the user opens the new session form, **Then** a machine picker appears showing each worker's name, type (local/remote), status, and current session load (e.g., "2/4 sessions")
3. **Given** a remote worker is disconnected, **When** the user sees it in the machine picker, **Then** it is visually dimmed with a "disconnected" label and cannot be selected
4. **Given** a session is running on a remote worker, **When** the user views the session card, **Then** a machine badge shows the worker name (e.g., "gpu-server") next to the session title
5. **Given** a session is running locally, **When** the user views the session card, **Then** a subtle "local" indicator appears (not obtrusive, but visible on inspection)

---

### User Story 3 - Remote Session Execution (Priority: P3)

A user selects a remote worker when creating a session. The system establishes an SSH connection to that worker, spawns the Claude process on the remote machine, and streams terminal output back to the user's browser in real-time. The experience is seamless — the terminal looks and behaves exactly like a local session.

The user can also browse and select a working directory on the remote machine using live SSH-based directory autocomplete — the experience mirrors local browsing. For previously saved remote projects, the user clicks the project name and goes directly there. The system validates that the directory exists on the remote machine before starting.

**Why this priority**: This is the payoff of the machine visibility (P2). Without actually routing sessions to remote workers, the machine labels are informational only. This story makes remote workers functional end-to-end.

**Independent Test**: Can be tested by configuring a remote worker with SSH credentials, creating a session targeted at that worker, and verifying the Claude process runs on the remote machine (check via `hostname` in the terminal).

**Acceptance Scenarios**:

1. **Given** a connected remote worker, **When** the user creates a session targeted at that worker, **Then** the Claude process is spawned on the remote machine via SSH
2. **Given** a remote session is active, **When** the user types in the terminal, **Then** input is forwarded to the remote process with no perceptible additional latency (beyond network RTT)
3. **Given** a remote session is active, **When** the user views the terminal, **Then** output streams in real-time just like a local session
4. **Given** a remote worker becomes unreachable during a session, **When** the SSH connection drops, **Then** the user sees a clear "connection lost" message with a "Reconnect" button, and the session status updates to reflect the disconnection
5. **Given** the user specifies a working directory for a remote session, **When** the session starts, **Then** the system verifies the directory exists on the remote machine and shows an error if it does not

---

### User Story 4 - Project Management and Cleanup (Priority: P4)

A user wants to organize their project list. They can rename projects (give a custom alias like "Backend API" instead of the folder name), remove projects they no longer use from the quick-access list, and reorder their favorites. The project list does not grow unboundedly — only the N most recent plus explicitly bookmarked projects are shown.

**Why this priority**: Without curation, the project list becomes as cluttered as raw directory browsing. This story keeps the clean UX promise sustainable over time.

**Independent Test**: Can be tested by bookmarking a project, renaming it, and verifying the new name appears in the project picker on subsequent visits.

**Acceptance Scenarios**:

1. **Given** a user has 20+ recent directories, **When** they open the project picker, **Then** they see at most 10 recent projects plus any explicitly bookmarked/pinned projects
2. **Given** a user right-clicks (or clicks an overflow menu on) a project entry, **When** they select "Rename", **Then** they can type a custom alias that persists across sessions
3. **Given** a user bookmarks a project, **When** they open the project picker, **Then** bookmarked projects appear in a pinned "Favorites" section above "Recent"
4. **Given** a user removes a project from their list, **When** they open the project picker next time, **Then** the project no longer appears (but existing sessions using that directory are unaffected)

---

### User Story 5 - Connection Health Dashboard (Priority: P5)

A user wants to see at a glance the health of all their connected machines — local and remote. A small status area on the dashboard (not buried in settings) shows each machine's connection status, latency, and active session count. If a remote worker goes offline, a non-intrusive notification appears.

**Why this priority**: Operational awareness prevents surprises. This is lower priority because users can function without it, but it prevents confusion when remote sessions fail.

**Independent Test**: Can be tested by viewing the dashboard status area, disconnecting a remote worker's network, and seeing the status update within 30 seconds.

**Acceptance Scenarios**:

1. **Given** the user has connected workers, **When** they view the dashboard, **Then** a compact status bar or widget shows each worker's name, connection status (green/yellow/red dot), and active session count
2. **Given** a remote worker disconnects, **When** the dashboard refreshes, **Then** the worker's status changes to red/disconnected within 30 seconds
3. **Given** all workers are local only, **When** the user views the dashboard, **Then** the connection health widget is hidden or shows minimal info (no clutter for simple setups)

---

### User Story 6 - Worker Management UX (Priority: P2)

A user wants to add a remote machine so they can run sessions on it. They open the Settings panel and find a "Machines" section listing all configured workers. They click "Add Machine", fill in the SSH details (name, host, username, path to SSH key on the server), and hit "Test Connection". The system verifies SSH connectivity and shows success or a clear error. Once saved, the machine appears in the worker selector when creating sessions.

They can also edit an existing worker's details, remove a worker (after confirming no active sessions depend on it), and see each worker's live status from the settings panel.

**Why this priority**: Same as P2 (Machine Visibility) — without a UX to add workers, the entire multi-machine feature is inaccessible to users. This is the entry point for all remote functionality.

**Independent Test**: Can be tested by opening Settings, adding a remote worker with valid SSH credentials, seeing it appear in the machine selector, then removing it.

**Acceptance Scenarios**:

1. **Given** the user opens the Settings panel, **When** they navigate to the "Machines" section, **Then** they see a list of all configured workers with status indicators
2. **Given** the user clicks "Add Machine", **When** they fill in name, SSH host, SSH user, and SSH key path, **Then** a "Test Connection" button verifies SSH connectivity before saving
3. **Given** a connection test succeeds, **When** the user saves the worker, **Then** it immediately appears in the worker selector dropdown when creating new sessions
4. **Given** a connection test fails, **When** the user sees the result, **Then** a clear error message explains the failure (e.g., "Connection refused", "Authentication failed", "Key file not found")
5. **Given** a user tries to remove a worker with active sessions, **When** they click "Remove", **Then** the system warns them and requires confirmation before proceeding

---

### Edge Cases

- What happens when a remote worker's SSH key is invalid or expired? The system shows a clear error message during connection test and session creation, not a generic timeout.
- What happens when a user tries to create a session on a remote worker that has reached its max session limit? The system shows the worker as "full" and suggests the user pick another worker or queue on the current one.
- What happens when the user's local home directory structure changes (e.g., project directory deleted)? Bookmarked projects with missing directories show a "directory not found" warning and offer to remove or update the bookmark.
- What happens when two users bookmark the same directory with different aliases? Each user's bookmarks are independent (per-browser or per-authenticated-user).
- What happens when a remote session is suspended/auto-continued? The continuation runs on the same remote worker, not locally.
- What happens when creating a session with a remote directory path that uses a different path separator or mount point? The system sends the path as-is to the remote machine and relies on the remote OS to resolve it.
- What happens when a user tries to manually enter or paste a path outside their home directory? The system rejects it with a clear "directory not allowed" error and does not create the session.
- What happens when a user creates a worktree session in a directory with no git repo? The system automatically runs `git init`, then proceeds with the worktree session as normal. The user sees a brief notification that a repository was initialized.
- What happens when git init fails (e.g., permissions issue)? The session creation fails with a clear error explaining that a git repository could not be initialized, and suggests checking directory permissions.
- What happens when one worker is at max capacity but another has slots? The queue dispatches sessions to the worker with available capacity. The machine picker shows each worker's current load so users can make informed choices.
- What happens when SSH directory browsing is slow (high-latency remote)? The autocomplete shows a loading indicator and debounces keystrokes to avoid flooding the SSH connection. Results are cached for the duration of the browsing session.
- What happens when the SSH connection drops during directory browsing? The picker shows a "connection lost" inline error and offers to retry or switch to a different worker.
- What happens when a saved remote project's worker is deleted or permanently unreachable? The project entry shows a "worker unavailable" warning. The user can remove the bookmark or reassign it to a different worker (if the same path exists there).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a project picker in the "New Session" form that shows recent and bookmarked projects by name instead of raw directory paths
- **FR-002**: System MUST automatically track the last 10 unique directories used for session creation and display them as "Recent Projects" in the project picker
- **FR-003**: Users MUST be able to bookmark a project directory and optionally assign a custom alias/name to it
- **FR-004**: System MUST display only the project name (folder name or alias) as the primary label, with an abbreviated path as a secondary label (last 2 segments)
- **FR-005**: System MUST show a machine/worker selector in the new session form when more than one worker is configured
- **FR-006**: System MUST display a machine badge on each session card and queue entry showing which worker the session is running on
- **FR-007**: System MUST indicate worker connection status (connected/disconnected/error) and current session load in the machine selector
- **FR-008**: System MUST spawn Claude processes on remote workers via SSH when a remote worker is selected for a session
- **FR-009**: System MUST stream terminal I/O between the user's browser and a remote Claude process with no additional processing delay beyond network latency
- **FR-010**: System MUST validate that a specified working directory exists on the target machine (local or remote) before starting a session
- **FR-011**: System MUST display a clear error with recovery options when a remote connection fails (during session creation or mid-session)
- **FR-012**: System MUST show a compact connection health indicator on the main dashboard when remote workers are configured
- **FR-013**: System MUST always show a machine badge on session cards indicating the worker name. The machine *selector* dropdown and health *dashboard* MAY be hidden when only a local worker exists, but the per-session machine label MUST always be visible
- **FR-014**: Users MUST be able to remove, rename, and reorder bookmarked projects
- **FR-015**: System MUST persist project bookmarks and aliases across browser sessions
- **FR-016**: System MUST support session continuation (auto-suspend/resume) on remote workers, keeping the session on the same worker
- **FR-017**: System MUST restrict directory browsing in the project picker to the user's home directory (`$HOME`) — paths outside the home directory MUST NOT be browsable or selectable
- **FR-018**: System MUST reject session creation requests that specify a working directory outside the user's home directory, returning a clear error message
- **FR-019**: When a user creates a worktree session targeting a directory that is not a git repository, the system MUST automatically initialize a git repository in that directory before starting the session
- **FR-020**: The max active sessions limit MUST be enforced per worker (per machine), not globally — each worker's `max_sessions` capacity is independent, reflecting the RAM available on that machine
- **FR-021**: When a remote worker is selected, the directory picker MUST provide live filesystem browsing on the remote machine via SSH, with autocomplete behaving the same as local browsing
- **FR-022**: For saved/bookmarked projects, the user MUST be able to select them with one click — the system auto-selects both the directory and its bound worker. Remote project paths are inseparable from their worker.
- **FR-023**: Remote directory browsing MUST be restricted to the remote user's home directory (`$HOME` on the remote machine), matching the local security model
- **FR-024**: Users MUST be able to add, edit, and remove remote workers from a "Machines" section within the Settings panel — without using CLI or API commands
- **FR-025**: The "Add Machine" form MUST require name, SSH host, SSH username, and SSH key path (selected via a local file picker browsing the hub server's filesystem), and MUST provide a "Test Connection" button that verifies SSH connectivity before saving
- **FR-026**: System MUST display a text-only machine badge (worker name, e.g., "local" or "gpu-server") on every session card and queue entry — visible even when only one local worker exists
- **FR-027**: System MUST allow removing a worker only after confirming the user understands active sessions on that worker will be affected
- **FR-028**: The worker selector in the "New Session" form MUST include a "+ Add Machine" option that opens the Add Machine form inline, allowing users to add a remote worker without leaving the session creation flow
- **FR-029**: The directory picker in the "New Session" form MUST automatically browse the filesystem of the currently selected machine — selecting a remote worker switches the picker to browse that remote machine's directories; selecting local switches back to local browsing
- **FR-030**: The SSH key file picker in the "Add Machine" form MUST browse the hub server's local filesystem (not the remote machine), since private keys reside on the hub. It MUST allow selecting any file path (no restriction to `~/.ssh/`)

### Key Entities

- **Project**: A named reference to a working directory bound to a specific machine. Has a display name (auto-derived from folder name or user-assigned alias), a full directory path, a worker ID (required — local or remote), and a bookmarked/pinned flag. A remote project's path only exists on its associated worker. Selecting a saved project auto-selects both directory and machine.
- **Worker (existing)**: A local or remote machine capable of running sessions. Has connection status, SSH configuration (for remote), and capacity limits.
- **Session (existing, extended)**: Gains visible association with its worker. The worker identity is surfaced in the UI alongside the session title and status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new session in under 10 seconds from dashboard load (2 clicks for a recent project, no typing required)
- **SC-002**: Zero raw filesystem paths are visible in the default session creation flow (project names and abbreviated paths only)
- **SC-003**: Users can identify which machine a session is running on within 2 seconds of looking at a session card
- **SC-004**: Remote sessions start within 5 seconds of creation (after SSH connection is established) with terminal output streaming at the same frame rate as local sessions
- **SC-005**: Connection failures (SSH drops, worker offline) are communicated to the user within 10 seconds with a clear error message and recovery action
- **SC-006**: The interface remains clean and uncluttered for users with only a local machine (no visible remote/worker UI elements)
- **SC-007**: 90% of session creation flows use the project picker rather than manual path entry after the first week of usage

## Clarifications

### Session 2026-02-21

- Q: What does "directory should be secured" mean for the project picker? → A: Restrict browsing to user's home directory only (`$HOME`) — anything outside is blocked
- Q: Should worktree sessions auto-create a git repo if none exists? → A: Yes — when a user initiates a worktree session and the target directory is not a git repository, the system automatically initializes one before starting
- Q: Should max active sessions be global or per machine? → A: Per machine (per worker) — each worker has its own max active session limit, driven by RAM constraints
- Q: How should directory browsing work for remote workers? → A: Live SSH directory browsing — autocomplete works over SSH in real-time. Saved/bookmarked remote directories go directly; unsaved directories are browsable on the remote filesystem
- Q: Should saved projects remember their target worker? → A: Yes — a project is bound to its machine. A remote directory path only makes sense on the specific worker it belongs to. Clicking a saved project selects both directory and machine.
- Q: Where should the "Add Machine" (worker management) UI live? → A: In the Settings panel — a "Machines" tab/section where users add, edit, test connection, and remove remote workers
- Q: How should users provide SSH keys when adding a remote machine? → A: Path to existing key file on the server (e.g., `~/.ssh/id_rsa`) — no upload, no pasting key content. Most secure approach, avoids transmitting private key material over HTTP.
- Q: What should the machine badge show on each session card? → A: Just the worker name as text (e.g., "local", "gpu-server") — no colored dots or type tags on the badge itself
- Q: How should users add a new machine from the session creation form? → A: A "+ Add Machine" link at the bottom of the worker selector dropdown opens the Add Machine form inline, so users can add a remote worker without navigating to Settings
- Q: Is storing the SSH key path in the database a security concern? → A: No — only the filesystem path string is stored (not key contents). The private key stays on the hub server and is never sent to the remote machine. Standard SSH behavior. Acceptable as-is.
- Q: What scope should the SSH key file picker browse? → A: Full filesystem — any path on the hub server. The host machine may be Windows or Linux, and keys may live anywhere. No restriction to `~/.ssh/`.
- Q: Should the working directory picker auto-switch per selected machine? → A: Yes — user picks a machine first, then the directory picker browses that machine's filesystem. Local machine = local dirs, remote machine = remote dirs. The path is always on the selected machine.

## Assumptions

- Remote workers have Claude CLI installed and accessible in the PATH on the remote machine
- SSH key-based authentication is the only supported method for remote connections (no password auth)
- The project bookmarks are stored server-side (in the existing SQLite database) rather than in browser local storage, so they persist across devices when auth is enabled
- The local worker is always available and cannot be removed
- Working directory validation on remote machines is done via a quick SSH command (`test -d <path>`) before session creation
- The existing `node-pty` spawner model extends to remote by executing the `claude` command over SSH, with PTY allocation on the remote side
- The existing global `max_concurrent_sessions` setting is replaced by per-worker `max_sessions` (already present in the workers table) as the active capacity control
- Git auto-initialization for worktree sessions uses a simple `git init` with no additional configuration (no remote, no initial commit beyond what Claude may create)
- Directory security is enforced server-side — the backend rejects any path outside `$HOME` regardless of what the frontend sends
- Remote directory browsing uses SSH exec commands (e.g., `ls`) to list directories on the remote machine, with results cached per browsing session to reduce SSH round-trips
- Remote project bookmarks store the worker ID alongside the directory path, so "gpu-server:/home/user/myapp" is distinct from "local:/home/user/myapp"
