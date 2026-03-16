# Feature Specification: Agent Work Report

**Feature Branch**: `040-agent-work-report`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Agent Work Report extension — agent shows its work with screenshots, recordings, diffs, and text summaries as an HTML report file, viewable in a dedicated extension panel, exportable to GitHub PRs with uploaded media assets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent Builds a Work Report (Priority: P1)

After an agent finishes implementing a feature or fixing a bug, it creates an HTML report file in the session directory. The agent writes the report using normal file tools (it knows HTML), adding text summaries, inline screenshots, embedded video references, and code diffs to demonstrate what was done and prove it works. The report is viewable in a dedicated extension panel that renders the HTML file.

**Why this priority**: This is the core value — the agent can "show its work" by producing a visual, evidence-backed report of what it accomplished. Without this, there is nothing to view or export.

**Independent Test**: Can be tested by having an agent complete a task, call the attachment skills to stage media, write the report HTML, and verify the extension panel renders it with all media visible.

**Acceptance Scenarios**:

1. **Given** an agent has completed work in a session, **When** the agent creates a `report.html` file in the session directory, **Then** the extension panel renders the report with all content visible.
2. **Given** a report already exists, **When** the agent updates the report file with new content, **Then** the extension panel refreshes to show the updated version.
3. **Given** the agent wants to include a screenshot, **When** it calls the screenshot attachment skill, **Then** the image is copied to the report assets directory and the skill returns a relative path the agent can embed in the HTML.
4. **Given** the agent wants to include a video recording, **When** it calls the video attachment skill, **Then** the video file is copied to the report assets directory and a usable path is returned.
5. **Given** the agent wants to show code changes, **When** it calls the diff attachment skill, **Then** a diff is generated and returned in a format the agent can embed in the report HTML.

---

### User Story 2 - Report Exports to GitHub PR (Priority: P2)

When the agent pushes its work to GitHub and creates a PR, it converts the HTML report into a GitHub-compatible format. Images and videos are uploaded to GitHub as assets. The PR body contains a markdown version of the report with embedded uploaded media.

**Why this priority**: The report's value multiplies when it travels with the PR — reviewers and stakeholders see the proof without needing access to the IDE. Depends on the report existing first (P1).

**Independent Test**: Can be tested by creating a report with mixed media, calling the export skill, and verifying the resulting PR body contains markdown text with valid GitHub-hosted image/video URLs.

**Acceptance Scenarios**:

1. **Given** a completed report with text and screenshots, **When** the agent calls the GitHub export skill, **Then** images are uploaded to GitHub and the PR description contains markdown with embedded image URLs.
2. **Given** a report with video recordings, **When** the agent exports to GitHub, **Then** videos are converted to a GitHub-supported format and uploaded as PR assets.
3. **Given** a report with code diffs, **When** exported to GitHub, **Then** diffs appear as fenced code blocks in the PR markdown.
4. **Given** the agent creates a PR, **When** the export completes, **Then** the full report content is present in the PR body or as a PR comment.

---

### User Story 3 - Session-Scoped Lifecycle (Priority: P3)

The report and all its assets (screenshots, videos) are tied to the session. When the session ends or is cleaned up, the report file and its assets directory are removed. No persistent storage or database tables are needed.

**Why this priority**: Keeps the system clean and simple. Reports are transient artifacts — their lasting form is the GitHub PR, not local storage.

**Independent Test**: Can be tested by creating a report with assets, ending the session, and verifying the report file and assets directory no longer exist.

**Acceptance Scenarios**:

1. **Given** a session with a report and attached media, **When** the session is removed or cleaned up, **Then** the report file and all assets in the report directory are deleted.
2. **Given** a session is active with no report yet, **When** the user views the extension panel, **Then** the panel shows an empty/placeholder state.

---

### Edge Cases

- What happens when the agent references a screenshot/video that doesn't exist or was deleted? The report should show a broken-media placeholder gracefully.
- What happens when a video is too large to upload to GitHub? The export skill should warn the agent and skip or compress the video.
- What happens when the agent overwrites the report? Only one `report.html` exists — the latest version is what matters.
- What happens when GitHub API rate limits are hit during media upload? The export skill should report the failure so the agent can retry or reduce media.
- What happens when no media is attached and the report is text-only? The export should still work, producing a clean markdown PR body.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new extension (`work-report`) with a panel that renders the session's `report.html` file in an iframe.
- **FR-002**: The extension panel MUST auto-refresh when the report file changes on disk.
- **FR-003**: System MUST provide a skill (`/report.attach-screenshot`) that copies a screenshot image to the report assets directory and returns a relative file path for HTML embedding.
- **FR-004**: System MUST provide a skill (`/report.attach-video`) that copies a video recording to the report assets directory and returns a relative file path for HTML embedding.
- **FR-005**: System MUST provide a skill (`/report.attach-diff`) that generates a diff for specified files or commits and returns it in a format the agent can embed in the report HTML.
- **FR-006**: System MUST provide a skill (`/report.export-github`) that converts the HTML report to GitHub-compatible markdown, uploads all referenced images and videos to GitHub, and returns the formatted PR body text.
- **FR-007**: The export skill MUST convert video recordings to a GitHub-supported video format before uploading.
- **FR-008**: The report file and assets directory MUST be scoped to the session and cleaned up when the session ends.
- **FR-009**: The extension panel MUST show a meaningful empty state when no report exists yet.
- **FR-010**: All media paths in the report MUST use relative paths so the report renders correctly in the extension iframe.

### Key Entities

- **Report File**: A single `report.html` file in the session's working directory. The agent has full control over its content — any valid HTML is accepted.
- **Report Assets Directory**: A subdirectory (e.g., `.report-assets/`) within the session directory that holds copied screenshots, videos, and other media referenced by the report.
- **Attached Media**: Screenshots (PNG/JPG), video recordings, and diff text stored in the assets directory.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agent can produce a complete work report with text, images, and video in under 60 seconds after finishing a task.
- **SC-002**: The report extension panel displays the report within 2 seconds of the file being created or updated.
- **SC-003**: Exported GitHub PR descriptions render correctly with all images visible and videos playable inline on GitHub.
- **SC-004**: 100% of session-scoped report assets are cleaned up when the session ends — no orphaned files remain.
- **SC-005**: The report workflow adds no more than 5 new skills to the agent's skill set, keeping the interface simple and discoverable.

## Assumptions

- The agent already has access to file read/write tools and can author HTML directly — no report templating system is needed.
- GitHub supports uploading images and videos to PRs via the API, and those URLs can be embedded in PR descriptions.
- Video format conversion can be handled server-side using commonly available tools.
- The existing extension system (manifest, iframe rendering, skill registration, board commands) is sufficient — no changes to the extension framework are needed.
- The existing file-watching infrastructure can be reused for detecting report file changes.
