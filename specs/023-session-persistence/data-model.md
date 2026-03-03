# Data Model: Session Persistence & Crash Recovery

**Feature**: 023-session-persistence
**Date**: 2026-03-03

## Schema Changes

### 1. Sessions Table — Status Enum Extension

**Change**: Add `crashed` to the status CHECK constraint.

```sql
-- Migration: ALTER CHECK constraint
-- SQLite doesn't support ALTER CHECK, so this is handled via
-- application-level validation and a new migration that recreates
-- the table with the updated constraint (or simply allowing the
-- value at the application level since SQLite CHECK can be loose).

-- Pragmatic approach: Add migration that updates the CHECK constraint
-- by recreating the sessions table with the new status value.
-- OR: Since better-sqlite3 doesn't enforce CHECK on existing rows,
-- simply update the application-level SessionStatus type.
```

**Updated SessionStatus type**:
```typescript
export type SessionStatus = 'active' | 'completed' | 'failed' | 'crashed';
```

**Status transitions**:
```
active → completed    (normal exit, code 0)
active → failed       (abnormal exit, code != 0)
active → crashed      (hub crash detected on restart)
crashed → [deleted]   (user dismisses)
crashed → active      (remote session successfully reattached)
```

### 2. Settings Table — Hub Status Flag

**Change**: Use existing `settings` table to store hub running state.

```sql
-- No schema change needed. Just insert/update a row:
INSERT OR REPLACE INTO settings (key, value) VALUES ('hub_status', 'running');
-- On clean shutdown:
UPDATE settings SET value = 'stopped' WHERE key = 'hub_status';
```

**Key**: `hub_status`
**Values**: `'running'` | `'stopped'`
**Semantics**: If `hub_status = 'running'` on startup, previous exit was a crash.

### 3. Sessions Table — Optional New Column

**Change**: Add `crash_recovered_at` timestamp column to track when a session was recovered.

```sql
ALTER TABLE sessions ADD COLUMN crash_recovered_at TEXT;
```

**Purpose**: Distinguish between sessions that were just discovered as crashed vs. sessions where recovery was attempted. Null means not yet processed by recovery logic.

## Entity Relationships

```
settings (hub_status)
  │
  └─ Consulted on startup to determine if crash recovery is needed

sessions (status = 'crashed')
  │
  ├─ scrollback file: scrollback/{sessionId}.scrollback
  │   (preserved on crash, deleted on dismiss)
  │
  ├─ panel_states (FK session_id)
  │   (preserved on crash for layout restoration)
  │
  ├─ workers (FK worker_id)
  │   (used to determine remote vs. local recovery path)
  │
  └─ comments, artifacts (FK session_id)
      (preserved on crash, cascaded on dismiss)
```

## State Machine

### Hub Lifecycle States

```
[Start] → Check hub_status
  │
  ├─ hub_status = 'stopped' (or missing)
  │   └─ Normal startup
  │       └─ Set hub_status = 'running'
  │       └─ Delete non-active sessions (existing behavior)
  │
  └─ hub_status = 'running' (crash detected)
      └─ Recovery startup
          └─ Set hub_status = 'running'
          └─ Mark all 'active' sessions → 'crashed'
          └─ For each crashed session:
              ├─ Remote + worker reachable + tmux alive → reattach → 'active'
              ├─ Remote + worker reachable + tmux dead → keep 'crashed'
              ├─ Remote + worker unreachable → keep 'crashed'
              └─ Local → keep 'crashed' (scrollback preserved)
```

### Session Recovery States

```
┌──────────┐
│  active  │ ←── (hub is running, PTY exists)
└────┬─────┘
     │ [hub crash]
     v
┌──────────┐
│ crashed  │ ←── (hub restart detected crash)
└────┬─────┘
     │
     ├── [remote + tmux alive] ──→ reattach ──→ active
     │
     ├── [user dismisses] ──→ DELETE (cascade scrollback, panels)
     │
     └── [no recovery possible] ──→ remains 'crashed' (viewable)
```

## Data Integrity Rules

1. **Scrollback files**: MUST NOT be deleted for sessions in `crashed` status
2. **Panel states**: MUST be preserved for crashed sessions (user may want to see layout)
3. **Comments**: MUST be preserved for crashed sessions (may have pending reviews)
4. **Hub status flag**: MUST be set to `'running'` before any sessions are created
5. **Hub status flag**: MUST be set to `'stopped'` as the first action in clean shutdown handler
6. **Session delete cascade**: When user dismisses a crashed session, same cascade as existing delete (panel_states, scrollback files)
