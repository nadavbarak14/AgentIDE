# Quickstart: Clean Session & Connection UX

**Feature**: 012-session-connect-ux
**Date**: 2026-02-21

## Prerequisites

- Node.js 20 LTS
- npm
- Git
- Access to a remote machine with SSH key auth (for remote session testing)

## Setup

```bash
# Ensure you're on the feature branch
git checkout 012-session-connect-ux

# Install dependencies (no new deps required)
npm install

# Start development servers
npm run dev
```

## Development Workflow

### Backend changes

Backend source: `backend/src/`
Backend tests: `backend/tests/` (when created) and top-level `tests/`

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/unit/project-service.test.ts

# Run with watch mode during development
npx vitest --watch
```

### Frontend changes

Frontend source: `frontend/src/`

```bash
# Vite dev server with HMR (started via npm run dev)
# Changes to components auto-refresh in browser
```

### Database migrations

Migrations are applied automatically on server start in `backend/src/models/db.ts`. The new `projects` table is created via `CREATE TABLE IF NOT EXISTS` — safe to re-run.

## Testing Remote Sessions

### Setting up a test remote worker

1. Ensure SSH key auth works to target machine:
   ```bash
   ssh -i ~/.ssh/id_rsa user@remote-host "echo ok"
   ```

2. Ensure Claude CLI is installed on the remote machine:
   ```bash
   ssh user@remote-host "which claude"
   ```

3. In the app's Settings page, add a remote worker:
   - Name: `test-remote`
   - SSH Host: `remote-host`
   - SSH User: `user`
   - SSH Key Path: `/home/youruser/.ssh/id_rsa`
   - Max Sessions: `2`

4. Click "Test Connection" to verify SSH connectivity.

### Testing the new session flow

1. Open the dashboard
2. In the sidebar, the "New Session" form now shows a **project picker** instead of the directory text field
3. If no recent projects exist, click "Browse" to navigate directories within `$HOME`
4. Select a directory — it appears as a project name (e.g., "myapp")
5. If a remote worker is configured, a **machine selector** appears below the project picker
6. Click "Create Session" — the session starts on the selected machine
7. Verify the **worker badge** appears on the session card

### Testing per-worker limits

1. Set a worker's `maxSessions` to 1 in Settings
2. Create 2 sessions targeting that worker
3. First session should activate; second should remain queued
4. Complete the first session — second should auto-dispatch

### Testing git auto-init for worktree

1. Create a new empty directory: `mkdir ~/test-no-git`
2. Create a session with "Use worktree" checked, targeting `~/test-no-git`
3. The system should auto-run `git init` and the session should start successfully
4. Verify: `ls ~/test-no-git/.git` should exist

### Testing directory security

1. Try to create a session with directory `/etc` or `/tmp` — should get a 403 error
2. In the directory picker, try to navigate above `$HOME` — should be blocked

## Key Files to Edit

| Area | Primary Files |
|------|---------------|
| DB schema + migration | `backend/src/models/db.ts` |
| Types | `backend/src/models/types.ts` |
| Repository queries | `backend/src/models/repository.ts` |
| Session lifecycle | `backend/src/services/session-manager.ts` |
| Queue dispatch | `backend/src/services/queue-manager.ts` |
| Project service | `backend/src/services/project-service.ts` (NEW) |
| Remote PTY bridge | `backend/src/worker/remote-pty-bridge.ts` (NEW) |
| SSH tunnel | `backend/src/hub/tunnel.ts` |
| Directory routes | `backend/src/api/routes/directories.ts` |
| Session routes | `backend/src/api/routes/sessions.ts` |
| Project routes | `backend/src/api/routes/projects.ts` (NEW) |
| Worker routes | `backend/src/api/routes/workers.ts` |
| WebSocket bridge | `backend/src/api/websocket.ts` |
| Session form | `frontend/src/components/SessionQueue.tsx` |
| Directory picker | `frontend/src/components/DirectoryPicker.tsx` |
| Project picker | `frontend/src/components/ProjectPicker.tsx` (NEW) |
| Worker selector | `frontend/src/components/WorkerSelector.tsx` (NEW) |
| Worker badge | `frontend/src/components/WorkerBadge.tsx` (NEW) |
| Worker health | `frontend/src/components/WorkerHealth.tsx` (NEW) |
| Session card | `frontend/src/components/SessionCard.tsx` |
| Dashboard | `frontend/src/pages/Dashboard.tsx` |
| API client | `frontend/src/services/api.ts` |
