# API Contract Changes: Session Save & Performance

**Feature**: 041-session-save-performance
**Date**: 2026-03-17

## Modified Endpoints

### GET `/api/sessions`

**Change**: Now returns completed/failed sessions (previously deleted on startup).

**Response** (unchanged shape, more results):
```json
[
  {
    "id": "string",
    "status": "active" | "completed" | "failed" | "crashed",
    "workingDirectory": "string",
    "title": "string",
    "crashRecoveredAt": "string | null",
    "createdAt": "string",
    "completedAt": "string | null"
  }
]
```

**Behavioral Change**: Frontend must now filter by status to show relevant sessions. Previously, only `active` and `crashed` sessions existed in DB.

---

### DELETE `/api/sessions/:id`

**Change**: No longer called automatically. Only triggered by explicit user action.

**Existing Contract** (unchanged):
```
DELETE /api/sessions/:id
Response: 204 No Content
```

---

### GET `/api/sessions/:id/panel-state`

**Change**: No API contract change. Performance improvement via frontend caching (no backend change needed).

---

### PUT `/api/sessions/:id/panel-state`

**Change**: No API contract change. Called more frequently due to frontend auto-save (every 5 seconds debounced).

---

## New Endpoint

### GET `/api/sessions/:id/metadata`

**Purpose**: Batch fetch extension and widget data in a single round-trip (replaces two separate calls).

**Request**:
```
GET /api/sessions/:id/metadata
```

**Response**:
```json
{
  "widgets": [
    {
      "id": "string",
      "type": "string",
      "data": {}
    }
  ],
  "extensions": [
    {
      "id": "string",
      "name": "string",
      "enabled": true
    }
  ]
}
```

**Replaces**:
- `GET /api/sessions/:id/widgets`
- `GET /api/sessions/:id/extensions`

Old endpoints remain for backward compatibility but new code should use `/metadata`.

---

## WebSocket Changes

### New Broadcast: `session_state_changed`

**Purpose**: Push session state changes to all connected clients, reducing need for 1-second polling.

**Message Format**:
```json
{
  "type": "session_state_changed",
  "sessionId": "string",
  "changes": {
    "status": "active" | "completed" | "failed" | "crashed",
    "needsInput": true | false,
    "title": "string"
  }
}
```

**Sent When**:
- Session status changes (active → completed, active → failed, etc.)
- Session `needsInput` flag changes
- Session title changes

**Client Behavior**: On receiving this broadcast, client updates local session state without waiting for next poll cycle. Polling interval can be relaxed from 1s to 5s as a fallback.

### New Broadcast: `session_recovery_progress`

**Purpose**: Inform UI about crash recovery status on startup.

**Message Format**:
```json
{
  "type": "session_recovery_progress",
  "sessionId": "string",
  "status": "recovering" | "recovered" | "recovery_failed",
  "method": "tmux_reattach" | "ssh_reconnect" | null
}
```

**Sent When**: During crash recovery sequence on hub startup.

---

## Backend Internal Changes (Not API)

### Repository Method Changes

| Method | Change |
|--------|--------|
| `deleteNonActiveSessions()` | Renamed to `cleanupStaleSessions(maxAgeDays: number)`. Only deletes sessions older than `maxAgeDays` with status `completed` or `failed`. |
| `deleteSession(id)` | No longer called from event handlers. Only called explicitly by user action (DELETE API) or by `cleanupStaleSessions()`. |

### Event Handler Changes

| Event | Before | After |
|-------|--------|-------|
| `session_completed` | Calls `repo.deleteSession(id)` | Calls `repo.completeSession(id)` (status update only) |
| `session_failed` | Calls `repo.deleteSession(id)` | Calls `repo.failSession(id)` (status update only) |

### PtySpawner Changes

| Method | Change |
|--------|--------|
| `scheduleScrollbackWrite()` | Flush interval reduced from 2000ms to 500ms |
| `spawn()` | Skill file injection changed from sync `fs.cpSync` loop to async or symlink-based approach |
