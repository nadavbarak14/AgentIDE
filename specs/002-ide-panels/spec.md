# Feature Specification: IDE Panels — Contextual Panels for Single-Session Focus

**Feature Branch**: `002-ide-panels`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description: "now i want something like this - instead of just claude code instance, to act like an IDE. we need this - show files option and really show them, git option - show diff, and give option to add comments to claude code, so it fix it. also option to have web view like a browser. all this context should be saved and switched. all of this supported only when 1 in the view grid for now."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse and View Project Files (Priority: P1)

A developer is watching a Claude Code session work on their project. They want to see what files exist and inspect their contents — not just watch terminal output scroll by. When the grid is set to show a single session (1-view mode), a toolbar appears alongside the terminal. The developer clicks the "Files" button. A file explorer panel slides open beside the terminal, showing the project's directory tree. They click a file to open it in a read-only code viewer with syntax highlighting. They can open multiple files in tabs within the panel. The file tree live-updates as the agent creates or modifies files.

**Why this priority**: Seeing actual file contents is the most fundamental IDE capability. Without it, the user is blind to what the agent is producing — they can only read terminal output and hope.

**Independent Test**: Start a session in 1-view mode. Click "Files" in the toolbar. Verify the file tree loads showing the project directory. Click a file — verify it opens in a syntax-highlighted viewer. Have the agent create a new file — verify the tree updates to show it.

**Acceptance Scenarios**:

1. **Given** a session is displayed in 1-view grid mode, **When** the user clicks the "Files" toolbar button, **Then** a file explorer panel opens beside the terminal showing the project directory tree
2. **Given** the file explorer is open, **When** the user clicks a file, **Then** the file content opens in a read-only code viewer with syntax highlighting appropriate to the file type
3. **Given** a file is open in the viewer, **When** the agent modifies that file, **Then** the viewer updates to show the new content within 2 seconds (with a visual flash or indicator that the file changed)
4. **Given** the file explorer is open, **When** the agent creates a new file, **Then** the file tree updates to show the new file within 2 seconds
5. **Given** the file explorer is open, **When** the agent deletes a file, **Then** the file tree removes the entry within 2 seconds; if the deleted file was open in a tab, the tab closes automatically
6. **Given** the user has multiple files open in tabs, **When** the user clicks between tabs, **Then** the viewer switches to show the selected file instantly
7. **Given** the session is in multi-view grid mode (2+ sessions visible), **When** the user looks at the session card, **Then** no IDE toolbar or panels are shown — only the terminal

---

### User Story 2 — Review Git Changes and Comment for Fixes (Priority: P2)

A developer wants to review what the agent has changed before accepting the work. They click the "Git" button in the toolbar. A panel opens showing a list of changed files (staged and unstaged) with change counts. They click a file to see a split-view diff (old vs. new). The developer spots an issue — a variable name is wrong. They select the problematic lines in the diff and click "Comment." A comment box appears where they type "This variable should be named `userCount` not `count`." The comment is sent to the Claude Code session as a message, and the agent proceeds to fix it.

**Why this priority**: Git diffs and the ability to comment for fixes is the core feedback loop. This turns the dashboard from a passive viewer into an interactive review tool where the user can guide the agent.

**Independent Test**: Start a session where the agent modifies files. Click "Git" — verify changed files are listed. Click a file — verify diff renders correctly. Add a comment on a line — verify the comment text is injected into the Claude Code terminal as a user message.

**Acceptance Scenarios**:

1. **Given** a session is in 1-view mode, **When** the user clicks the "Git" toolbar button, **Then** a panel opens showing all changed files (uncommitted changes) with addition/deletion counts per file
2. **Given** the Git panel is open, **When** the user clicks a changed file, **Then** a split-view diff displays showing the old version and new version side by side, with additions highlighted in green and deletions in red
3. **Given** the diff view is showing, **When** the user selects one or more lines and clicks "Comment," **Then** a text input appears anchored to those lines where the user can type feedback
4. **Given** the user has typed a comment, **When** they submit it, **Then** the comment text is composed into a contextual message (including the file name, line numbers, and the selected code) and injected into the Claude Code session's terminal as user input
5. **Given** a comment has been submitted, **When** the agent responds, **Then** the comment is marked as "Sent" in the diff view so the user can track which feedback has been delivered
6. **Given** the agent makes additional changes after a comment, **When** the user views the Git panel, **Then** the diff updates to reflect the latest state of the files
7. **Given** the user has submitted multiple comments, **When** they view the Git panel, **Then** all comments are visible on their respective lines with their status (Sent/Pending)

---

### User Story 3 — Preview Web Application Output (Priority: P3)

A developer is building a web application. The agent starts a dev server. The developer clicks the "Preview" button in the toolbar. A panel opens showing an embedded browser view of the running application. The preview automatically refreshes when the agent modifies source files. The developer can interact with the preview (click links, fill forms) to test the application without leaving the dashboard.

**Why this priority**: Live preview closes the feedback loop for web development — the developer sees actual rendered output instead of guessing from code. However, it's less universally applicable than file browsing and git diffs (not all projects are web apps).

**Independent Test**: Start a session where the agent launches a dev server. Click "Preview" — verify the embedded browser loads the application. Have the agent change a visible element — verify the preview updates.

**Acceptance Scenarios**:

1. **Given** a session is in 1-view mode and the agent has started a dev server, **When** the user clicks the "Preview" toolbar button, **Then** an embedded browser panel opens showing the running application
2. **Given** the preview panel is open, **When** the agent modifies source files, **Then** the preview refreshes to show the updated application within 3 seconds
3. **Given** the preview panel is open, **When** the user clicks links or interacts with form elements in the preview, **Then** the interactions work as they would in a normal browser
4. **Given** the preview panel is open, **When** the dev server stops or crashes, **Then** the panel displays a clear "Server not running" message with the last known URL
5. **Given** no dev server is running, **When** the user clicks "Preview," **Then** the panel opens with a message "No server detected" and a URL input field where the user can manually enter a URL to preview
6. **Given** the preview is showing a manually entered URL, **When** the user enters a different URL, **Then** the preview navigates to the new URL

---

### User Story 4 — Panel State Persists Across Session Switches (Priority: P4)

A developer has Session A in 1-view mode with the Files panel open, viewing `src/index.ts`. They switch to Session B — the panel state for Session A (which panel is open, which files are in tabs, scroll positions) is saved. Session B loads with its own panel state — the Git panel was previously open here. The developer switches back to Session A — the Files panel reappears with `src/index.ts` still open at the same scroll position.

**Why this priority**: Without state persistence, switching between sessions would be frustrating — the user would have to re-open panels and re-navigate to their files every time. This is what makes the IDE panels feel like a real workspace rather than a disposable view.

**Independent Test**: Open a session in 1-view mode, open the Files panel, and navigate to a specific file. Switch to a different session. Switch back — verify the Files panel is still open with the same file displayed.

**Acceptance Scenarios**:

1. **Given** Session A has the Files panel open with specific files in tabs, **When** the user switches to Session B, **Then** Session A's panel state (open panel, tabs, scroll positions) is saved
2. **Given** Session B has its own panel state (e.g., Git panel open), **When** the user switches to Session B, **Then** Session B's saved panel state is restored
3. **Given** Session A's panel state was saved, **When** the user switches back to Session A, **Then** the exact panel state is restored including open panel type, file tabs, and scroll positions
4. **Given** a session has panel state saved, **When** the user refreshes the browser, **Then** the panel state for the currently viewed session is restored after reload
5. **Given** a session has no previously saved panel state, **When** the user opens it in 1-view mode, **Then** no panel is open by default — only the terminal is shown with the toolbar available

---

### Edge Cases

- What happens when the user resizes the browser while a panel is open? The terminal and panel resize proportionally, maintaining readable content in both.
- What happens when the agent modifies a file that is currently open in the viewer? The viewer live-updates with the new content and briefly flashes the changed lines to draw attention.
- What happens when a very large file is opened in the viewer? Files larger than 1 MB display the first 1 MB with a "File truncated" notice and an option to load more.
- What happens when the file tree has thousands of files? The tree uses lazy loading — only the expanded directories load their contents. A search/filter input at the top of the file tree allows quick navigation.
- What happens when the user submits a comment but the Claude session has already completed? The comment is queued. If the user resumes the session (via Continue), the comment is delivered as the first message.
- What happens when the dev server runs on a non-standard port? The system attempts to detect any listening port. If multiple ports are detected, the user can choose which one to preview.
- What happens when the user switches from 1-view to multi-view grid mode while a panel is open? The panel closes, the panel state is saved, and if the user returns to 1-view for that session, the panel state is restored.
- What happens when a git diff is very large (hundreds of files changed)? The file list is paginated or virtualized. Individual file diffs load on demand when clicked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an IDE toolbar when a session is shown in 1-view grid mode (single session visible). The toolbar MUST contain buttons for "Files," "Git," and "Preview." The toolbar MUST NOT appear when the grid shows 2 or more sessions
- **FR-002**: System MUST display a file explorer panel when the "Files" button is clicked. The panel shows the project directory tree of the session's working directory. Directories are expandable/collapsible. The tree uses lazy loading for directories with many entries
- **FR-003**: System MUST display file contents in a read-only code viewer with syntax highlighting when a file is clicked in the file explorer. The viewer supports tabbed navigation for multiple open files
- **FR-004**: System MUST live-update the file tree and any open file viewers when the agent creates, modifies, or deletes files. Updates MUST appear within 2 seconds of the file system change
- **FR-005**: System MUST provide a search/filter input at the top of the file tree that filters the tree to show only matching file and directory names
- **FR-006**: System MUST display a Git changes panel when the "Git" button is clicked. The panel lists all uncommitted changed files (both staged and unstaged) with per-file addition and deletion counts
- **FR-007**: System MUST render a split-view diff (old vs. new) when a changed file is clicked in the Git panel. Additions MUST be highlighted in green, deletions in red
- **FR-008**: System MUST allow users to select lines in the diff view and add a comment. The comment input MUST appear anchored to the selected lines
- **FR-009**: When a comment is submitted, the system MUST compose a contextual message containing the file path, line numbers, the selected code snippet, and the user's comment text. This message MUST be injected into the Claude Code session as user input
- **FR-010**: System MUST track comment status (Pending, Sent) and display the status on each comment in the diff view
- **FR-011**: System MUST display an embedded web preview panel when the "Preview" button is clicked. If a dev server is detected, the preview loads it automatically. If no server is detected, a URL input field is shown
- **FR-012**: System MUST auto-refresh the web preview when source files in the session's working directory change
- **FR-013**: System MUST allow the user to interact with the web preview (click links, fill forms, scroll) as in a normal browser
- **FR-014**: System MUST save panel state per session. Panel state includes: which panel is open (or none), open file tabs and their scroll positions, Git panel scroll position, and Preview URL. Panel state MUST persist when switching between sessions
- **FR-015**: System MUST restore saved panel state when the user returns to a session in 1-view mode
- **FR-016**: System MUST save panel state to persistent storage so it survives browser refresh and dashboard restart
- **FR-017**: When the grid mode changes from 1-view to multi-view, the system MUST close any open panel, save the panel state, and hide the toolbar. When returning to 1-view, the system MUST restore the saved panel state and show the toolbar
- **FR-018**: System MUST truncate files larger than 1 MB in the code viewer, showing the first 1 MB with a "File truncated" notice and option to load more
- **FR-019**: System MUST support comment queuing — if a comment is submitted after the session's Claude process has exited, the comment is stored and delivered as the first message when the session is resumed

### Key Entities

- **Panel State**: Per-session record of the IDE panel configuration. Attributes: session ID, active panel type (files/git/preview/none), open file tabs (ordered list of file paths), active tab index, per-tab scroll positions, git panel scroll position, preview URL
- **Comment**: A user's feedback on a specific code change. Attributes: unique ID, session ID, file path, start line, end line, selected code snippet, comment text, status (Pending/Sent), timestamp
- **Changed File**: A file with uncommitted git changes. Attributes: file path, change type (modified/added/deleted/renamed), additions count, deletions count, diff content

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open a project file and view its contents within 2 seconds of clicking it in the file tree
- **SC-002**: File tree updates (new/modified/deleted files) appear within 2 seconds of the file system change
- **SC-003**: Git diff renders within 3 seconds for changesets up to 500 modified lines
- **SC-004**: Users can submit a code review comment and see the agent respond to it without leaving the dashboard
- **SC-005**: Panel state is fully restored (correct panel, correct files, correct scroll positions) when switching back to a session
- **SC-006**: Web preview loads and displays correctly within 3 seconds of clicking the Preview button when a dev server is running
- **SC-007**: 90% of users can browse files and submit a comment on first use without needing documentation
- **SC-008**: Panel state survives browser refresh — the user sees the same panel configuration after reloading the page

## Assumptions

- The C3 dashboard from feature 001 is implemented and provides the session grid, session management, and terminal rendering infrastructure
- The 1-view grid mode is an existing grid layout option where a single session occupies the full display area
- File system watching is available on worker machines to detect file changes in real-time
- Git is installed on all worker machines and available for diff generation
- The embedded web preview displays content from the dev server — browser security policies may limit what can be previewed (assumed acceptable for local development servers)
- Comment injection works by delivering the comment text as user input to the active Claude Code session, as if the user had typed it
