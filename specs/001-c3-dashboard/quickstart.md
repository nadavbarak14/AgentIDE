# Quickstart: C3 Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17

## Prerequisites

- Node.js 20 LTS or later
- npm 10+
- Git
- Claude Code CLI installed (`claude` command available)
- SSH key-based access to remote workers (if using remote workers)

## Install

```bash
git clone https://github.com/nadavbarak14/AgentIDE.git
cd AgentIDE
npm install
```

## Start (Local Development)

```bash
# Start the backend (hub mode + local worker)
npm run dev:backend

# In another terminal, start the frontend
npm run dev:frontend
```

Open `http://localhost:5173` in your browser.

## Start (Production)

```bash
npm run build
npm start
```

The dashboard serves at `http://localhost:3000`.

## Add a Remote Worker

1. Open the dashboard → Settings → Workers
2. Click "Add Worker"
3. Enter SSH details: host, user, key path
4. Click "Test Connection" to verify
5. Click "Save"

The worker appears in the list. Sessions can now be assigned to it.

## Create Your First Task

1. Click "Add Task" in the dashboard
2. Enter a prompt: e.g., "Refactor the auth module to use JWT"
3. Select a target worker (or leave as "Any")
4. Select a project directory
5. Click "Add to Queue"

The task auto-starts if a slot is available.

## Continue a Completed Session

1. Find the session in the "Completed" list
2. Click "Continue"
3. The system spawns `claude -c <session-id>` in a new active slot
4. If all slots are occupied, the continuation is queued

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `max_concurrent_sessions` | 4 | Max actively running Claude processes |
| `auto_approve` | false | Auto-send "Yes" to Claude prompts |
| `grid_layout` | auto | Session grid layout (auto, 1x1, 2x2, 3x3) |
| `theme` | dark | UI theme |

## Project Structure

```
backend/
├── src/
│   ├── api/              # Express routes + WebSocket handlers
│   ├── models/           # TypeScript interfaces + SQLite repository
│   ├── services/         # Business logic (queue, session, worker managers)
│   ├── hub/              # Hub-specific: worker coordination, SSH tunnels
│   └── worker/           # Worker-specific: PTY spawning, file watching
├── tests/
│   ├── unit/
│   ├── integration/
│   └── system/
└── package.json

frontend/
├── src/
│   ├── components/       # SessionCard, TerminalView, FileTree, DiffViewer
│   ├── pages/            # Dashboard, Settings
│   ├── hooks/            # Custom hooks (useWebSocket, useSession, etc.)
│   └── services/         # API client, WebSocket client
├── tests/
│   ├── unit/
│   └── system/           # Playwright e2e tests
└── package.json

package.json              # Root workspace config
```

## Testing

```bash
# Run all unit tests
npm test

# Run system (e2e) tests
npm run test:system

# Run tests for a specific package
npm run test --workspace=backend
npm run test --workspace=frontend
```

## Troubleshooting

**"Connection refused" to remote worker**: Verify SSH key path is correct and the key has no passphrase (or use ssh-agent). Test with `ssh -i /path/to/key user@host`.

**Terminal output is garbled**: Ensure xterm.js addon-fit is active. Try resizing the browser window.

**Session not auto-starting**: Check that `max_concurrent_sessions` hasn't been reached. View active sessions in the dashboard.
