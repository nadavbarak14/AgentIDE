# Feature Specification: UX Polish — Comments, Overflow, Unsaved Guard

**Feature Branch**: `004-ux-polish`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description: "tiny changes - pending comments should stay seen in both git and files windows, and be editable and deleteable. also make the more session that waiting a lot more bold somehow, also closing a modified file needs approval to delete changes"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - GitHub-Style Inline Comments with Edit/Delete (Priority: P1)

Users leave code review comments in both the DiffViewer (Git panel) and FileViewer (Code editor). In the DiffViewer, comments can be placed on both old and new file columns — the code snippet stored and sent to Claude comes from the correct column the user commented on. When selecting text to comment, the exact selected text is captured as the code snippet. Comments display inline below the line they reference — like GitHub PR reviews. Each inline comment shows its text with edit and delete controls. In the FileViewer, inline comments are rendered using Monaco zone widgets (injected below the commented line inside the editor), with the same edit/delete controls. When editing a comment, the edit UI uses the same full textarea block as the add-comment UI. No pending comments summary strip appears at the bottom of either viewer.

**Why this priority**: Comments are the primary feedback mechanism. Inline display (GitHub-style) keeps comments in context with the code they reference, making review more natural than a separate summary strip. Edit/delete are essential for correcting mistakes before delivery.

**Independent Test**: Open Git panel, select a file in the diff. Click the "+" gutter on a line in either column — comment input appears inline below that line. Type feedback, save. The comment stays inline with edit/delete buttons. Click edit — the same full textarea block opens for editing. Click delete — comment disappears. Select text in either column — floating "Comment" button appears. The exact selected text is captured as the code snippet. Click "Send All" — pending comments are delivered with the correct code text from the column that was commented on. Open FileViewer — inline comments appear via Monaco zone widgets below commented lines with edit/delete controls.

**Acceptance Scenarios**:

1. **Given** the DiffViewer is showing a file diff, **When** user clicks the "+" gutter on a line in either old or new column, **Then** an inline comment input appears below that line
2. **Given** a pending comment exists on a line, **When** the line is visible in the diff, **Then** the comment is displayed inline below the line with edit and delete controls
3. **Given** a pending comment is displayed inline, **When** user clicks edit, **Then** the same full textarea block (as used for adding comments) opens pre-filled with the comment text
4. **Given** a pending comment is displayed inline, **When** user clicks delete, **Then** the comment is removed from the display and the backend
5. **Given** user selects text in either column of the DiffViewer, **When** the selection is made, **Then** a floating "Comment" button appears and the exact selected text is captured as the code snippet
6. **Given** a comment is created on the old file column, **When** delivered to Claude, **Then** the code snippet contains the old file text (not the new file text)
7. **Given** a comment is created on the new file column, **When** delivered to Claude, **Then** the code snippet contains the new file text
8. **Given** a file is open in FileViewer with existing comments, **When** the editor loads, **Then** inline comments are rendered via Monaco zone widgets below the commented lines with edit/delete controls
9. **Given** comments exist, **When** viewing either panel, **Then** no summary strip appears at the bottom — comments are shown inline only
10. **Given** a pending comment is displayed inline, **When** user clicks "Send Now", **Then** that single comment is immediately delivered to Claude and removed from the display, while other pending comments remain
11. **Given** multiple pending comments exist, **When** user clicks "Send All" in the header, **Then** all pending comments are delivered as a batch (existing behavior preserved)

---

### User Story 2 - Bold Overflow Indicator for Waiting Sessions (Priority: P2)

When sessions in the overflow bar (collapsed "more sessions" section) are waiting for input, the current yellow "!" indicator is too subtle. Users need a more prominent visual signal so they don't miss sessions that need attention.

**Why this priority**: Missing a waiting session wastes time. A bolder indicator catches the user's eye faster, especially when focused on a different session's terminal.

**Independent Test**: Have more active sessions than maxVisible, with at least one overflow session needing input. Collapse the overflow bar. Verify the entire bar row has an amber/yellow background that clearly signals attention.

**Acceptance Scenarios**:

1. **Given** the overflow bar is collapsed and one or more overflow sessions need input, **When** the user glances at the bar, **Then** the entire collapsed bar row has an amber/yellow background with the existing "!" indicator
2. **Given** the overflow bar is collapsed and no overflow sessions need input, **When** the user views the bar, **Then** the bar displays with its normal default background (no amber highlight)

---

### User Story 3 - Unsaved File Close Confirmation (Priority: P2)

When a user has unsaved changes in the FileViewer and attempts to close the file tab, the changes are silently discarded. Users need a confirmation dialog to prevent accidental data loss.

**Why this priority**: Losing edits without warning is a common source of frustration. This is a standard UX pattern expected in any editor.

**Independent Test**: Open a file in FileViewer, make edits (yellow dot appears). Click the tab close button (×). A confirmation prompt appears asking whether to discard changes or cancel. Choose cancel — tab stays open with edits intact. Choose discard — tab closes and changes are lost. If the file is not modified, clicking × closes immediately without prompt.

**Acceptance Scenarios**:

1. **Given** a file tab has unsaved changes (isModified=true), **When** user clicks the close button (×), **Then** a confirmation prompt appears asking to discard changes or cancel
2. **Given** the confirmation prompt is showing, **When** user chooses "Cancel", **Then** the tab remains open with all unsaved changes intact
3. **Given** the confirmation prompt is showing, **When** user chooses "Discard", **Then** the tab closes and unsaved changes are lost
4. **Given** a file tab has no unsaved changes, **When** user clicks the close button (×), **Then** the tab closes immediately without any prompt

---

### Edge Cases

- What happens when a comment's file is not currently selected in the DiffViewer file sidebar? The comment is not visible until the user selects that file — there is no separate summary strip.
- What happens if the user tries to close multiple modified tabs at once (e.g., closing the panel)? Each modified tab should prompt individually, or a single batch prompt should list all modified files.
- What happens when a comment is deleted while "Send All" is in progress? The delete should be queued until the send completes, or the comment should be excluded from delivery.
- What happens when a comment is on the old file column but the file was deleted in the new version? The comment still displays inline on the old column side.
- What happens when user selects text spanning multiple lines in the DiffViewer? The exact selected text (potentially multi-line) is captured as the code snippet, not a line-range reconstruction.

## Clarifications

### Session 2026-02-18

- Q: How should the overflow waiting indicator look when bolder? → A: Amber/yellow background on the entire collapsed bar row when sessions are waiting
- Q: Where should comments live and how should selection work in the side-by-side diff? → A: Comments are inline in both DiffViewer and FileViewer. Commenting is allowed on both old and new file columns in the DiffViewer. The code snippet sent to Claude must come from the correct column. The exact selected text is used as the code snippet. No pending comments summary strip in either viewer. Edit UI uses the same full textarea as the add-comment UI. FileViewer displays inline comments via Monaco zone widgets.
- Q: How should inline comments display in the FileViewer (Monaco Editor)? → A: Monaco zone widgets — inject inline comment HTML below commented lines inside the editor, with full edit/delete controls, matching the DiffViewer inline experience.
- Q: Should "Send All" remain alongside the new per-comment "Send Now" button? → A: Keep both — "Send Now" on each comment for immediate delivery + "Send All" in header for batch delivery.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Pending comments MUST display inline in the DiffViewer below the line they reference (GitHub-style), with edit and delete controls on each comment
- **FR-002**: Users MUST be able to edit the text of any pending comment inline before it is sent. The edit UI MUST use the same full textarea block as the add-comment UI
- **FR-003**: Users MUST be able to delete any pending comment inline before it is sent
- **FR-004**: Comment edits and deletes MUST be persisted to the backend immediately
- **FR-009**: In the side-by-side DiffViewer, commenting MUST be allowed on both old and new file columns. The "+" gutter and text selection commenting MUST work on both sides
- **FR-010**: No pending comments summary strip SHALL appear at the bottom of either FileViewer or DiffViewer — all comment display is inline
- **FR-011**: The code snippet stored with a comment MUST come from the correct column (old file text for old-column comments, new file text for new-column comments)
- **FR-012**: When commenting via text selection, the exact selected text MUST be captured as the code snippet (not a line-range reconstruction)
- **FR-013**: FileViewer MUST display inline comments using Monaco zone widgets below commented lines, with edit and delete controls
- **FR-014**: Each pending inline comment MUST have a "Send Now" button that immediately delivers that single comment to Claude and removes it from the display. The existing "Send All" button in the header MUST remain for batch delivery
- **FR-005**: The overflow bar MUST display an amber/yellow background on the entire collapsed bar row when any overflow session needs input
- **FR-006**: Closing a file tab with unsaved changes MUST show a confirmation prompt before discarding changes
- **FR-007**: The confirmation prompt MUST offer at least "Discard" and "Cancel" options
- **FR-008**: Closing a file tab without unsaved changes MUST proceed immediately without a prompt

### Key Entities

- **Comment**: Existing entity (id, sessionId, filePath, startLine, endLine, codeSnippet, commentText, status, createdAt, sentAt). Edit modifies `commentText`. Delete removes the record. The `codeSnippet` field stores the exact text from the column the user commented on.
- **PanelState**: Existing entity. No schema changes needed — comments are already session-scoped, not panel-scoped.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A comment created in either viewer is visible inline in both DiffViewer and FileViewer within the same polling cycle
- **SC-002**: Users can edit and delete pending comments with no more than 2 clicks each
- **SC-003**: The overflow waiting indicator is noticeable within 1 second of glancing at the collapsed bar
- **SC-004**: Zero unsaved edits are silently discarded — every close of a modified tab requires explicit user action
- **SC-005**: Code snippets sent to Claude always contain the correct text from the column the user commented on, never text from the opposite column
