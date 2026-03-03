# Feature Specification: Remove Completed Sessions

**Feature Branch**: `021-remove-completed-sessions`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "remove completed sessions"

## Clarifications

### Session 2026-03-03

- Q: Should failed sessions also auto-remove, or persist for debugging? → A: Auto-remove both completed AND failed sessions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-Remove Sessions on Completion (Priority: P1)

When a session completes or fails, the system automatically deletes it and all associated data. The dashboard only ever shows active sessions. No manual removal buttons or bulk delete actions are needed — cleanup is automatic and immediate.

**Why this priority**: This is the entire feature. Simplest possible approach — sessions that are no longer active simply cease to exist.

**Independent Test**: Create a session, let it complete (or fail), verify it disappears from the dashboard and its data is cleaned up from the database and filesystem.

**Acceptance Scenarios**:

1. **Given** a session is active, **When** the Claude process exits normally (status → completed), **Then** the session and all associated data are automatically deleted.
2. **Given** a session is active, **When** the Claude process crashes or exits with error (status → failed), **Then** the session and all associated data are automatically deleted.
3. **Given** the dashboard shows 5 active sessions, **When** 3 of them complete, **Then** the dashboard shows only the 2 remaining active sessions with no trace of the completed ones.
4. **Given** a session completes, **When** cleanup runs, **Then** scrollback files, artifacts, comments, panel states, and preview data are all removed.
5. **Given** the application starts, **When** there are stale completed/failed sessions in the database from before this change, **Then** they are cleaned up on startup.

---

### Edge Cases

- What happens if scrollback file deletion fails? Cleanup continues — log a warning but don't block session removal.
- What happens to connected WebSocket clients viewing a session that completes? They receive the existing `session_completed`/`session_failed` event, and the frontend removes the session from state since it no longer exists.
- What happens if the application crashes mid-cleanup? On next startup, the startup cleanup (acceptance scenario 5) handles any leftover non-active sessions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically delete a session and all associated data when the session's status transitions to completed or failed.
- **FR-002**: System MUST clean up all associated data on session deletion (scrollback files, artifacts, comments, panel states, preview data).
- **FR-003**: System MUST clean up any existing completed/failed sessions on application startup.
- **FR-004**: The dashboard MUST only display active sessions — completed and failed sessions are never shown.
- **FR-005**: The frontend MUST remove a session from its local state when it receives a completion or failure event, since the session no longer exists on the server.

### Key Entities

- **Session**: Only exists while active. Identified by `id`, has a `status` that is always `active` during its lifetime. Cascade-deletes artifacts, comments, panel states, and scrollback files on removal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a session completes or fails, it is fully deleted (database record + files) within 1 second.
- **SC-002**: The dashboard never shows completed or failed sessions — only active sessions are visible.
- **SC-003**: After cleanup, 100% of associated data (files, database records) is removed with no orphaned data remaining.
- **SC-004**: On application startup, zero completed/failed sessions remain in the database.

## Assumptions

- The existing `deleteSession()` repository method and cascade logic already handles full data cleanup correctly.
- The existing `session_completed` and `session_failed` events provide the hook point for triggering auto-deletion.
- The existing frontend WebSocket handlers for session status changes can be adapted to remove sessions from state instead of updating their status.
- The "Continue" button for completed sessions is no longer applicable since completed sessions won't exist. This is an accepted tradeoff.
