# Quickstart: Session Terminal

**Feature**: 011-session-terminal
**Date**: 2026-02-20

## Prerequisites

- Node.js 20 LTS
- npm (comes with Node.js)
- Linux or macOS (Windows not supported)

## Setup

```bash
# Clone and checkout feature branch
git checkout 011-session-terminal

# Install dependencies (node-pty requires native build tools)
npm install

# Start development servers
npm run dev
```

## Testing the Shell Terminal

### Manual Testing

1. Open the dashboard in your browser (default: `https://localhost:3000`)
2. Create or activate a session
3. Click the terminal icon (or use the panel toggle) to open the shell panel
4. The shell terminal appears as a panel below the Claude terminal
5. Type commands (e.g., `ls`, `pwd`, `echo hello`) and verify output
6. Resize the panel and verify the terminal adapts
7. Navigate to another session and return — verify scrollback is preserved
8. Close and reopen the shell panel — verify a fresh shell spawns

### Automated Tests

```bash
# Run all tests
npm test

# Run shell-specific tests
npx vitest run tests/unit/shell-spawner.test.ts
npx vitest run tests/system/shell-terminal.test.ts

# Run frontend component tests
npx vitest run frontend/tests/components/ShellTerminal.test.tsx
```

## Architecture Overview

```text
User clicks "Open Shell"
        │
        ▼
Frontend: ShellTerminal component
        │
        ├── REST: POST /api/sessions/:id/shell  (spawn shell)
        │
        └── WebSocket: /ws/sessions/:id/shell   (bidirectional I/O)
                │
                ▼
Backend: ShellSpawner (node-pty)
        │
        ├── Spawns $SHELL (or /bin/bash fallback)
        ├── Working directory = session's working directory
        ├── Scrollback → disk (scrollback/shell-{id}.scrollback)
        └── Killed on session suspend/complete
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/worker/shell-spawner.ts` | Shell PTY management |
| `backend/src/api/websocket.ts` | Shell WebSocket endpoint |
| `backend/src/api/routes/sessions.ts` | Shell REST endpoints |
| `frontend/src/components/ShellTerminal.tsx` | Shell terminal UI panel |
| `frontend/src/hooks/useShellTerminal.ts` | Shell WS + xterm.js hook |
| `frontend/src/hooks/usePanel.ts` | Panel type extension |
