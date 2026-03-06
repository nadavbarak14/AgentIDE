# API Contract: POST /api/sessions (updated)

**Change**: Update request body to replace `startFresh` with `continueLatest` and `resume`.

## Request

```
POST /api/sessions
Content-Type: application/json
```

### Body

```json
{
  "workingDirectory": "/path/to/project",
  "title": "Session Name",
  "targetWorker": "worker-uuid-or-null",
  "worktree": false,
  "continueLatest": false,
  "resume": false,
  "flags": "--dangerously-skip-permissions"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| workingDirectory | string | Yes | - | Absolute path for Claude |
| title | string | Yes | - | Display name |
| targetWorker | string \| null | No | local worker | Worker ID |
| worktree | boolean | No | false | Use git worktree |
| continueLatest | boolean | No | false | Pass `--continue` to Claude |
| resume | boolean | No | false | Pass `--resume` to Claude (interactive picker) |
| flags | string | No | "" | Additional CLI flags |

### Removed Fields

| Field | Reason |
|-------|--------|
| startFresh | No longer needed — fresh is the default behavior |

## Response

No changes to response format. Same 201 response with session object.

## Behavior

| Flags | Claude Args |
|-------|-------------|
| (default) | `[...userFlags]` |
| `continueLatest: true` | `['--continue', ...userFlags]` |
| `resume: true` | `['--resume', ...userFlags]` |
| `worktree: true` | `['--worktree', ...userFlags]` |
| `continueLatest: true, resume: true` | `['--resume', ...userFlags]` (resume wins) |
| `worktree: true, continueLatest: true` | `['--worktree', ...userFlags]` (worktree wins) |
