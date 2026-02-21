# API Contracts: Clean Session & Connection UX

**Feature**: 012-session-connect-ux
**Date**: 2026-02-21

## New Endpoints

### Projects

#### `GET /api/projects`

List all projects (bookmarked first, then recent).

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `workerId` | string | No | all | Filter by worker |

**Response** `200`:
```json
{
  "projects": [
    {
      "id": "uuid",
      "workerId": "worker-uuid",
      "directoryPath": "/home/user/projects/myapp",
      "displayName": "MyApp",
      "bookmarked": true,
      "position": 0,
      "lastUsedAt": "2026-02-21T10:00:00Z",
      "createdAt": "2026-02-20T09:00:00Z",
      "workerName": "local",
      "workerType": "local",
      "workerStatus": "connected"
    }
  ]
}
```

---

#### `POST /api/projects`

Create or bookmark a project.

**Request Body**:
```json
{
  "workerId": "worker-uuid",
  "directoryPath": "/home/user/projects/myapp",
  "displayName": "MyApp",
  "bookmarked": true
}
```

**Validation**:
- `workerId` must reference an existing worker
- `directoryPath` must be within `$HOME` (for local) or remote `$HOME` (validated via SSH)
- `displayName` defaults to last path segment if omitted

**Response** `201`:
```json
{
  "id": "uuid",
  "workerId": "worker-uuid",
  "directoryPath": "/home/user/projects/myapp",
  "displayName": "MyApp",
  "bookmarked": true,
  "position": null,
  "lastUsedAt": "2026-02-21T10:00:00Z",
  "createdAt": "2026-02-21T10:00:00Z"
}
```

**Response** `409` (duplicate):
```json
{ "error": "Project already exists for this directory on this worker" }
```

---

#### `PATCH /api/projects/:id`

Update project alias, bookmark status, or position.

**Request Body** (all optional):
```json
{
  "displayName": "Backend API",
  "bookmarked": true,
  "position": 2
}
```

**Response** `200`: Updated project object
**Response** `404`: Project not found

---

#### `DELETE /api/projects/:id`

Remove a project from the list.

**Response** `204`: No content
**Response** `404`: Project not found

---

### Remote Directory Browsing

#### `GET /api/workers/:id/directories`

Browse directories on a remote worker via SSH.

**Query Parameters**:
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | No | remote `$HOME` | Directory to list |
| `query` | string | No | none | Prefix filter for entry names |

**Response** `200`:
```json
{
  "path": "/home/user/projects",
  "entries": [
    { "name": "myapp", "path": "/home/user/projects/myapp" },
    { "name": "api-server", "path": "/home/user/projects/api-server" }
  ],
  "exists": true
}
```

**Response** `502` (SSH connection failed):
```json
{ "error": "Worker is not connected", "workerId": "uuid" }
```

**Response** `403` (path outside home):
```json
{ "error": "Directory not allowed: path must be within home directory" }
```

**Behavior**:
- Same filtering as local: excludes hidden dirs (except `.config`), excludes `node_modules/`
- Max 20 entries, sorted alphabetically
- Results cached in-memory for 5 seconds per worker+path
- Path restricted to remote `$HOME` (queried via `echo $HOME` on first connection)

---

### Worker Management (new)

#### `PUT /api/workers/:id`

Update a remote worker's configuration.

**Request Body** (all optional):
```json
{
  "name": "gpu-server-2",
  "sshHost": "10.0.0.2",
  "sshPort": 2222,
  "sshUser": "ubuntu",
  "sshKeyPath": "/home/ubuntu/.ssh/id_ed25519",
  "maxSessions": 4
}
```

**Validation**:
- Worker must exist (404 if not)
- Worker must be type `remote` (403 for local worker edits)
- If `sshKeyPath` changed, validate via `workerManager.validateSshKeyFile()`
- If any SSH field changed, disconnect + reconnect worker

**Response** `200`: Updated worker object
```json
{
  "id": "uuid",
  "name": "gpu-server-2",
  "type": "remote",
  "sshHost": "10.0.0.2",
  "sshPort": 2222,
  "sshUser": "ubuntu",
  "sshKeyPath": "/home/ubuntu/.ssh/id_ed25519",
  "status": "connected",
  "maxSessions": 4,
  "activeSessionCount": 1,
  "lastHeartbeat": "2026-02-21T10:00:00Z",
  "createdAt": "2026-02-21T09:00:00Z"
}
```

**Response** `403` (local worker):
```json
{ "error": "Cannot edit the local worker" }
```

**Response** `400` (invalid SSH key):
```json
{ "error": "SSH key file not found: /path/to/key" }
```

**Response** `404`: Worker not found

---

## Modified Endpoints

### `POST /api/sessions`

**Changes**:
1. **$HOME validation**: If `workingDirectory` resolves outside `$HOME`, return `403`:
   ```json
   { "error": "Directory not allowed: path must be within home directory" }
   ```

2. **Git auto-init for worktree**: If `worktree === true` and target directory is not a git repo:
   - Local: run `git init` in the directory
   - Remote: run `git init` via SSH
   - On failure, return `422`:
   ```json
   { "error": "Failed to initialize git repository", "details": "..." }
   ```

3. **Default worker assignment**: If `targetWorker` is null/omitted, assign the local worker's ID. Sessions always have a `workerId` after creation.

4. **Per-worker capacity check**: Before activating, check the target worker's capacity (not just global). If worker is full, session remains queued.

**Updated request body**:
```json
{
  "workingDirectory": "/home/user/projects/myapp",
  "title": "Fix auth bug",
  "targetWorker": "worker-uuid",
  "startFresh": false,
  "worktree": false
}
```

---

### `GET /api/directories`

**Changes**:
1. **$HOME restriction**: If `path` resolves outside `os.homedir()`, return `403`:
   ```json
   { "error": "Directory not allowed: path must be within home directory" }
   ```

2. **Default path**: Already defaults to `os.homedir()` — no change needed.

---

### `GET /api/workers`

**Changes**:
1. Already returns `activeSessionCount` per worker — no change needed.

---

### `GET /api/sessions`

**Changes**:
1. Each session now reliably includes `workerId` (non-null for new sessions). No response shape change.
2. Frontend will join worker name from the workers list for display.

---

## WebSocket Changes

### `/ws/sessions/:id` (Claude terminal)

**Changes for remote sessions**:
- Server-side: when a session's worker is remote, the WebSocket bridges to `RemotePtyBridge` instead of `PtySpawner`
- Client-side: no changes — binary frames and JSON control messages work identically
- New JSON message from server on SSH disconnect:
  ```json
  { "type": "connection_lost", "sessionId": "uuid", "message": "SSH connection to worker lost" }
  ```
- New JSON message from server on SSH reconnect:
  ```json
  { "type": "connection_restored", "sessionId": "uuid" }
  ```
