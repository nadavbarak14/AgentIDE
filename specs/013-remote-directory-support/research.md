# Research: Remote Directory Support for SSH Workers

**Feature**: 013-remote-directory-support
**Date**: 2026-02-21
**Purpose**: Technical research for implementing worker-aware directory validation and remote filesystem operations

## Research Topics

### 1. SSH Directory Operations Best Practices

**Decision**: Use `sftp.readdir()` for directory listing and `sftp.mkdir()` for directory creation over SSH

**Rationale**:
- The `ssh2` library (already in use) provides SFTP subsystem for filesystem operations
- SFTP is more efficient than executing `ls` commands and parsing output
- Built-in error handling for permissions, connection failures, and path issues
- Standardized protocol with reliable error codes

**Alternatives Considered**:
- **Executing shell commands** (`ssh user@host "ls -la /path"`): Rejected due to output parsing complexity, no standard error codes, vulnerability to command injection
- **Using `scp` for path validation**: Rejected as SCP is for file transfer, not browsing

**Implementation Approach**:
```typescript
// Extend SSHTunnelManager with directory operations
async listRemoteDirectories(workerId: string, remotePath: string): Promise<DirectoryEntry[]> {
  const connection = this.getConnection(workerId);
  const sftp = await connection.sftp();
  const entries = await sftp.readdir(remotePath);
  return entries.filter(e => e.attrs.isDirectory());
}

async createRemoteDirectory(workerId: string, remotePath: string): Promise<void> {
  const connection = this.getConnection(workerId);
  const sftp = await connection.sftp();
  await sftp.mkdir(remotePath, { mode: 0o755, recursive: true });
}
```

**Error Handling**:
- ENOENT (2): Path doesn't exist → return empty list or auto-create
- EACCES (13): Permission denied → return clear error to user
- Connection lost: Graceful degradation, cache last known state

---

### 2. Worker-Type-Aware Validation Pattern

**Decision**: Use worker type lookup to determine validation strategy (local = strict home-only, remote = permissive)

**Rationale**:
- Worker type is already persisted in database (`workers.type` field)
- Session already has `targetWorker` foreign key
- Validation can be centralized in one function that checks worker type

**Implementation Pattern**:
```typescript
async function validateDirectoryForWorker(
  workerId: string,
  dirPath: string,
  repo: Repository
): Promise<ValidationResult> {
  const worker = repo.getWorker(workerId);

  if (worker.type === 'local') {
    // Enforce home directory restriction
    if (!isWithinHomeDir(dirPath)) {
      return { valid: false, reason: 'local_restriction' };
    }
  }

  // For remote workers, allow any path (SSH user permissions will enforce security)
  return { valid: true };
}
```

**Security Consideration**:
- Local restriction MUST remain enforced (constitution principle VII)
- Remote paths are implicitly restricted by SSH user permissions on remote server
- No additional validation needed for remote paths (avoiding false sense of security)

**Alternatives Considered**:
- **Allowlist of remote path prefixes**: Rejected as too restrictive, varies by deployment
- **User-configurable validation rules**: Rejected as over-engineering for v1

---

### 3. Remote Filesystem Browsing API Design

**Decision**: Extend existing `/api/directories` endpoint with worker-aware behavior

**Rationale**:
- Reuses existing API contract, minimizes frontend changes
- Backend routes check if selected worker is remote and delegate to SSH tunnel manager
- Falls back to local filesystem browsing for local workers (backward compatible)

**API Behavior**:
```typescript
GET /api/directories?path=/opt/projects&workerId=worker-uuid

If workerId references remote SSH worker:
  → Query remote filesystem via SSH tunnel manager
  → Return { path, entries, exists, remote: true }

If workerId references local worker or omitted:
  → Query local filesystem (existing behavior)
  → Return { path, entries, exists, remote: false }
```

**Caching Strategy**:
- No caching for remote directory listings (paths change frequently)
- Cache SSH connections (already implemented in SSH tunnel manager)
- Debounce autocomplete queries to reduce SSH round-trips

**Frontend Integration**:
- Directory picker component receives `selectedWorkerId` from parent
- Passes `workerId` to API on each query
- Shows loading indicator during remote queries (network latency)

---

### 4. Error Message Differentiation

**Decision**: Include `reason` field in validation errors to distinguish local vs. remote failures

**Rationale**:
- Spec requirement FR-004: "clear error messages...indicating whether it's a local restriction or remote access issue"
- Helps users understand why path was rejected

**Error Response Format**:
```typescript
// Local worker, path outside home
{ error: 'Directory not allowed: path must be within home directory', reason: 'local_restriction' }

// Remote worker, path not accessible
{ error: 'Cannot access remote directory: permission denied', reason: 'remote_access_denied' }

// Remote worker, SSH connection failed
{ error: 'Cannot browse remote directories: SSH connection lost', reason: 'remote_connection_failed' }
```

**Frontend Handling**:
- Show appropriate user-facing message based on `reason` code
- For `local_restriction`: Explain this is a security feature
- For `remote_*`: Offer retry or suggest checking SSH connection

---

## Implementation Dependencies

### Existing Code to Reuse
- `ssh2` library connection management (SSHTunnelManager)
- `isWithinHomeDir()` validation function (directories.ts)
- Worker model and repository access (Repository.getWorker())
- Session creation flow (SessionManager.createSession())

### New Code Required
- SSH directory operations wrapper in SSHTunnelManager
- Worker-aware validation function (replaces blanket home directory check)
- Remote directory browsing endpoint variant
- Error reason codes and user-facing messages

### Testing Strategy
- **Unit tests**: Mock SSH connections, test validation logic with different worker types
- **Integration tests**: Use test SSH container, verify directory listing/creation over real SSH
- **Edge case tests**: SSH connection failures, permission errors, path traversal attempts

---

## Performance Considerations

### Expected Latencies
- Local directory browsing: <50ms (existing baseline)
- Remote directory browsing: 200-500ms (SSH round-trip + network)
- Remote directory creation: 300-800ms (SSH + mkdir operation)

### Optimization Strategies
- Debounce autocomplete queries (300ms) to avoid SSH spam
- Reuse existing SSH connections (already pooled)
- Limit directory listing to 50 entries max (prevent slow queries on huge directories)
- Fail fast on SSH timeouts (5s max wait)

### User Experience
- Show loading spinner for remote operations >200ms
- Cache last successful remote path for session (avoid re-query on refresh)
- Graceful degradation if SSH unavailable (allow manual path entry)

---

## Security Audit

### Maintained Security Properties
- ✅ Local home directory restriction unchanged (FR-002)
- ✅ No path traversal allowed (existing validation remains)
- ✅ SSH credentials never exposed to frontend
- ✅ Remote paths restricted by SSH user permissions (not bypassed)

### New Security Considerations
- ⚠️ Remote SSH user permissions determine access (document in quickstart)
- ⚠️ SSH connection failures must not leak stack traces (wrap errors)
- ⚠️ Remote paths must be validated for null bytes, injection attempts

### Threat Model
- **Attacker goal**: Execute commands on remote server outside allowed paths
- **Mitigation**: SSH user permissions enforce access control; SFTP operations don't execute arbitrary commands
- **Residual risk**: Low (SFTP protocol doesn't allow command execution)

---

## Rollout Plan

### Phase 1 (MVP - P1 User Story)
- Worker-aware directory validation
- Session creation with remote paths
- Error differentiation

### Phase 2 (P2 User Story)
- Remote directory browsing API
- Frontend directory picker updates

### Phase 3 (P3 User Story)
- Auto-create remote directories

### Rollback Strategy
- Feature flag: `ENABLE_REMOTE_DIRECTORIES` (default: true)
- If issues arise, flip flag to fall back to local-only validation
- No data migration required (worker type already in schema)

---

## Open Questions (None Blocking)

All technical decisions documented above with clear rationale. No clarifications required from stakeholders before proceeding to design phase.
