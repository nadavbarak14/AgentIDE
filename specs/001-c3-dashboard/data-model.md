# Data Model: C3 Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17

## Entities

### Session

The primary entity. Represents a real Claude Code CLI session. Sessions ARE the queue — there is no separate task entity. A session is created, queued, activated when a slot opens, and interacted with via the live terminal.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique session identifier |
| claude_session_id | string (nullable) | Claude CLI session ID for `-c` continuation (captured from CLI output on completion) |
| worker_id | string (FK → Worker, nullable) | Assigned worker machine (null = "any available") |
| status | enum | `queued`, `active`, `completed`, `failed` |
| working_directory | string | Absolute path on the worker |
| title | string | User label (e.g., "Refactor Auth", "Fix Nav Bug") |
| position | number | Order in the queue (lower = higher priority, null when active/completed) |
| pid | number (nullable) | OS process ID of the running Claude process |
| needs_input | boolean | Whether Claude is waiting for user input (detected from terminal idle + prompt pattern) |
| lock | boolean | Whether the session is pinned (default: false) |
| continuation_count | number | How many times this session has been continued via `claude -c` (default: 0) |
| terminal_scrollback | string (nullable) | Path to persisted terminal scrollback buffer file |
| created_at | datetime | When the session was created |
| started_at | datetime (nullable) | When the session was first activated |
| completed_at | datetime (nullable) | When the session completed/failed |
| updated_at | datetime | Last status change |

**State transitions**:
```
queued → active          (slot available, Claude process spawned, user sees terminal)
active → completed       (Claude process exits cleanly, claude_session_id captured)
active → failed          (Claude process exits with error or worker disconnects)
completed → queued       (user clicks "Continue" but no slot available)
completed → active       (user clicks "Continue" and slot is available → claude -c)
failed → queued          (user retries, session re-enters queue)
```

**Needs Input Detection**:
- Terminal output is scanned for prompt patterns (e.g., `? `, `Y/n`, `[Yes/No]`, `> `)
- Combined with process idle detection (no output for N seconds while process is alive)
- When `needs_input` becomes true, a WebSocket event notifies the frontend to surface this session
- When user sends input via the terminal, `needs_input` resets to false

### Worker

A machine capable of running agent sessions.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique worker identifier |
| name | string | Human-readable name (e.g., "VPS-01", "Laptop") |
| type | enum | `local`, `remote` |
| ssh_host | string (nullable) | SSH hostname (null for local) |
| ssh_port | number | SSH port (default: 22) |
| ssh_user | string (nullable) | SSH username (null for local) |
| ssh_key_path | string (nullable) | Path to SSH private key (null for local) |
| status | enum | `connected`, `disconnected`, `error` |
| max_sessions | number | Max concurrent active sessions on this worker |
| last_heartbeat | datetime | Last successful communication |
| created_at | datetime | When the worker was added |

**Note**: The local machine is always registered as a worker with type=`local`.

### Artifact

A file generated or detected during a session.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique artifact identifier |
| session_id | string (FK → Session) | Owning session |
| type | enum | `image`, `pdf`, `diff`, `file` |
| path | string | Absolute path on the worker |
| detected_at | datetime | When the artifact was detected |

### Settings

Global dashboard configuration (single row).

| Field | Type | Description |
|-------|------|-------------|
| max_concurrent_sessions | number | Global concurrency limit for active Claude processes (default: 4) |
| max_visible_sessions | number | How many sessions to show in focus area (default: 2) |
| auto_approve | boolean | Whether to auto-send "Yes" to prompts (default: false) |
| grid_layout | enum | `auto`, `1x1`, `2x2`, `3x3` |
| theme | enum | `dark`, `light` (default: dark) |

## Relationships

```
Worker 1──N Session       (a worker runs many sessions)
Session 1──N Artifact     (a session produces many artifacts)
```

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('local', 'remote')),
  ssh_host TEXT,
  ssh_port INTEGER DEFAULT 22,
  ssh_user TEXT,
  ssh_key_path TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK(status IN ('connected', 'disconnected', 'error')),
  max_sessions INTEGER NOT NULL DEFAULT 2,
  last_heartbeat TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT,
  worker_id TEXT REFERENCES workers(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued', 'active', 'completed', 'failed')),
  working_directory TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER,
  pid INTEGER,
  needs_input INTEGER NOT NULL DEFAULT 0,
  lock INTEGER NOT NULL DEFAULT 0,
  continuation_count INTEGER NOT NULL DEFAULT 0,
  terminal_scrollback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('image', 'pdf', 'diff', 'file')),
  path TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  max_concurrent_sessions INTEGER NOT NULL DEFAULT 4,
  max_visible_sessions INTEGER NOT NULL DEFAULT 2,
  auto_approve INTEGER NOT NULL DEFAULT 0,
  grid_layout TEXT NOT NULL DEFAULT 'auto'
    CHECK(grid_layout IN ('auto', '1x1', '2x2', '3x3')),
  theme TEXT NOT NULL DEFAULT 'dark'
    CHECK(theme IN ('dark', 'light'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_position ON sessions(position);
CREATE INDEX IF NOT EXISTS idx_sessions_needs_input ON sessions(needs_input);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
```
