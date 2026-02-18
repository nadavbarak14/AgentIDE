# WebSocket Protocol: C3 Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17

## Connection Model

One WebSocket connection per active session: `ws://localhost:{port}/ws/sessions/{sessionId}`

- **Binary frames**: Raw terminal data (PTY output → client, client input → PTY)
- **Text frames**: JSON control messages

## Client → Server Messages (Text)

### Terminal Input
```json
{
  "type": "input",
  "data": "ls -la\n"
}
```

### Terminal Resize
```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

### Auto-Approve
```json
{
  "type": "auto_approve",
  "enabled": true
}
```

## Server → Client Messages (Text)

### Session Status Update
```json
{
  "type": "session_status",
  "sessionId": "uuid",
  "status": "active|completed|failed",
  "claudeSessionId": "claude-session-id",
  "pid": 12345
}
```

### File Change Notification
```json
{
  "type": "file_changed",
  "paths": ["/src/index.ts", "/src/utils.ts"],
  "timestamp": "2026-02-17T10:00:00Z"
}
```

### Port Detected (Live Preview)
```json
{
  "type": "port_detected",
  "port": 5173,
  "localPort": 45213,
  "protocol": "http"
}
```

### Port Closed (Live Preview Stopped)
```json
{
  "type": "port_closed",
  "port": 5173
}
```

### Artifact Detected
```json
{
  "type": "artifact",
  "artifactId": "uuid",
  "artifactType": "image|pdf|diff|file",
  "path": "/tmp/output.png",
  "previewUrl": "/api/sessions/{id}/artifacts/{artifactId}"
}
```

### Needs Input (Attention Required)
```json
{
  "type": "needs_input",
  "sessionId": "uuid",
  "needsInput": true,
  "detectedPattern": "? ",
  "idleSeconds": 5
}
```

### Error
```json
{
  "type": "error",
  "message": "Worker disconnected",
  "recoverable": true
}
```

## Server → Client Messages (Binary)

Raw terminal output bytes from the PTY process. The client feeds these directly into xterm.js via `terminal.write(data)`.

## Client → Server Messages (Binary)

Raw keyboard input bytes. The server writes these directly into the PTY stdin.

## Connection Lifecycle

1. Client opens WebSocket to `/ws/sessions/{sessionId}`
2. Server sends `session_status` with current state
3. Server begins streaming terminal output (binary frames)
4. Client sends input (binary) and control messages (text)
5. On session complete: server sends `session_status` with `status: "completed"` and `claudeSessionId`
6. Connection remains open for scrollback access until client disconnects
7. On worker disconnect: server sends `error` with `recoverable: true`, attempts reconnection

## Hub-to-Worker Protocol

The hub communicates with remote workers over SSH channels (not WebSocket). The same message format is used, serialized over `ssh2` exec/shell channels.

### Worker Commands (Hub → Worker via SSH exec)

```json
{"cmd": "spawn", "taskId": "uuid", "directory": "/path", "prompt": "..."}
{"cmd": "continue", "sessionId": "uuid", "claudeSessionId": "..."}
{"cmd": "input", "sessionId": "uuid", "data": "yes\n"}
{"cmd": "resize", "sessionId": "uuid", "cols": 120, "rows": 40}
{"cmd": "kill", "sessionId": "uuid"}
{"cmd": "list_files", "directory": "/path", "subpath": "/src"}
{"cmd": "read_file", "directory": "/path", "filePath": "/src/index.ts"}
{"cmd": "git_diff", "directory": "/path"}
{"cmd": "discover_ports"}
```

### Worker Events (Worker → Hub via SSH stream)

Same format as Server → Client messages above, streamed over the SSH channel.
