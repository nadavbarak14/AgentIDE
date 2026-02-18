# API Contracts: IDE Panels

**Feature Branch**: `002-ide-panels` | **Date**: 2026-02-18

## Existing Endpoints (used as-is)

These endpoints from feature 001 are used by IDE panels without modification:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sessions/:id/files?path=` | List directory contents (file tree) |
| GET | `/api/sessions/:id/files/content?path=` | Read file content (1MB limit) |
| GET | `/api/sessions/:id/diff` | Get git diff (staged + unstaged) |
| POST | `/api/sessions/:id/input` | Send text input to session PTY |

## New Endpoints

### Panel State

#### `GET /api/sessions/:id/panel-state`

Retrieve the saved panel state for a session.

**Response 200**:
```json
{
  "sessionId": "abc-123",
  "activePanel": "files",
  "fileTabs": ["src/index.ts", "src/App.tsx"],
  "activeTabIndex": 0,
  "tabScrollPositions": {
    "src/index.ts": { "line": 42, "column": 0 },
    "src/App.tsx": { "line": 1, "column": 0 }
  },
  "gitScrollPosition": 0,
  "previewUrl": "",
  "panelWidthPercent": 40
}
```

**Response 404** (no saved state):
```json
{
  "error": "No panel state found for session"
}
```

#### `PUT /api/sessions/:id/panel-state`

Save or update the panel state for a session. Uses upsert — creates if not exists, replaces if exists.

**Request body**:
```json
{
  "activePanel": "files",
  "fileTabs": ["src/index.ts", "src/App.tsx"],
  "activeTabIndex": 0,
  "tabScrollPositions": {
    "src/index.ts": { "line": 42, "column": 0 },
    "src/App.tsx": { "line": 1, "column": 0 }
  },
  "gitScrollPosition": 0,
  "previewUrl": "",
  "panelWidthPercent": 40
}
```

**Validation**:
- `activePanel`: required, one of `'none' | 'files' | 'git' | 'preview'`
- `fileTabs`: required, array of strings
- `activeTabIndex`: required, integer >= 0
- `tabScrollPositions`: required, object with string keys and `{line: number, column: number}` values
- `gitScrollPosition`: required, integer >= 0
- `previewUrl`: required, string
- `panelWidthPercent`: required, integer between 20 and 80

**Response 200**:
```json
{
  "success": true
}
```

**Response 400** (validation failure):
```json
{
  "error": "Invalid activePanel value. Must be one of: none, files, git, preview"
}
```

---

### Comments

#### `GET /api/sessions/:id/comments`

List all comments for a session, ordered by creation time.

**Query parameters**:
- `status` (optional): Filter by status (`pending` or `sent`)

**Response 200**:
```json
{
  "comments": [
    {
      "id": "comment-uuid-1",
      "sessionId": "abc-123",
      "filePath": "src/App.tsx",
      "startLine": 42,
      "endLine": 45,
      "codeSnippet": "const count = users.length;\nconsole.log(count);",
      "commentText": "This variable should be named userCount",
      "status": "sent",
      "createdAt": "2026-02-18T10:30:00Z",
      "sentAt": "2026-02-18T10:30:05Z"
    },
    {
      "id": "comment-uuid-2",
      "sessionId": "abc-123",
      "filePath": "src/utils.ts",
      "startLine": 10,
      "endLine": 10,
      "codeSnippet": "export function foo() {",
      "commentText": "Rename this function to something descriptive",
      "status": "pending",
      "createdAt": "2026-02-18T10:35:00Z",
      "sentAt": null
    }
  ]
}
```

#### `POST /api/sessions/:id/comments`

Create a new comment and optionally inject it into the session.

**Request body**:
```json
{
  "filePath": "src/App.tsx",
  "startLine": 42,
  "endLine": 45,
  "codeSnippet": "const count = users.length;\nconsole.log(count);",
  "commentText": "This variable should be named userCount"
}
```

**Validation**:
- `filePath`: required, string, no `..` or null bytes
- `startLine`: required, integer >= 1
- `endLine`: required, integer >= startLine
- `codeSnippet`: required, non-empty string
- `commentText`: required, non-empty string

**Behavior**:
1. Create comment record in database with status `pending`
2. If session is active (has a running PTY process):
   - Compose contextual message from comment fields
   - Inject message into session via PTY input
   - Update comment status to `sent`
3. If session is not active:
   - Comment remains `pending`
   - Will be delivered when session resumes (see delivery endpoint)

**Response 201**:
```json
{
  "id": "comment-uuid-3",
  "sessionId": "abc-123",
  "filePath": "src/App.tsx",
  "startLine": 42,
  "endLine": 45,
  "codeSnippet": "const count = users.length;\nconsole.log(count);",
  "commentText": "This variable should be named userCount",
  "status": "sent",
  "createdAt": "2026-02-18T10:40:00Z",
  "sentAt": "2026-02-18T10:40:01Z"
}
```

**Response 400** (validation failure):
```json
{
  "error": "filePath must not contain path traversal characters"
}
```

#### `POST /api/sessions/:id/comments/deliver`

Deliver all pending comments for a session. Called when a session resumes or becomes active.

**No request body required.**

**Behavior**:
1. Fetch all pending comments for the session, ordered by creation time
2. For each pending comment:
   - Compose contextual message
   - Inject into session via PTY input
   - Update status to `sent`
3. Return list of delivered comment IDs

**Response 200**:
```json
{
  "delivered": ["comment-uuid-2", "comment-uuid-4"],
  "count": 2
}
```

**Response 200** (no pending comments):
```json
{
  "delivered": [],
  "count": 0
}
```

---

## WebSocket Messages (existing, unchanged)

These existing WebSocket messages are consumed by IDE panels:

### Server → Client

#### `file_changed`
```json
{
  "type": "file_changed",
  "sessionId": "abc-123",
  "paths": ["src/App.tsx", "src/index.ts"],
  "timestamp": "2026-02-18T10:30:00Z"
}
```
**Used by**: File tree refresh, open file tab refresh, git diff refresh

#### `port_detected`
```json
{
  "type": "port_detected",
  "sessionId": "abc-123",
  "port": 3000,
  "pid": 12345,
  "process": "node",
  "action": "detected"
}
```
**Used by**: Live preview auto-load

#### `port_closed`
```json
{
  "type": "port_closed",
  "sessionId": "abc-123",
  "port": 3000,
  "action": "closed"
}
```
**Used by**: Live preview "Server stopped" message

#### `session_status`
```json
{
  "type": "session_status",
  "sessionId": "abc-123",
  "status": "completed",
  "claudeSessionId": "claude-session-456"
}
```
**Used by**: Disable comment delivery for completed sessions, queue comments for later
