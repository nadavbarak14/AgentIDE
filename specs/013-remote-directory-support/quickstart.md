# Quickstart: Remote Directory Support for SSH Workers

**Feature**: 013-remote-directory-support
**Audience**: Developers, DevOps engineers, End users
**Time to Complete**: 5-10 minutes

## Overview

This feature allows Claude Code sessions on remote SSH workers to use any directory path accessible to the SSH user, removing the local home directory restriction. Local workers maintain the home directory restriction for security.

### What You Can Do

- ✅ Create Claude Code sessions in `/opt/projects/myapp` on a remote server
- ✅ Browse remote server directories when selecting project paths
- ✅ Auto-create remote directories that don't exist yet
- ✅ Continue using local workers with home directory restriction (unchanged)

### What's Different

**Before**: All sessions rejected paths outside the local hub's home directory
**After**: Remote sessions accept any path; local sessions remain restricted for security

---

## Prerequisites

- AgentIDE hub server running (v0.1.0+)
- At least one remote SSH worker configured and connected
- SSH user on remote server has permissions to target directories

---

## Quick Start (5 Minutes)

### Step 1: Verify Remote Worker

Check that your remote worker is connected:

```bash
# Via CLI
agentide list-workers

# Expected output
WORKER ID               NAME        TYPE  STATUS
abc123-worker-uuid      server-01   ssh   connected
def456-local-uuid       local       local connected
```

### Step 2: Create Remote Session

**Via Web UI**:
1. Navigate to AgentIDE dashboard (`http://localhost:3000`)
2. Click "New Session"
3. Select remote worker from dropdown (e.g., "server-01")
4. Enter remote path: `/opt/projects/myapp`
5. Click "Start Session"

**Via API**:
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "workingDirectory": "/opt/projects/myapp",
    "title": "My Remote Project",
    "targetWorker": "abc123-worker-uuid"
  }'
```

**Expected Result**: Session starts successfully with Claude Code running in `/opt/projects/myapp` on the remote server.

### Step 3: Browse Remote Directories

**Via Web UI**:
1. Click "New Session" (stay on form)
2. Select remote worker
3. Click folder icon next to "Working Directory"
4. Browse remote filesystem → see directories from remote server

**Via API**:
```bash
curl "http://localhost:3000/api/directories?workerId=abc123-worker-uuid&path=/opt"
```

**Expected Result**: Directory picker shows `/opt/projects`, `/opt/services`, etc. from the remote server.

---

## Common Use Cases

### Use Case 1: Work on Remote Staging Server

**Scenario**: You have a staging server at `192.168.1.100` with projects in `/var/www/apps`

**Steps**:
1. Configure remote worker for `192.168.1.100`
2. Create session with path `/var/www/apps/myapp`
3. Claude Code edits files directly on staging server

**Benefit**: No local sync needed; changes are live on staging immediately

---

### Use Case 2: Multiple Projects on Same Remote Server

**Scenario**: Remote server has `/opt/project-a`, `/opt/project-b`, `/home/ubuntu/project-c`

**Steps**:
1. Create separate sessions for each project
2. All target the same remote worker
3. Each session uses different working directory

**Benefit**: Work on multiple remote projects simultaneously with isolated sessions

---

### Use Case 3: Create New Project Directory on Remote Server

**Scenario**: You want to start a new project in `/opt/projects/new-service` that doesn't exist yet

**Steps**:
1. Create session with path `/opt/projects/new-service`
2. System auto-creates the directory on remote server
3. Session starts in new directory

**Benefit**: No need to manually SSH in and create directories first

---

## Security & Permissions

### Local Workers (Unchanged Behavior)

**Home Directory Restriction**: Local workers MUST use paths within the hub server's home directory.

**Example**:
```bash
# ✅ Allowed (local worker)
POST /api/sessions { workingDirectory: "/home/ubuntu/project", targetWorker: <local> }

# ❌ Rejected (local worker, path outside home)
POST /api/sessions { workingDirectory: "/opt/project", targetWorker: <local> }
→ 403 Forbidden: "Directory not allowed: path must be within home directory"
```

**Why**: Local worker processes run on the hub server. Allowing arbitrary paths could compromise server security (e.g., accessing `/etc/passwd`).

---

### Remote Workers (New Behavior)

**SSH User Permissions**: Remote paths are restricted by SSH user's filesystem permissions on the remote server.

**Example**:
```bash
# ✅ Allowed (remote worker, SSH user has access)
POST /api/sessions { workingDirectory: "/opt/projects/myapp", targetWorker: <remote> }
→ 201 Created

# ❌ Rejected (remote worker, SSH user lacks permission)
POST /api/sessions { workingDirectory: "/root/sensitive", targetWorker: <remote> }
→ 403 Forbidden: "Cannot access remote directory: permission denied"
```

**Why**: Security is enforced by the remote server's user permissions. The hub server does not replicate local restrictions to remote workers (that would prevent legitimate remote use cases).

---

### Best Practices

1. **Use dedicated SSH user**: Create a non-root user on remote servers specifically for AgentIDE
2. **Limit SSH user permissions**: Grant access only to project directories (e.g., `/opt/projects/*`)
3. **Avoid sensitive paths**: Never point sessions to `/root`, `/etc`, or other system directories
4. **Monitor SSH logs**: Track which directories are being accessed via AgentIDE sessions
5. **Use SSH key authentication**: Require SSH keys (not passwords) for remote worker connections

---

## Troubleshooting

### Error: "Directory not allowed: path must be within home directory"

**Cause**: You selected a local worker but specified a path outside the home directory

**Fix**:
- **Option 1**: Switch to a remote worker if you need to access paths outside home
- **Option 2**: Move your project to a path within home directory (e.g., `~/projects/myapp`)

**Why**: Local workers enforce home directory restriction for security. Use remote workers for paths outside home.

---

### Error: "Cannot access remote directory: permission denied"

**Cause**: SSH user on remote server doesn't have read/write permissions to the specified path

**Fix**:
```bash
# On remote server (as admin)
sudo chown -R ssh-user:ssh-user /opt/projects/myapp
sudo chmod -R 755 /opt/projects/myapp
```

**Alternative**: Use a path the SSH user already owns (e.g., `/home/ssh-user/projects`)

---

### Error: "SSH connection to worker unavailable"

**Cause**: SSH connection to remote worker failed (network issue, wrong credentials, firewall)

**Fix**:
1. Check worker status: `agentide list-workers`
2. Verify SSH connection manually: `ssh -i /path/to/key user@host`
3. Check network connectivity: `ping remote-host`
4. Review worker configuration: Check host/port/username/keyPath in database
5. Check hub server logs: `tail -f logs/agentide.log | grep SSH`

**Prevention**: Configure health checks for remote workers (future feature)

---

### Directory Browsing is Slow on Remote Workers

**Cause**: Network latency between hub server and remote worker

**Expected Latency**:
- Local directories: <50ms
- Remote directories: 200-500ms (varies by network)

**Optimization**:
- Frontend debounces autocomplete queries (300ms)
- SSH connections are reused across queries
- Directory listing limited to 50 entries

**Workaround**: Type full path directly instead of browsing (faster)

---

## API Reference Summary

### Modified Endpoints

| Endpoint | Purpose | New Parameters |
|----------|---------|----------------|
| `POST /api/sessions` | Create session | Worker-aware validation (no param changes) |
| `GET /api/directories` | Browse directories | `?workerId=<uuid>` (optional) |
| `POST /api/directories` | Create directory | `workerId` in body (optional) |

### Error Reason Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| `local_restriction` | Path outside home (local worker) | Use remote worker or move project |
| `remote_access_denied` | SSH user lacks permissions | Fix permissions on remote server |
| `remote_connection_failed` | Cannot connect to SSH worker | Check network, SSH config, credentials |

See full API documentation: [contracts/api-contracts.md](./contracts/api-contracts.md)

---

## Developer Guide

### For Backend Developers

**Key Changes**:
- `isWithinHomeDir()` now wrapped in worker-type check
- `SSHTunnelManager` extended with `listRemoteDirectories()` and `createRemoteDirectory()`
- Session creation queries worker type before validating directory

**Testing**:
```bash
# Run unit tests
npm run test -- directory-security

# Run integration tests with SSH test container
npm run test -- remote-session
```

**Logging**:
```typescript
logger.info({ workerId, workerType, path }, 'validating directory for worker');
logger.warn({ workerId, path, reason: 'remote_access_denied' }, 'remote directory rejected');
```

---

### For Frontend Developers

**Key Changes**:
- Directory picker now accepts `selectedWorkerId` prop
- API calls include `?workerId=<uuid>` query parameter
- Error responses include `reason` field for specific messaging

**Example**:
```tsx
<DirectoryPicker
  selectedWorkerId={selectedWorker?.id}
  onSelect={(path) => setWorkingDirectory(path)}
/>
```

**Error Handling**:
```typescript
if (error.reason === 'local_restriction') {
  toast.error('Local sessions must use paths within your home directory');
} else if (error.reason === 'remote_access_denied') {
  toast.error('SSH user does not have permission to access this path');
}
```

---

## FAQ

**Q: Can I use Windows paths on remote workers?**
A: No. Remote SSH workers assume Unix-like filesystems. Windows remote workers are out of scope.

**Q: What happens if SSH connection drops during session?**
A: Session continues running on remote server. Reconnection is attempted automatically. Logs show connection status.

**Q: Can I browse remote directories without creating a session?**
A: Yes. Use `GET /api/directories?workerId=<remote>` to browse before session creation.

**Q: Does this work with git worktree mode?**
A: Yes. Git worktree operations happen on the remote server. Ensure git is installed on remote worker.

**Q: Can multiple sessions share the same remote directory?**
A: Yes. Multiple sessions can target the same remote path (same behavior as local workers).

**Q: How do I disable remote directory support?**
A: Set environment variable `ENABLE_REMOTE_DIRECTORIES=false` (feature flag). Defaults to enabled.

---

## Next Steps

1. **Set up remote workers**: See main AgentIDE documentation for SSH worker configuration
2. **Test with staging server**: Try creating a session on a non-production server first
3. **Review security**: Audit SSH user permissions on remote servers
4. **Monitor usage**: Watch logs for directory validation failures

---

## Related Documentation

- [Feature Specification](./spec.md) — Detailed requirements and user stories
- [API Contracts](./contracts/api-contracts.md) — Complete API reference
- [Data Model](./data-model.md) — Entity relationships and validation logic
- [Research](./research.md) — Technical decisions and trade-offs

---

## Support

**Issues**: Report bugs or request features at https://github.com/nadavbarak14/AgentIDE/issues

**Questions**: Tag issue with `remote-directories` label

**Logs**: Enable debug logging with `LOG_LEVEL=debug` environment variable
