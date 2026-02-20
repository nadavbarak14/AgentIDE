# API Contracts: Session Shell Terminal

**Feature**: 011-session-terminal
**Date**: 2026-02-20

## REST Endpoints

### POST /api/sessions/:id/shell

**Purpose**: Open (spawn) a shell terminal for the session.

**Request**:
```
POST /api/sessions/{sessionId}/shell
Content-Type: application/json

{
  "cols": 120,    // optional, default 120
  "rows": 40      // optional, default 40
}
```

**Response (201 Created)**:
```json
{
  "sessionId": "uuid",
  "status": "running",
  "pid": 12345,
  "shell": "/bin/bash"
}
```

**Error Responses**:
- `404 Not Found` — Session does not exist
- `400 Bad Request` — Session is not active
- `409 Conflict` — Shell already running for this session

---

### DELETE /api/sessions/:id/shell

**Purpose**: Close (kill) the shell terminal for the session.

**Request**:
```
DELETE /api/sessions/{sessionId}/shell
```

**Response (200 OK)**:
```json
{
  "sessionId": "uuid",
  "status": "killed"
}
```

**Error Responses**:
- `404 Not Found` — Session does not exist or no shell running

---

### GET /api/sessions/:id/shell

**Purpose**: Get current shell terminal status.

**Request**:
```
GET /api/sessions/{sessionId}/shell
```

**Response (200 OK)**:
```json
{
  "sessionId": "uuid",
  "status": "running" | "stopped" | "none",
  "pid": 12345 | null,
  "shell": "/bin/bash" | null
}
```

**Error Responses**:
- `404 Not Found` — Session does not exist

---

## WebSocket Endpoint

### WS /ws/sessions/:id/shell

**Purpose**: Real-time bidirectional I/O for the shell terminal.

**Connection**:
- URL: `ws://host/ws/sessions/{sessionId}/shell`
- Auth: JWT cookie (same as Claude terminal WebSocket)
- Rejects if session doesn't exist

**On Connect**:
1. Server sends shell status: `{ type: 'shell_status', sessionId, status, pid }`
2. If shell has scrollback, server sends it as binary frame
3. Client begins receiving live PTY output as binary frames

**Client → Server Messages**:

| Type | Format | Description |
|------|--------|-------------|
| Binary | Raw bytes | Keyboard input forwarded to shell PTY |
| JSON | `{ type: 'resize', cols: number, rows: number }` | Terminal resize |

**Server → Client Messages**:

| Type | Format | Description |
|------|--------|-------------|
| Binary | Raw bytes | Shell PTY output |
| JSON | `{ type: 'shell_status', sessionId, status, pid?, exitCode? }` | Shell lifecycle events |

**Disconnection**:
- Client disconnect does NOT kill the shell (shell persists for reconnection)
- Shell is only killed by: explicit DELETE, session suspend, or session complete
