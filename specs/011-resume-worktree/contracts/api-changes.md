# API Contract Changes: Session Resume & Worktree Isolation

**Feature**: 011-resume-worktree
**Date**: 2026-02-20

## Modified Endpoints

### POST /api/sessions — Create session

**Request body** (changed):

```json
{
  "workingDirectory": "/path/to/project",
  "title": "My Session",
  "targetWorker": null,
  "startFresh": false,
  "worktree": true
}
```

New field:
- `worktree` (boolean, optional, default: `false`) — When true, session spawns Claude Code with `--worktree` flag for git worktree isolation.

**Response** (changed):

```json
{
  "id": "uuid",
  "claudeSessionId": null,
  "workerId": null,
  "status": "queued",
  "workingDirectory": "/path/to/project",
  "title": "My Session",
  "worktree": true,
  "position": 1,
  "pid": null,
  "needsInput": false,
  "lock": false,
  "continuationCount": 0,
  "createdAt": "2026-02-20T...",
  "startedAt": null,
  "completedAt": null,
  "updatedAt": "2026-02-20T..."
}
```

New field in response:
- `worktree` (boolean) — Reflects stored worktree preference.

### GET /api/sessions — List sessions

**Response**: Each session object now includes `worktree: boolean`.

### POST /api/sessions/:id/continue — Continue session

**No request changes**.

**Behavior change**: When session has a `claudeSessionId`, spawns with `--resume <claudeSessionId>` instead of `-c`. Falls back to `-c` when no `claudeSessionId`.

The `--worktree` flag is NOT re-added on continuation (per spec edge case).

## Unchanged Endpoints

All other session endpoints (PATCH, DELETE, kill, input, panel-state, comments) are unchanged.

## WebSocket Messages

### session_status (Server → Client)

Already includes `claudeSessionId` — no changes needed.

```json
{
  "type": "session_status",
  "sessionId": "uuid",
  "status": "active",
  "claudeSessionId": "claude-conversation-id",
  "pid": 12345
}
```
