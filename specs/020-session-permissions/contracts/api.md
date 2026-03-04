# API Contracts: Session Permission Flags

**Feature**: 020-session-permissions
**Date**: 2026-03-03

## Modified Endpoints

### POST /api/sessions — Create Session

**Change**: Add optional `flags` field to request body.

**Request Body** (updated):

```json
{
  "workingDirectory": "/home/user/project",
  "title": "My Session",
  "targetWorker": null,
  "worktree": true,
  "startFresh": false,
  "flags": "--dangerously-skip-permissions"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `workingDirectory` | string | yes | — | Absolute path to working directory |
| `title` | string | yes | — | Session display name |
| `targetWorker` | string \| null | no | null | Worker ID (null = local) |
| `worktree` | boolean | no | false | Use isolated git worktree |
| `startFresh` | boolean | no | false | Don't continue last conversation |
| `flags` | string | no | `""` | Additional CLI flags to pass to Claude |

**Response** (HTTP 201):

```json
{
  "id": "uuid-here",
  "workerId": null,
  "status": "active",
  "workingDirectory": "/home/user/project",
  "title": "My Session",
  "worktree": true,
  "flags": "--dangerously-skip-permissions",
  "createdAt": "2026-03-03T10:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "pid": null
}
```

**Notes**:
- The `flags` field is stored in the database and returned in all session responses (GET /api/sessions, GET /api/sessions/:id).
- The `worktree` and `startFresh` fields continue to work as before. If the user selects the "Worktree" predefined chip, the frontend sets `worktree: true` (not appending `--worktree` to the `flags` string).
- Invalid flags are not validated by the server — they are passed through to the Claude process.

### GET /api/sessions — List Sessions

**Change**: Each session object in the response array now includes the `flags` field.

### GET /api/sessions/:id — Get Session

**Change**: The session object now includes the `flags` field.

## Unchanged Endpoints

All other endpoints remain unchanged:
- PATCH /api/sessions/:id
- DELETE /api/sessions/:id
- POST /api/sessions/:id/kill
- GET /api/settings
- PATCH /api/settings
- WebSocket /ws

## Process Spawning Contract

When a session is activated, the Claude process is spawned with:

```
claude --settings <hook_settings_path> [--worktree] [--continue] [<user_flags>...]
```

**Argument order**:
1. `--settings <path>` (always present, system-managed)
2. `--worktree` (if `worktree === true`)
3. `--continue` (if `startFresh === false` AND `worktree === false`)
4. User-provided flags from `flags` field (parsed and deduplicated)

**Examples**:

| User Input | worktree | startFresh | Resulting Command |
|------------|----------|------------|-------------------|
| (empty) | false | false | `claude --settings ... --continue` |
| (empty) | false | true | `claude --settings ...` |
| (empty) | true | false | `claude --settings ... --worktree` |
| `--dangerously-skip-permissions` | false | true | `claude --settings ... --dangerously-skip-permissions` |
| `--dangerously-skip-permissions` | true | false | `claude --settings ... --worktree --dangerously-skip-permissions` |
