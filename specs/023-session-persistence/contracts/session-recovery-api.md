# API Contract: Session Recovery

**Feature**: 023-session-persistence
**Date**: 2026-03-03

## Updated Endpoints

### GET /api/sessions

**Change**: Now returns sessions with `crashed` status in addition to `active`.

**Query Parameters**:
- `status` (optional): Filter by status. Values: `active`, `completed`, `failed`, `crashed`
- When no status filter: returns `active` and `crashed` sessions (not completed/failed since those are auto-deleted)

**Response** (200):
```json
[
  {
    "id": "uuid-1",
    "status": "active",
    "title": "Feature work",
    "workingDirectory": "/home/user/project",
    "workerId": null,
    "pid": 12345,
    "needsInput": false,
    "lock": false,
    "createdAt": "2026-03-03T10:00:00Z",
    "startedAt": "2026-03-03T10:00:01Z",
    "completedAt": null,
    "updatedAt": "2026-03-03T10:05:00Z"
  },
  {
    "id": "uuid-2",
    "status": "crashed",
    "title": "Bug fix",
    "workingDirectory": "/home/user/project2",
    "workerId": "worker-1",
    "pid": null,
    "needsInput": false,
    "lock": false,
    "createdAt": "2026-03-03T09:00:00Z",
    "startedAt": "2026-03-03T09:00:01Z",
    "completedAt": null,
    "updatedAt": "2026-03-03T10:00:00Z",
    "crashRecoveredAt": "2026-03-03T10:00:05Z"
  }
]
```

### DELETE /api/sessions/:id

**Change**: Now also allows deleting sessions with `crashed` status (previously only `completed` and `failed`).

**Behavior**:
- `active` sessions: returns 409 (must kill first)
- `completed`/`failed` sessions: deletes (existing behavior)
- `crashed` sessions: deletes session + scrollback file + cascade

**Response** (200):
```json
{ "success": true }
```

**Response** (409 — active session):
```json
{ "error": "Cannot delete active session. Kill it first." }
```

### GET /api/sessions/:id/scrollback

**New endpoint**: Returns the preserved scrollback content for a crashed session.

**Response** (200):
```json
{
  "sessionId": "uuid-2",
  "scrollback": "<raw terminal output including ANSI escape sequences>",
  "truncated": false
}
```

**Response** (404 — no scrollback):
```json
{ "error": "No scrollback available for this session" }
```

**Response** (404 — session not found):
```json
{ "error": "Session not found" }
```

## WebSocket Messages

### New: Session Crashed Status

**Direction**: Server → Client

```json
{
  "type": "session_status",
  "sessionId": "uuid-2",
  "status": "crashed",
  "claudeSessionId": null,
  "pid": null
}
```

**When sent**: During crash recovery, after sessions are marked as crashed. Broadcast to any connected WebSocket clients.

### New: Session Recovering Status

**Direction**: Server → Client

```json
{
  "type": "session_recovering",
  "sessionId": "uuid-2",
  "workerId": "worker-1",
  "message": "Reconnecting to remote session..."
}
```

**When sent**: While the hub is attempting to reattach to a remote tmux session.

### Existing: Session Activated (reattached)

```json
{
  "type": "session_status",
  "sessionId": "uuid-2",
  "status": "active",
  "claudeSessionId": null,
  "pid": 0
}
```

**When sent**: After successfully reattaching to a remote tmux session. PID is 0 for remote sessions (no local PID).

## Internal Protocol: Remote tmux Commands

### Spawn Claude in tmux (new behavior)

```bash
# Instead of direct: cd /dir && claude --settings ...
# Now wrap in tmux:
tmux new-session -d -s c3-<short-id> "cd /dir && C3_SESSION_ID=<id> C3_HUB_PORT=<port> claude --settings /tmp/.c3-hooks-<port>/settings.json"
tmux attach -t c3-<short-id>
```

### Check tmux session alive (recovery)

```bash
tmux has-session -t c3-<short-id> 2>/dev/null && echo 'ALIVE' || echo 'DEAD'
```

### Reattach to tmux session (recovery)

```bash
tmux attach -t c3-<short-id>
```

### Kill tmux session (cleanup)

```bash
tmux kill-session -t c3-<short-id> 2>/dev/null
```
