# API Contracts: Remote Directory Support

**Feature**: 013-remote-directory-support
**Date**: 2026-02-21
**Base URL**: `http://localhost:3000/api` (development)

## Overview

This document specifies modifications to existing API endpoints to support worker-aware directory operations. No new endpoints are added; existing endpoints are extended with worker context.

---

## Modified Endpoints

### 1. POST /api/sessions

**Purpose**: Create new Claude Code session (MODIFIED: worker-aware directory validation)

**Changes**:
- Directory validation now depends on `targetWorker` type
- Error responses distinguish local restrictions from remote access issues

#### Request

```http
POST /api/sessions
Content-Type: application/json

{
  "workingDirectory": "/opt/projects/myapp",
  "title": "My Remote Project",
  "targetWorker": "uuid-of-remote-worker",
  "startFresh": false,
  "worktree": false
}
```

**Body Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workingDirectory` | string | Yes | Absolute path to project directory |
| `title` | string | Yes | User-defined session name |
| `targetWorker` | string (UUID) | No | Worker ID (defaults to local worker if omitted) |
| `startFresh` | boolean | No | Skip auto-continue of existing session (default: false) |
| `worktree` | boolean | No | Enable git worktree mode (default: false) |

**Validation Changes**:
- **Before**: All paths validated against local home directory
- **After**: Validation strategy depends on `targetWorker` type:
  - Local worker: Path MUST be within hub server's home directory
  - Remote worker: Path validated only on remote server (SSH user permissions)

#### Responses

**Success (201 Created)**:
```json
{
  "id": "session-uuid",
  "workingDirectory": "/opt/projects/myapp",
  "targetWorker": "worker-uuid",
  "title": "My Remote Project",
  "status": "active",
  "claudeSessionId": "claude-session-id",
  "worktree": false
}
```

**Error (403 Forbidden) - Local Restriction**:
```json
{
  "error": "Directory not allowed: path must be within home directory",
  "reason": "local_restriction",
  "path": "/opt/projects/myapp",
  "workerType": "local"
}
```

**Error (403 Forbidden) - Remote Access Denied**:
```json
{
  "error": "Cannot access remote directory: permission denied",
  "reason": "remote_access_denied",
  "path": "/opt/restricted",
  "workerType": "ssh",
  "workerId": "worker-uuid",
  "details": "SSH user does not have read/write access to this path"
}
```

**Error (503 Service Unavailable) - SSH Connection Failed**:
```json
{
  "error": "Cannot create session: SSH connection to worker unavailable",
  "reason": "remote_connection_failed",
  "workerId": "worker-uuid",
  "workerHost": "192.168.1.100"
}
```

**Error (400 Bad Request) - Invalid Worker**:
```json
{
  "error": "Invalid targetWorker: worker not found",
  "workerId": "invalid-uuid"
}
```

#### Status Codes

| Code | Meaning | When |
|------|---------|------|
| 201 | Created | Session created successfully |
| 200 | OK | Existing session auto-continued |
| 202 | Accepted | Session queued (worker busy) |
| 400 | Bad Request | Missing required fields or invalid worker ID |
| 403 | Forbidden | Directory validation failed (local restriction or remote access denied) |
| 503 | Service Unavailable | SSH connection to remote worker unavailable |

---

### 2. GET /api/directories

**Purpose**: Browse directory entries (MODIFIED: worker-aware filesystem routing)

**Changes**:
- Added optional `workerId` query parameter
- Returns remote directories when remote worker specified
- Response includes `remote` flag to indicate source

#### Request

```http
GET /api/directories?path=/opt/projects&workerId=uuid-of-remote-worker
```

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Directory path to browse (defaults to home directory) |
| `query` | string | No | Partial name for autocomplete filtering |
| `workerId` | string (UUID) | No | Worker ID (defaults to local worker if omitted) |

**Routing Logic**:
- If `workerId` omitted → browse local hub filesystem (existing behavior)
- If `workerId` references local worker → browse local hub filesystem
- If `workerId` references remote worker → browse remote filesystem via SSH

#### Responses

**Success (200 OK) - Local Directories**:
```json
{
  "path": "/home/ubuntu/projects",
  "entries": [
    { "name": "myapp", "path": "/home/ubuntu/projects/myapp" },
    { "name": "webapp", "path": "/home/ubuntu/projects/webapp" }
  ],
  "exists": true,
  "remote": false
}
```

**Success (200 OK) - Remote Directories**:
```json
{
  "path": "/opt/projects",
  "entries": [
    { "name": "service-a", "path": "/opt/projects/service-a" },
    { "name": "service-b", "path": "/opt/projects/service-b" }
  ],
  "exists": true,
  "remote": true,
  "workerId": "worker-uuid",
  "workerHost": "192.168.1.100"
}
```

**Error (403 Forbidden) - Local Restriction**:
```json
{
  "error": "Directory not allowed: path must be within home directory",
  "reason": "local_restriction",
  "path": "/opt/projects"
}
```

**Error (403 Forbidden) - Remote Access Denied**:
```json
{
  "error": "Cannot access remote directory: permission denied",
  "reason": "remote_access_denied",
  "path": "/root/secrets",
  "workerId": "worker-uuid"
}
```

**Error (503 Service Unavailable) - SSH Connection Failed**:
```json
{
  "error": "Cannot browse remote directories: SSH connection unavailable",
  "reason": "remote_connection_failed",
  "workerId": "worker-uuid"
}
```

**Error (404 Not Found) - Directory Doesn't Exist**:
```json
{
  "path": "/opt/nonexistent",
  "entries": [],
  "exists": false,
  "remote": true
}
```

#### Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Directory browsing successful (includes `exists: false` for nonexistent paths) |
| 400 | Bad Request | Invalid path format or worker ID |
| 403 | Forbidden | Path validation failed or access denied |
| 503 | Service Unavailable | SSH connection unavailable |

---

### 3. POST /api/directories

**Purpose**: Create directory (MODIFIED: support remote directory creation)

**Changes**:
- Added optional `workerId` parameter to request body
- Creates directory on remote server when remote worker specified

#### Request

```http
POST /api/directories
Content-Type: application/json

{
  "path": "/home/ubuntu/new-project",
  "workerId": "uuid-of-remote-worker"
}
```

**Body Parameters**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path to create |
| `workerId` | string (UUID) | No | Worker ID (defaults to local worker) |
| `recursive` | boolean | No | Create parent directories (default: true) |

#### Responses

**Success (201 Created)**:
```json
{
  "path": "/home/ubuntu/new-project",
  "created": true,
  "exists": true,
  "remote": true,
  "workerId": "worker-uuid"
}
```

**Success (200 OK) - Directory Already Exists**:
```json
{
  "path": "/home/ubuntu/existing-project",
  "created": false,
  "exists": true,
  "remote": true
}
```

**Error (403 Forbidden) - Local Restriction**:
```json
{
  "error": "Directory creation not allowed: path must be within home directory",
  "reason": "local_restriction",
  "path": "/opt/project"
}
```

**Error (403 Forbidden) - Remote Permission Denied**:
```json
{
  "error": "Cannot create remote directory: permission denied",
  "reason": "remote_access_denied",
  "path": "/root/project"
}
```

**Error (503 Service Unavailable) - SSH Connection Failed**:
```json
{
  "error": "Cannot create remote directory: SSH connection unavailable",
  "reason": "remote_connection_failed",
  "workerId": "worker-uuid"
}
```

#### Status Codes

| Code | Meaning | When |
|------|---------|------|
| 201 | Created | Directory created successfully |
| 200 | OK | Directory already existed |
| 400 | Bad Request | Invalid path format or worker ID |
| 403 | Forbidden | Path validation failed or permission denied |
| 503 | Service Unavailable | SSH connection unavailable |

---

## Error Response Schema

All error responses follow this consistent structure:

```typescript
interface ErrorResponse {
  error: string;                    // Human-readable error message
  reason?: ErrorReason;              // Machine-readable error code
  path?: string;                     // Path that caused the error
  workerId?: string;                 // Worker ID (if applicable)
  workerType?: 'local' | 'ssh';      // Worker type (if applicable)
  workerHost?: string;               // Worker host (for remote workers)
  details?: string;                  // Additional context
}

type ErrorReason =
  | 'local_restriction'              // Path outside local home directory
  | 'remote_access_denied'           // SSH user lacks permissions
  | 'remote_connection_failed'       // Cannot connect to SSH worker
  | 'invalid_path'                   // Malformed path (traversal, null bytes)
  | 'worker_not_found';              // Invalid worker ID
```

---

## Frontend Integration

### Worker Context in Directory Picker

The directory picker component must pass worker context to API:

```typescript
// Before (no worker awareness)
const response = await fetch(`/api/directories?path=${path}`);

// After (worker-aware)
const workerId = selectedWorker?.id;
const url = workerId
  ? `/api/directories?path=${path}&workerId=${workerId}`
  : `/api/directories?path=${path}`;
const response = await fetch(url);
```

### Error Handling

Frontend should handle error reasons appropriately:

```typescript
if (response.status === 403) {
  const { reason } = await response.json();

  if (reason === 'local_restriction') {
    showError('This directory is outside your home folder. For security, local sessions must use paths within your home directory.');
  } else if (reason === 'remote_access_denied') {
    showError('Cannot access this directory on the remote server. Check SSH user permissions.');
  }
}
```

---

## Backward Compatibility

### Omitting `workerId`

All APIs default to local worker behavior when `workerId` is omitted:

- Directory validation: Enforces local home directory restriction
- Directory browsing: Queries local hub filesystem
- Directory creation: Creates on local hub filesystem

**Result**: Existing clients continue to work without changes

### `remote` Flag

Response includes `remote: boolean` flag:
- `remote: false` → local filesystem
- `remote: true` → remote filesystem via SSH

Frontend can use this flag to show appropriate UI indicators (e.g., "Remote: server-01")

---

## Performance Considerations

### Remote Directory Operations

Expected latencies:
- Directory browsing: 200-500ms (SSH round-trip)
- Directory creation: 300-800ms (SSH + mkdir)

Frontend should:
- Show loading indicators for remote operations
- Debounce autocomplete queries (300ms) to reduce SSH traffic
- Cache last successful remote path to avoid re-queries

### SSH Connection Reuse

SSHTunnelManager maintains connection pool:
- Connections reused across API calls to same worker
- No overhead for repeated directory operations on same worker
- Connection timeout: 30 seconds idle

---

## Testing Contracts

### Integration Test Scenarios

**Scenario 1: Local Worker, Path Outside Home**
```
POST /api/sessions { workingDirectory: "/opt/project", targetWorker: <local> }
→ 403 { reason: "local_restriction" }
```

**Scenario 2: Remote Worker, Any Path**
```
POST /api/sessions { workingDirectory: "/opt/project", targetWorker: <remote> }
→ 201 { session created successfully }
```

**Scenario 3: Remote Directory Browsing**
```
GET /api/directories?path=/opt&workerId=<remote>
→ 200 { entries: [...], remote: true }
```

**Scenario 4: SSH Connection Failure**
```
GET /api/directories?path=/opt&workerId=<offline-remote>
→ 503 { reason: "remote_connection_failed" }
```

**Scenario 5: Remote Permission Denied**
```
POST /api/sessions { workingDirectory: "/root/secure", targetWorker: <remote> }
→ 403 { reason: "remote_access_denied" }
```

---

## Summary of Changes

| Endpoint | Change | Backward Compatible? |
|----------|--------|----------------------|
| POST /api/sessions | Worker-aware directory validation | ✅ Yes (defaults to local) |
| GET /api/directories | Added `workerId` query parameter | ✅ Yes (optional parameter) |
| POST /api/directories | Added `workerId` body parameter | ✅ Yes (optional parameter) |

**Breaking Changes**: None

**New Fields**: `reason`, `remote`, `workerId`, `workerType`, `workerHost` (all optional, ignore-safe for existing clients)
