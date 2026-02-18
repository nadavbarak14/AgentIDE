# Feature Specification: C3 — Command & Control Dashboard

**Feature Branch**: `001-c3-dashboard`
**Created**: 2026-02-17
**Status**: Draft
**Input**: User description: "C3 distributed Command & Control dashboard for managing multiple AI coding agents (Claude Code CLI) across physical and virtual machines"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Launch and Monitor Parallel Claude Code Sessions (Priority: P1)

A developer opens the C3 dashboard in their browser. They see an empty session grid with a focus area. Two independent numbers govern the system: **`max_concurrent_sessions`** (default: **2**) controls how many Claude processes RUN simultaneously, while **`max_visible_sessions`** (default: 4) controls how many sessions the user SEES in the focus grid. The system operates as a **session scheduler**: when an active session goes idle (waiting for user input) AND the queue has waiting sessions, the idle session is automatically **suspended** — the Claude process is killed, the Claude session ID is saved, the session moves to "completed," and the freed slot activates the next queued session. This way, `max_concurrent_sessions=2` can cycle through 10+ sessions: each session gets its turn, does its work, and when it's waiting for the user, it yields to the next one. The user can later "Continue" any completed session to resume its conversation. The focus area prioritizes sessions **needing user attention**. The developer creates sessions pointing at project directories. Each queues up. When an execution slot is available (active < `max_concurrent_sessions`), the next queued session activates — spawning a real `claude` CLI process in a PTY. When Claude finishes or goes idle with queued items waiting, the session completes, the execution slot frees, and the next queued session activates. Completed sessions can be resumed later via `claude -c`.

**Why this priority**: This is the core value proposition — a rolling IDE that lets you handle many projects/tasks simultaneously with real Claude Code sessions running in the background. Without this, the product has no reason to exist.

**Independent Test**: Create 3 sessions with `max_concurrent_sessions=2`. Verify 2 activate immediately with live terminals. Verify the 3rd queues. When an active session goes idle (Claude waiting for input) and a queued session exists, verify: (1) the idle session's process is killed, (2) its Claude session ID is saved, (3) it moves to "completed," (4) the queued session auto-activates within 3 seconds. Verify the user can later "Continue" the completed session to resume it.

**Acceptance Scenarios**:

1. **Given** the dashboard is open, **When** a user creates a new session (specifying a project directory), **Then** if a slot is available, the session activates immediately showing a live Claude terminal; otherwise it enters the queue
2. **Given** active sessions equal the concurrency limit, **When** a user creates another session, **Then** the session appears in the queue with its position visible
3. **Given** sessions are queued, **When** an active session's Claude process completes and exits, **Then** the slot frees up and the next queued session auto-activates within 3 seconds
3b. **Given** an active session goes idle (waiting for user input), **When** the idle timeout is detected, **Then** the session stays active with a "!" indicator regardless of whether sessions are queued. The queue does NOT advance — only process completion frees slots
4. **Given** an active session is running, **When** the user observes the terminal, **Then** output appears character-by-character in real-time (no line buffering) with correct colors, spinners, and formatting
5. **Given** an active session's Claude is waiting for input (detected from terminal idle), **When** the session is not currently in focus, **Then** the session is marked with a "!" indicator on its tab/card header (no banner or overlay). When the user finishes responding to their current session, this session automatically surfaces to the focus area
6. **Given** a session needs input, **When** the user types in the terminal, **Then** the input is sent directly to the Claude process and output resumes — no process kill or restart needed
7. **Given** a session has completed (Claude process exited), **When** the user clicks "Continue," **Then** the system spawns `claude -c` with the stored session ID, occupying an active slot
8. **Given** all active slots are occupied, **When** the user clicks "Continue" on a completed session, **Then** the continue request is queued and activates when a slot opens
9. **Given** the user has 10 sessions, **When** they look at the dashboard, **Then** they see the focused sessions prominently, with a scrollable list/overview of all other sessions and their statuses
10. **Given** overflow sessions are shown in the "More Sessions" area, **When** the user clicks an overflow session card, **Then** that session swaps into the focus area
11. **Given** session "test" is in focus and the user types a response and presses enter, **When** session "test1" has `needs_input=true`, **Then** the focus auto-switches to show "test1" in the front within 1 second. The "!" indicator on "test1" is visible on its tab before and after the switch
12. **Given** a completed session exists in directory X with a Claude session ID, **When** the user creates a new session in the same directory X (without "Start Fresh" checked), **Then** the system continues the previous session via `claude -c` instead of starting a new one
13. **Given** a completed session exists in directory X, **When** the user creates a session with "Start Fresh" checked, **Then** the system starts a brand-new Claude session ignoring the previous one

---

### User Story 2 — View File Changes and Code Context (Priority: P2)

While an agent session is running, a developer wants to see what files are being changed. They click a session card to expand it. A sidebar shows the file tree of the project directory. They click a file to view its contents in a read-only code viewer with syntax highlighting. They click "Show Changes" to see a visual diff (additions in green, deletions in red) of all uncommitted changes.

**Why this priority**: Visibility into what the agent is actually doing (file changes, diffs) is the second most critical need — it builds trust and enables intervention before mistakes compound.

**Independent Test**: Can be tested by starting a session where the agent modifies files, then verifying the file tree updates, files are viewable with syntax highlighting, and the diff view correctly shows changes.

**Acceptance Scenarios**:

1. **Given** a session is active and the agent has modified files, **When** the user opens the file explorer sidebar, **Then** the project file tree is displayed and reflects the current state of the remote working directory
2. **Given** the file explorer is open, **When** the user clicks a file, **Then** the file content is displayed in a read-only code viewer with correct syntax highlighting
3. **Given** the agent has uncommitted changes, **When** the user clicks "Show Changes," **Then** a split-view diff is displayed showing additions (green) and deletions (red)
4. **Given** the agent generates a binary artifact (image, PDF), **When** the artifact is detected, **Then** it is rendered inline or available for download in the session card

---

### User Story 3 — Live Preview of Running Application (Priority: P3)

A developer is working on a web application. The agent starts a dev server on the remote machine. The dashboard detects the running port and embeds the live application preview in a split-pane next to the terminal. When the agent makes changes to source files, the preview automatically refreshes to show the latest state.

**Why this priority**: Live preview closes the feedback loop — the developer sees the actual result of the agent's work without manually opening browsers or configuring tunnels. Important but not essential for core monitoring.

**Independent Test**: Can be tested by starting a session that launches a dev server, verifying the dashboard detects the port, shows the preview in an embedded pane, and auto-refreshes when source files change.

**Acceptance Scenarios**:

1. **Given** a session's agent starts a dev server on a port, **When** the system detects the running port, **Then** the live preview pane appears alongside the terminal showing the application
2. **Given** the live preview is active, **When** the agent modifies source files, **Then** the preview refreshes automatically within 3 seconds of the file save
3. **Given** the live preview is active, **When** the dev server stops or crashes, **Then** the preview pane shows a clear "Server stopped" message instead of a blank screen

---

### User Story 4 — Connect and Manage Remote Worker Machines (Priority: P4)

A developer wants to offload heavy AI sessions to a high-RAM VPS. They open the C3 settings and add a new "worker" by providing SSH connection details (host, user, key path). The system establishes a secure tunnel. From then on, when adding tasks to the queue, the developer can choose which worker machine should run the session. Sessions on remote workers appear identically in the grid to local sessions.

**Why this priority**: The distributed architecture (Hub + Spoke) is the differentiator over running locally, but the product delivers value even with only local workers first.

**Independent Test**: Can be tested by configuring a remote worker via SSH details, adding a task assigned to that worker, and verifying the session starts on the remote machine with identical terminal and file browsing experience.

**Acceptance Scenarios**:

1. **Given** the settings page is open, **When** the user adds a new worker with valid SSH credentials, **Then** the system establishes a connection and the worker appears as "Connected" within 10 seconds
2. **Given** a remote worker is connected, **When** the user adds a task assigned to that worker, **Then** the session starts on the remote machine and output streams to the dashboard grid
3. **Given** a remote session is active, **When** the user opens the file explorer, **Then** the remote project file tree is displayed as if it were local
4. **Given** a remote worker loses connectivity, **When** the SSH tunnel drops, **Then** the session card shows a "Disconnected" status and the system attempts reconnection automatically
5. **Given** no ports are exposed on the remote machine, **When** the system communicates with the worker, **Then** all traffic flows exclusively through SSH tunnels

---

### User Story 5 — Resume Sessions After Restart (Priority: P5)

A developer refreshes the browser or restarts their machine. When they reopen the C3 dashboard, the system detects any still-running agent processes on connected workers. Active sessions are restored in the grid with their terminal output history. The task queue state is preserved.

**Why this priority**: Resilience is expected for a production-grade tool but is not blocking initial usage.

**Independent Test**: Can be tested by starting sessions, refreshing the browser, and verifying sessions are rediscovered and terminal history is restored.

**Acceptance Scenarios**:

1. **Given** sessions are active, **When** the user refreshes the browser, **Then** all active sessions reappear in the grid within 5 seconds with their current output
2. **Given** tasks are in the pending queue, **When** the user restarts the dashboard, **Then** the queue is restored with tasks in their original order
3. **Given** a session was "Locked/Pinned," **When** the dashboard restarts, **Then** the lock state is preserved

---

### Edge Cases

- What happens when the concurrency limit is changed while sessions are active? Active sessions continue; new sessions only start when slots open under the new limit.
- What happens when a worker machine runs out of disk space or memory during a session? The session card displays the error output; the session is marked "Failed" and the next queued task starts.
- What happens when two tasks target the same repository? The system auto-creates isolated working copies so parallel sessions do not conflict.
- What happens when the user resizes the browser window? The masonry grid reflows responsively; terminal components resize to fit.
- What happens when the SSH tunnel to a remote worker is interrupted mid-session? The system retries the connection; the terminal shows a "Reconnecting..." indicator; upon reconnection, buffered output is delivered.
- What happens when the user attempts to start more sessions than workers can handle? Excess tasks remain queued; the user sees a clear indication of queue position.
- What happens when multiple sessions are waiting for input simultaneously? They all stay active with "!" indicators. The display remains frozen; switching only happens after the user types and presses Enter in one session, then the next needing-input session surfaces.
- What happens when sessions are queued but all active sessions are idle? Sessions are only auto-suspended after the user has interacted with them. A session that just started or was just resumed from the queue will NOT be auto-suspended — the user must send it input first, proving it did real work. This prevents sessions from cycling between active and queued without ever operating.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display sessions in an attention-based focus layout. The focus grid shows up to `max_visible_sessions` sessions (configurable, default 4). Focus priority: (1) sessions needing user input (`needs_input`), (2) sessions manually selected by the user, (3) recently activated sessions. Sessions where the agent is operating autonomously do NOT need focus — they work in the background. Clicking an overflow session card MUST swap it into the focus area
- **FR-002**: System MUST maintain a persistent session queue where users can create, reorder, and remove queued sessions. Sessions ARE the queue items — there is no separate "task" entity
- **FR-003**: System MUST auto-activate queued sessions when active session count drops below `max_concurrent_sessions` (default: **2**). This is independent of `max_visible_sessions` (the display limit). The concurrency limit applies only to actively running Claude processes — completed/queued sessions do not count
- **FR-030**: **Auto-suspend only after user interaction**: A session is only eligible for auto-suspend after the user has sent it input (proving the session did work in response). When an eligible session goes idle AND the queue has waiting sessions, the system MUST auto-suspend it (kill process, re-queue for continuation) to free the slot. On re-activation, the guard resets — the user must interact again before the session can be suspended again. This prevents loops where sessions cycle between active and queued without doing work. Pinned/locked sessions are never auto-suspended. When no sessions are queued, idle sessions stay active with the "!" indicator
- **FR-004**: System MUST render terminal output in real-time with character-level streaming (no line buffering), supporting ANSI colors, spinners, and cursor movement
- **FR-005**: System MUST handle interactive terminal prompts (Yes/No, arrow-key selection) allowing user input directly via the web terminal — without killing or restarting the process
- **FR-006**: System MUST allow users to inject predefined commands ("Auto-Approve," custom text) into an active session's terminal
- **FR-007**: System MUST provide a "Lock/Pin" toggle on each session card that prevents the session from being auto-archived or minimized
- **FR-025**: System MUST detect when an active session needs user input (terminal idle detection) and mark it with a compact "!" indicator on the session tab/card header — NOT a banner or overlay message. The system MUST NOT show any global "session needs input" banner. The focus grid display MUST be **frozen/stable by default** — it MUST NOT auto-switch unless the user explicitly types input and presses Enter. When the user sends input to the currently focused session, the focus MUST auto-switch to the next session needing attention. If the user has NOT typed anything, the display MUST remain unchanged even if other sessions have `needs_input=true`. This prevents switching loops when multiple sessions are waiting simultaneously. The display MUST only update on: (1) user sends input (Enter key), (2) user clicks a session to focus it, (3) a displayed session completes/fails (fill its slot), (4) a new session activates when slots are available
- **FR-026**: The system has two independent limits: `max_concurrent_sessions` (default: **2**, how many Claude processes run simultaneously) and `max_visible_sessions` (default: **4**, how many sessions appear in the focus grid). Both MUST be configurable via a settings panel accessible from a gear icon in the dashboard header. The settings panel MUST display both values with controls to adjust them (e.g., number steppers or dropdowns). Changes to `max_concurrent_sessions` take effect immediately: active sessions continue running but new sessions only start when slots open under the new limit. Valid range: 1 to 10. When queue has waiting sessions and an active session goes idle, the idle session is auto-suspended to free its slot (FR-030). Loop prevention ensures recently-suspended sessions are not immediately re-suspended
- **FR-008**: System MUST support parallel work on the same repository using isolated working copies
- **FR-009**: System MUST support sessions rooted in different project directories (poly-repo)
- **FR-010**: System MUST display a read-only file tree of the working directory for each session
- **FR-011**: System MUST allow users to view any file from the file tree in a read-only code viewer with syntax highlighting
- **FR-012**: System MUST render a split-view visual diff (additions/deletions) of uncommitted changes for each session
- **FR-013**: System MUST detect and render generated binary artifacts (images, PDFs) inline or as downloadable links
- **FR-014**: System MUST detect running dev server ports on worker machines and embed live application previews
- **FR-015**: System MUST auto-refresh embedded live previews when source files change on the worker
- **FR-016**: System MUST allow users to configure remote worker machines via SSH connection details (host, user, key path)
- **FR-017**: System MUST establish all remote connections exclusively through SSH tunnels with no publicly exposed ports
- **FR-018**: System MUST detect and restore active agent processes after browser refresh or dashboard restart
- **FR-019**: System MUST persist queue state across restarts
- **FR-020**: System MUST auto-reconnect to remote workers when SSH tunnels are interrupted
- **FR-021**: When a session's Claude process completes and exits naturally, the system MUST free the active slot and move the session to a "Completed" state while preserving the Claude session ID for later continuation via `claude -c`
- **FR-022**: System MUST allow users to continue a completed session by spawning `claude -c` (continue flag) with the stored session ID, resuming the previous conversation in a new active slot
- **FR-023**: If all active slots are occupied when a user requests to continue a session, the continue request MUST be queued and auto-started when a slot opens
- **FR-024**: System MUST log all session lifecycle events (start, complete, continue, fail, reconnect) with structured context
- **FR-027**: Session creation MUST provide a directory path input with server-side autocomplete (type-ahead suggestions listing directories on the target worker, starting from `$HOME`). The input MUST also allow creating a new directory inline if the typed path does not yet exist
- **FR-028**: When creating a session in a directory that has a previous completed session with a stored Claude session ID, the system MUST automatically continue that session (via `claude -c`) instead of starting fresh. The session creation form MUST include a "Start Fresh" checkbox (unchecked by default) that overrides this behavior to force a new session
- **FR-029**: On server restart, sessions that were active before the restart MUST be marked "completed" (not "failed") regardless of whether they have a Claude session ID. These sessions MUST be re-openable via `claude --continue` (which resumes the most recent session in the working directory). The sidebar MUST show a "Restart" button on completed/failed sessions for one-click re-opening

### Key Entities

- **Session**: The primary entity. Represents a real Claude Code CLI session. Key attributes: unique ID, Claude session ID (for `claude -c` continuation), status (queued/active/completed/failed), assigned worker, working directory, queue position, needs_input flag, title (user label), lock state, continuation count. Sessions ARE the queue — there is no separate task entity.
- **Worker**: A machine capable of running agent sessions. Key attributes: name, SSH connection details, status (connected/disconnected/error), resource usage, max concurrent sessions
- **Artifact**: A file generated during a session (image, PDF, diff, etc.). Key attributes: type, path, session association, render method

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view 4 or more simultaneous agent sessions on a single screen without switching tabs or windows
- **SC-002**: Terminal output appears in the dashboard within 100 milliseconds of being generated on the worker
- **SC-003**: A pending task auto-starts within 3 seconds of a session slot becoming available
- **SC-004**: Users can add a new task to the queue and see it reflected in the UI within 1 second
- **SC-005**: File tree and code viewer load within 2 seconds of user request for projects up to 10,000 files
- **SC-006**: Visual diffs render within 3 seconds for changesets up to 500 modified lines
- **SC-007**: Live application preview refreshes within 3 seconds of a source file change
- **SC-008**: Remote worker connection is established within 10 seconds of providing valid SSH credentials
- **SC-009**: Dashboard session restoration after browser refresh completes within 5 seconds for up to 10 active sessions
- **SC-010**: System operates securely with zero publicly exposed ports on any worker machine
- **SC-011**: 90% of users can add a task, observe it run, and view its file changes on first use without documentation

## Clarifications

### Session 2026-02-17

- Q: How should the directory picker for session creation work? → A: Text input with autocomplete from server-side directory listing, plus ability to create a new directory if the typed path doesn't exist
- Q: What should the autocomplete base path be? → A: User's home directory (`$HOME`) on the target worker
- Q: How should non-existent directory creation work? → A: Show a "Create folder" hint inline when path doesn't match; directory is created when the session is submitted
- Q: Should overflow session mini-cards be interactive? → A: Yes, clicking an overflow mini-card swaps that session into the focus area
- Q: What happens to the focus view when an active session completes? → A: The view auto-switches to the next session that needs input or is waiting; focus always prioritizes sessions needing attention
- Q: Should session creation auto-continue the latest session in the same directory? → A: Yes, always attempt to continue the most recent completed session in that directory (if a Claude session ID exists). A "Start Fresh" checkbox (unchecked by default) allows overriding this to force a new session
- Q: Should the user be able to override auto-continuation? → A: Yes, via a "Start Fresh" checkbox on the create form (unchecked by default = always continue if possible)
- Q: How do `max_concurrent_sessions` and `max_visible_sessions` relate? → A: They are independent. `max_concurrent_sessions` controls how many Claude processes RUN (throughput). `max_visible_sessions` controls how many sessions the user SEES (attention). When an agent is operating autonomously, it does not need focus — focus is for sessions needing user attention (needs_input, newly completed). The execution limit can exceed the display limit
- Q: What happens to sessions after server restart? → A: Sessions that were active before restart MUST be marked "completed" (not "failed") so they are easily re-openable. Even without a stored Claude session ID, `claude --continue` can resume the most recent session in that directory. The sidebar MUST show a prominent "Restart" button on these sessions for one-click re-opening
- Q: How should "needs input" be indicated? → A: Show a compact "!" on the session tab/card header only. No banner, no overlay, no global message like "A session needs your input"
- Q: When does auto-switch happen? → A: ONLY after the user sends input to the currently focused session (types and presses Enter). The display is frozen/stable by default — no switching unless the user typed something. If multiple sessions are waiting for input simultaneously, there is no switching loop; the display stays put until the user responds to one session, then the next waiting session surfaces
- Q: What should happen when a session goes idle and the queue has items? → A: Nothing — idle sessions stay active with "!" indicator. Queue only advances when a session's process completes and exits. No auto-suspend, no killing idle sessions. This prevents infinite scheduling loops where sessions cycle between active and queued without doing work
- Q: What is the default max_concurrent_sessions? → A: 2
- Q: Should queued sessions be clickable? → A: Queued sessions only enter the queue automatically. No special click interaction needed — they activate when a slot opens
- Q: Should there be automated tests for the session lifecycle? → A: Yes. Tests MUST verify: (1) session creation enters queue when slots full, (2) idle session is auto-suspended when queue has items, (3) Claude session ID is saved on suspend, (4) next queued session activates after suspend, (5) suspended session can be continued via "Continue" button
- Q: Where on the dashboard should the max_concurrent_sessions control appear? → A: Gear icon in the dashboard header opens a settings panel/sidebar

## Assumptions

- Users have SSH access (key-based) to their remote machines
- The Claude Code CLI is pre-installed on all worker machines
- Workers run Linux or macOS (Windows workers are out of scope for initial release)
- The dashboard is accessed via a modern browser (Chrome, Firefox, Safari, Edge — latest 2 versions)
- Users manage their own SSH keys; the system stores key paths, not key contents
- Git is available on all worker machines for worktree and diff functionality
- The maximum practical concurrency is bounded by worker machine resources, not the dashboard itself
