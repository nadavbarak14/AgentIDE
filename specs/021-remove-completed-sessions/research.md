# Research: Remove Completed Sessions

## R1: Auto-Deletion Hook Point

**Decision**: Add deletion logic directly in `session-manager.ts` after `completeSession()` and `failSession()` calls, since the manager already handles session lifecycle transitions.

**Rationale**: The session-manager's `completeSession()` method calls `repo.completeSession(id)` then emits `session_completed`. The WebSocket handler and hub-entry handler both listen to this event synchronously. Adding `repo.deleteSession(id)` + `shellSpawner.deleteScrollback(id)` after the event emission ensures: (1) the WS broadcast has already sent the completion status to clients, (2) hub-entry has already cleaned up file watchers/remote agents, (3) only then is the DB record deleted. Same pattern for `failSession()`.

**Alternatives considered**:
- Delete in hub-entry.ts event handler: Works but creates ordering dependency between hub-entry and websocket event handlers. Less reliable.
- Delete in the repository's completeSession() method itself: Would prevent the event from firing with the session data still in DB. Breaks the event flow.
- Use a setTimeout/async delay: Unnecessary complexity — synchronous deletion after event emission is sufficient.

## R2: Startup Cleanup Strategy

**Decision**: Add a `deleteNonActiveSessions()` method to repository that runs `DELETE FROM sessions WHERE status != 'active'` and manually cascades panel_states. Call it during server startup in hub-entry.ts.

**Rationale**: On startup, the server needs to clean up any sessions that were completed/failed before this feature existed, or that were left in a non-active state due to a crash. A single SQL query handles this efficiently. The manual panel_states cascade follows the existing pattern in `deleteSession()`.

**Alternatives considered**:
- Loop through individual `deleteSession()` calls: Works but slower for many sessions and unnecessary — at startup there are no scrollback files to worry about for old sessions (they may not exist).
- Database migration to delete existing records: One-time but less maintainable than a startup check.

## R3: Frontend Session Removal on Completion

**Decision**: Modify the WebSocket message handler in `useSessionQueue.ts` to remove the session from local state (filter it out) when receiving a `session_status` message with status `completed` or `failed`, instead of updating the session's status field.

**Rationale**: The frontend currently receives `{ type: "session_status", status: "completed" }` and updates the session in state. With auto-deletion, the server deletes the session immediately after broadcasting. The frontend should just remove it from state since the session no longer exists server-side. This requires no new WebSocket event types — just a behavior change in the existing handler.

**Alternatives considered**:
- Add a new `session_deleted` WebSocket event: Unnecessary complexity — the completion/failure event already signals the session is done.
- Poll for session list: Adds latency and server load.

## R4: UI Cleanup

**Decision**: Remove the "Continue" button from SessionCard (shown for completed sessions with claudeSessionId) and the "Completed" section from SessionQueue sidebar. These UI elements reference completed sessions which will no longer exist.

**Rationale**: Since completed sessions are auto-deleted, UI elements that depend on `session.status === 'completed'` are dead code. Removing them keeps the UI clean and avoids confusion.

**Alternatives considered**:
- Leave the code in place: Creates dead paths that confuse future developers.
- Feature-flag the old behavior: Over-engineering for a simple cleanup.
