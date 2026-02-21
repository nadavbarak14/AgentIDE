# Data Model: Remote Directory Support

**Feature**: 013-remote-directory-support
**Date**: 2026-02-21

## Overview

This feature extends existing entities (Worker, Session) without adding new tables. Changes are additive to enable worker-type-aware directory validation.

## Entity Modifications

### Worker (Existing - No Schema Changes)

**Purpose**: Represents local or remote SSH worker that executes Claude Code sessions

**Existing Fields (No Changes)**:
- `id`: UUID (primary key)
- `type`: Enum (`'local'` | `'ssh'`) — **KEY FIELD for this feature**
- `name`: Display name
- `host`: Hostname/IP (for SSH workers)
- `port`: SSH port (for SSH workers)
- `username`: SSH username
- `sshKeyPath`: Path to SSH private key
- `status`: Connection status (`'connected'` | `'disconnected'`)

**Behavior Change**:
- **Before**: Worker type was informational only
- **After**: Worker type determines directory validation rules:
  - `type === 'local'` → enforce home directory restriction
  - `type === 'ssh'` → allow any remote path (SSH user permissions control access)

**Validation Rules**:
- Worker type MUST be set on creation (required field)
- SSH workers MUST have host/port/username/sshKeyPath populated
- Local workers MUST have empty host/port/username fields

**State Transitions**:
- No changes to worker lifecycle (connect/disconnect flow remains the same)

---

### Session (Existing - No Schema Changes)

**Purpose**: Represents Claude Code session running in a working directory on a worker

**Existing Fields (No Changes)**:
- `id`: UUID (primary key)
- `workingDirectory`: Absolute path to project directory — **KEY FIELD for this feature**
- `targetWorker`: Foreign key to Worker.id — **KEY FIELD for this feature**
- `title`: User-defined session name
- `status`: Enum (`'queued'` | `'active'` | `'completed'` | `'failed'`)
- `claudeSessionId`: External session ID
- `worktree`: Boolean (git worktree mode)

**Behavior Change**:
- **Before**: `workingDirectory` validated against local home directory for all sessions
- **After**: `workingDirectory` validation depends on `targetWorker.type`:
  - Local worker → validate against local home directory
  - Remote worker → skip local validation (path is on remote server)

**Validation Rules**:
- `workingDirectory` MUST be absolute path
- `workingDirectory` MUST pass worker-type-aware validation:
  - Local: `isWithinHomeDir(workingDirectory)` MUST be true
  - Remote: No local path restriction (SSH user permissions enforce access)
- `targetWorker` MUST reference existing worker
- If `targetWorker` is null, default to local worker (maintains backward compatibility)

**Relationships**:
- Session → Worker (many-to-one via `targetWorker`)
  - **Join Query**: `SELECT s.*, w.type FROM sessions s LEFT JOIN workers w ON s.targetWorker = w.id`
  - Used during session creation to determine validation strategy

---

## Validation Logic Flow

### Session Creation Validation

```
1. Extract targetWorker from request body
2. Look up Worker by targetWorker ID
3. Determine validation strategy:

   IF worker.type === 'local':
     → Validate workingDirectory with isWithinHomeDir()
     → REJECT if path outside local home directory

   IF worker.type === 'ssh':
     → SKIP local home directory validation
     → Directory will be validated by SSH user permissions on remote server

   IF worker is null or not found:
     → Default to local worker behavior (backward compatibility)
     → Apply local home directory restriction

4. If validation passes:
   → Proceed with session creation
   → Store targetWorker reference in session record
```

### Directory Browsing Validation

```
1. Extract workerId from query parameter
2. Look up Worker by workerId
3. Route request based on worker type:

   IF worker.type === 'local':
     → Use local filesystem operations (existing code)
     → Apply home directory restriction

   IF worker.type === 'ssh':
     → Delegate to SSHTunnelManager.listRemoteDirectories()
     → Query remote filesystem via SFTP
     → Return remote directory entries

   IF worker is null:
     → Default to local filesystem (backward compatibility)
```

---

## Data Access Patterns

### Primary Queries (Existing, No Changes)

```sql
-- Get worker by ID (already exists)
SELECT * FROM workers WHERE id = ?

-- Get session with worker info (already exists, now used for validation)
SELECT s.*, w.type, w.host
FROM sessions s
LEFT JOIN workers w ON s.targetWorker = w.id
WHERE s.id = ?

-- List sessions by worker (already exists)
SELECT * FROM sessions WHERE targetWorker = ? AND status = 'active'
```

### No New Queries Required

All necessary queries already exist in the repository layer. This feature adds business logic (validation branching) without changing data access patterns.

---

## No Database Migration Required

**Schema Status**: No changes to existing tables

**Backward Compatibility**: ✅ Fully compatible
- Existing sessions continue to work (targetWorker may be null → defaults to local)
- Existing workers unchanged (type field already present)
- No data migration needed

**Rollout Impact**: Zero downtime — feature is purely logic changes in application layer

---

## Entity Relationships Diagram

```
┌─────────────────┐
│     Worker      │
│─────────────────│
│ id (PK)         │◄────┐
│ type            │     │ 1
│ name            │     │
│ host            │     │
│ port            │     │
│ username        │     │
│ sshKeyPath      │     │
│ status          │     │
└─────────────────┘     │
                        │
                        │ N
                 ┌──────┴──────────┐
                 │    Session      │
                 │─────────────────│
                 │ id (PK)         │
                 │ workingDirectory│ ◄─ Validation depends on Worker.type
                 │ targetWorker(FK)│
                 │ title           │
                 │ status          │
                 │ claudeSessionId │
                 │ worktree        │
                 └─────────────────┘
```

**Key Relationship**: Session.targetWorker → Worker.id
- **Cardinality**: Many-to-One (many sessions can target same worker)
- **Validation Dependency**: Worker.type determines Session.workingDirectory validation rules
- **Referential Integrity**: targetWorker FK enforced in database (cannot create session with invalid worker ID)

---

## Validation State Machine

### Worker Type Validation Strategy

```
State: Session Creation Request
Input: { workingDirectory, targetWorker }

┌─────────────────────────┐
│ Lookup Worker by ID     │
└────────────┬────────────┘
             │
        ┌────▼────┐
        │ Worker  │
        │ Found?  │
        └─┬────┬──┘
          │    │
      Yes │    │ No
          │    │
          │    └──────► Default to Local Worker ──┐
          │                                        │
     ┌────▼─────────┐                             │
     │ Check Type   │                             │
     └──┬────────┬──┘                             │
        │        │                                 │
   Local│        │Remote                           │
        │        │                                 │
        │        └──────► Skip Local Validation   │
        │                 Allow Any Path ─────────┤
        │                                          │
        │                                          │
   ┌────▼──────────────────────┐                  │
   │ Validate isWithinHomeDir()│                  │
   └────┬──────────────────────┘                  │
        │                                          │
   ┌────▼────┐                                    │
   │ Valid?  │                                    │
   └─┬─────┬─┘                                    │
     │     │                                      │
  Yes│     │No                                    │
     │     │                                      │
     │     └──► REJECT ─────────────────────────►X
     │          (403 Forbidden)
     │
     └──────► ACCEPT ─────────────────────────────►✓
              (Create Session)
```

---

## Field-Level Validation Rules

### Worker.type (Existing Field, New Significance)

**Type**: Enum (`'local'` | `'ssh'`)
**Required**: Yes
**Immutable**: No (can be changed, but not recommended after sessions created)
**Default**: N/A (must be explicitly set)

**Validation on Create**:
- MUST be one of allowed values (`'local'` or `'ssh'`)
- If `type === 'ssh'`: MUST provide host, port, username, sshKeyPath
- If `type === 'local'`: host/port/username SHOULD be null

**Validation on Update**:
- Type change SHOULD trigger warning if active sessions exist
- No enforcement preventing type change (admin may need to reconfigure)

---

### Session.workingDirectory (Existing Field, Enhanced Validation)

**Type**: String (absolute path)
**Required**: Yes
**Validation**: Worker-type-dependent

**Validation Rules**:
1. **Format**: MUST be absolute path (start with `/`)
2. **No traversal**: MUST NOT contain `..` or null bytes
3. **Worker-aware**:
   - Local worker: MUST be within home directory (`isWithinHomeDir()`)
   - Remote worker: No local restriction (remote SSH user permissions apply)

**Error Messages**:
- Local restriction: `"Directory not allowed: path must be within home directory"`
- Path traversal: `"Invalid path: path traversal not allowed"`
- Remote access: `"Cannot access remote directory: {SSH_ERROR}"`

---

## Concurrency & Race Conditions

### Session Creation (Potential Race)

**Scenario**: Two session creation requests for same remote worker with same directory
**Behavior**: Both succeed (sessions can share directories)
**No Issue**: Multiple sessions per directory is allowed design

### Worker Type Change (Potential Issue)

**Scenario**: Worker type changed from SSH to Local while session creation in progress
**Mitigation**: Session creation reads worker type at start of transaction
**Impact**: Session may be validated against old worker type
**Acceptable**: Rare edge case, no data corruption (session still references correct worker)

### SSH Connection Pool (Potential Contention)

**Scenario**: Multiple sessions creating/browsing on same remote worker simultaneously
**Mitigation**: SSHTunnelManager already handles connection pooling (existing code)
**Impact**: None (connection reuse prevents exhaustion)

---

## Summary

- **Schema Changes**: None
- **Behavior Changes**: Worker.type now drives directory validation logic
- **New Queries**: None (reuse existing repository methods)
- **Migration**: Not required
- **Backward Compatibility**: Fully maintained
- **Performance Impact**: Minimal (one additional JOIN on worker table during validation)
