# Data Model: Session Save & Performance

**Feature**: 041-session-save-performance
**Date**: 2026-03-17

## Schema Changes

### No New Tables Required

This feature modifies behavior around existing tables, not schema.

### Existing Tables (Relevant)

#### `sessions` — No Schema Changes

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT,
  worker_id TEXT REFERENCES workers(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'completed', 'failed', 'crashed')),
  working_directory TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER,
  pid INTEGER,
  needs_input INTEGER NOT NULL DEFAULT 0,
  lock INTEGER NOT NULL DEFAULT 0,
  continuation_count INTEGER NOT NULL DEFAULT 0,
  terminal_scrollback TEXT,       -- Path to scrollback file
  crash_recovered_at TEXT,        -- When recovery was attempted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Behavioral Changes**:
- Sessions with status `completed`/`failed` are NO LONGER deleted on startup
- Sessions with status `completed`/`failed` are NO LONGER deleted by event handlers
- New cleanup policy: sessions older than 7 days with status `completed`/`failed` are cleaned up on startup
- `deleteNonActiveSessions()` → renamed to `cleanupStaleSessions()` with age threshold

#### `panel_states` — No Schema Changes

```sql
CREATE TABLE panel_states (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  active_panel TEXT, left_panel TEXT, right_panel TEXT,
  left_width_percent INTEGER, right_width_percent INTEGER,
  bottom_panel TEXT, bottom_height_percent INTEGER,
  terminal_position TEXT, terminal_visible INTEGER,
  file_tabs TEXT, active_tab_index INTEGER,
  tab_scroll_positions TEXT, git_scroll_position INTEGER,
  preview_url TEXT, preview_viewport TEXT,
  custom_viewport_width INTEGER, custom_viewport_height INTEGER,
  font_size INTEGER, panel_width_percent INTEGER,
  updated_at TEXT
);
```

**Behavioral Changes**:
- Frontend auto-saves panel state every 5 seconds (debounced) instead of only on explicit action
- Panel state saved on session switch and on visibility change (tab blur)

#### `settings` — No Schema Changes

```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  hub_status TEXT NOT NULL DEFAULT 'stopped'
  -- ... other fields unchanged
);
```

**Behavioral Changes**:
- `hub_status` flag logic unchanged — still `'running'` on start, `'stopped'` on clean shutdown

## State Transitions

### Session Status (Existing — Behavior Modified)

```
                    ┌─────────────────────────────────────┐
                    │                                     │
  create ──► active ──► completed (exit 0)               │
                │       [PRESERVED - not deleted]         │
                │                                         │
                ├──► failed (exit ≠ 0)                    │
                │    [PRESERVED - not deleted]             │
                │                                         │
                ├──► crashed (hub died)                    │
                │       │                                 │
                │       ├──► active (tmux alive, reattach)│
                │       │                                 │
                │       └──► completed (tmux dead)        │
                │            [scrollback preserved]       │
                │                                         │
                └─────────────────────────────────────────

  cleanup: sessions > 7 days old with status
           completed/failed are deleted on startup
```

### Key Change: Sessions Are Preserved

**Before (current)**:
- `session_completed` event → `repo.deleteSession(id)` — session + all cascaded data deleted
- `session_failed` event → `repo.deleteSession(id)` — same
- Startup → `deleteNonActiveSessions()` → deletes completed/failed

**After (this feature)**:
- `session_completed` event → status updated to `completed`, session preserved
- `session_failed` event → status updated to `failed`, session preserved
- Startup → `cleanupStaleSessions(7)` → only deletes sessions older than 7 days

## Data Flow Changes

### Scrollback Persistence

```
Terminal output
    │
    ▼
onData() handler ──► scrollbackPending buffer (in-memory)
                         │
                         ▼ (every 500ms, reduced from 2s)
                    appendFileSync() ──► {cwd}/scrollback/{sessionId}.scrollback
                         │
                         ▼ (on SIGTERM/SIGINT)
                    flushScrollback() ──► final sync write
```

**Change**: Flush interval reduced from 2000ms to 500ms.

### Panel State Auto-Save

```
User action (resize, tab switch, panel toggle)
    │
    ▼
React state update ──► debounce timer (5 seconds)
                           │
                           ▼
                       PUT /api/sessions/:id/panel-state
                           │
                           ▼
                       SQLite INSERT OR REPLACE
```

**New flow** — currently panel state is only saved on explicit actions (session switch, panel toggle).

### Session Switch (Optimized)

```
User clicks session
    │
    ▼
Debounce (100ms) ──► Cancel pending switches
    │
    ▼
Check in-memory cache ──► HIT: render immediately (< 50ms)
    │                          │
    ▼ MISS                     ▼
GET /api/sessions/:id/panel-state ──► Cache result
    │
    ▼
Render session (< 500ms total)
```

**New flow** — currently every switch makes an API round-trip.

## Entity Relationship (Unchanged)

```
sessions ──< panel_states        (1:1, CASCADE DELETE)
sessions ──< panel_layout_snapshots (1:N, CASCADE DELETE)
sessions ──< comments            (1:N, CASCADE DELETE)
sessions ──< artifacts           (1:N, CASCADE DELETE)
sessions ──< preview_comments    (1:N, CASCADE DELETE)
sessions ──< uploaded_images     (1:N, CASCADE DELETE)
sessions ──< video_recordings    (1:N, CASCADE DELETE)
workers  ──< sessions            (1:N, nullable FK)
```

No relationship changes. CASCADE DELETE still applies — when a session IS eventually deleted (after 7-day threshold), all related data is cleaned up.
