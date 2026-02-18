# REST API Contract: C3 Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17

All endpoints return JSON. Error responses use `{ error: string, details?: string }`.

## Sessions

Sessions are the primary entity. They represent real Claude Code CLI sessions and serve as both the queue and the active workspace.

### `GET /api/sessions`
List all sessions, ordered by status priority (active first, then queued by position, then completed).

**Query params**: `?status=queued|active|completed|failed` (optional filter)

**Response 200**:
```json
[
  {
    "id": "uuid",
    "claudeSessionId": "claude-session-id | null",
    "workerId": "uuid | null",
    "status": "active",
    "workingDirectory": "/home/user/project",
    "title": "Refactor Auth",
    "position": null,
    "pid": 12345,
    "needsInput": false,
    "lock": false,
    "continuationCount": 0,
    "createdAt": "2026-02-17T10:00:00Z",
    "startedAt": "2026-02-17T10:00:05Z",
    "completedAt": null,
    "updatedAt": "2026-02-17T10:00:05Z"
  }
]
```

### `POST /api/sessions`
Create a new session. If a slot is available, it activates immediately; otherwise it enters the queue.

**Request body**:
```json
{
  "workingDirectory": "/home/user/project",
  "title": "Refactor Auth",
  "targetWorker": "uuid | null"
}
```

**Response 201**: Created session object with `status: "active"` or `status: "queued"`.

### `PATCH /api/sessions/:id`
Update a session (reorder in queue, change title, toggle lock).

**Request body**:
```json
{
  "position": 3,
  "title": "Updated title",
  "lock": true
}
```

**Response 200**: Updated session object.

### `DELETE /api/sessions/:id`
Remove a session. Cannot delete active sessions (kill first).

**Response 204**: No content.
**Response 409**: Session is currently active.

### `POST /api/sessions/:id/continue`
Continue a completed session using `claude -c`. Activates immediately if slot available, otherwise queues.

**Response 200**: `{ "status": "active", "message": "Session resumed" }`
**Response 202**: `{ "status": "queued", "message": "Session queued for continuation" }`
**Response 409**: `{ "error": "Session is already active" }`

### `POST /api/sessions/:id/kill`
Kill an active session's Claude process.

**Response 200**: `{ "ok": true }`
**Response 409**: Session not active.

### `POST /api/sessions/:id/input`
Send input to an active session's terminal (alternative to WebSocket binary input).

**Request body**:
```json
{ "text": "yes\n" }
```

**Response 200**: `{ "ok": true }`
**Response 409**: Session not active.

## Workers

### `GET /api/workers`
List all workers with status.

**Response 200**:
```json
[
  {
    "id": "uuid",
    "name": "VPS-01",
    "type": "remote",
    "sshHost": "192.168.1.100",
    "sshPort": 22,
    "sshUser": "ubuntu",
    "status": "connected",
    "maxSessions": 4,
    "activeSessionCount": 2,
    "lastHeartbeat": "2026-02-17T10:00:00Z"
  }
]
```

### `POST /api/workers`
Add a new remote worker.

**Request body**:
```json
{
  "name": "VPS-01",
  "sshHost": "192.168.1.100",
  "sshPort": 22,
  "sshUser": "ubuntu",
  "sshKeyPath": "/home/user/.ssh/id_rsa",
  "maxSessions": 4
}
```

**Response 201**: Created worker object.

### `DELETE /api/workers/:id`
Remove a worker. Cannot remove workers with active sessions.

**Response 204**: No content.
**Response 409**: Worker has active sessions.

### `POST /api/workers/:id/test`
Test SSH connection to a worker.

**Response 200**: `{ "ok": true, "latency_ms": 45 }`
**Response 502**: `{ "error": "Connection failed", "details": "..." }`

## File Explorer

### `GET /api/sessions/:id/files`
Get file tree for a session's working directory.

**Query params**: `?path=/relative/subdir` (optional, default: root)

**Response 200**:
```json
{
  "path": "/",
  "entries": [
    { "name": "src", "type": "directory" },
    { "name": "package.json", "type": "file", "size": 1234 }
  ]
}
```

### `GET /api/sessions/:id/files/content`
Get file content for viewing.

**Query params**: `?path=/src/index.ts` (required)

**Response 200**:
```json
{
  "path": "/src/index.ts",
  "content": "...",
  "language": "typescript",
  "size": 1234
}
```

**Response 413**: File too large (>1MB).

### `GET /api/sessions/:id/diff`
Get git diff for a session's working directory.

**Response 200**:
```json
{
  "diff": "unified diff string",
  "filesChanged": 3,
  "additions": 45,
  "deletions": 12
}
```

## Settings

### `GET /api/settings`
Get current dashboard settings.

**Response 200**:
```json
{
  "maxConcurrentSessions": 4,
  "maxVisibleSessions": 2,
  "autoApprove": false,
  "gridLayout": "auto",
  "theme": "dark"
}
```

### `PATCH /api/settings`
Update settings.

**Request body**:
```json
{
  "maxConcurrentSessions": 4,
  "maxVisibleSessions": 2,
  "autoApprove": false,
  "gridLayout": "auto",
  "theme": "dark"
}
```

**Response 200**: Updated settings object.
