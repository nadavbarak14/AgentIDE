# Quickstart: Session Persistence & Crash Recovery

**Feature**: 023-session-persistence
**Date**: 2026-03-03

## Overview

This feature ensures sessions survive hub crashes. Remote sessions are kept alive via tmux on the remote worker and reattached on restart. Local sessions preserve their scrollback history for review. Clean shutdowns continue to auto-delete sessions as before (feature 021 behavior preserved).

## Prerequisites

- tmux installed on all remote workers (`apt install tmux` / `yum install tmux`)
- Existing Adyx installation with sessions table and settings table

## Key Changes

### 1. Hub Startup — Crash Detection

**File**: `backend/src/hub-entry.ts`

On startup, check the `hub_status` setting:
- If `hub_status = 'running'` → crash detected → enter recovery mode
- If `hub_status = 'stopped'` or missing → normal startup

Set `hub_status = 'running'` before processing any sessions.

### 2. Clean Shutdown — Flag Update

**File**: `backend/src/hub-entry.ts`

In the SIGINT/SIGTERM handler, before any cleanup:
1. Set `hub_status = 'stopped'` in settings
2. Proceed with existing cleanup (kill PTYs, delete sessions)

### 3. Crash Recovery Flow

**File**: `backend/src/services/session-manager.ts`

When crash is detected:
1. Query all sessions with `status = 'active'` (orphaned from crash)
2. Mark each as `status = 'crashed'`
3. For remote sessions: attempt tmux reattachment via SSH
4. For local sessions: verify scrollback file exists, leave as `crashed`

### 4. Remote PTY — tmux Wrapping

**File**: `backend/src/worker/remote-pty-bridge.ts`

Change Claude spawn command to use tmux:
```
Before: cd /dir && claude --settings ...
After:  tmux new-session -d -s c3-<id> 'cd /dir && claude ...' && tmux attach -t c3-<id>
```

Add recovery method:
```typescript
async reattachSession(sessionId: string, workerId: string): Promise<PtyProcess | null>
```

### 5. Frontend — Crashed Session Display

**Files**: `frontend/src/components/SessionGrid.tsx`, `SessionCard.tsx`

- Show `crashed` sessions alongside active sessions
- Amber/orange status indicator for crashed sessions
- "Dismiss" button to remove crashed sessions
- Read-only terminal view showing preserved scrollback

### 6. Session Status Type

**File**: `backend/src/models/types.ts`

```typescript
export type SessionStatus = 'active' | 'completed' | 'failed' | 'crashed';
```

## Testing

### Unit Tests
- Crash detection: verify `hub_status` flag logic
- Session status transitions: `active → crashed`, `crashed → active` (reattach), `crashed → deleted` (dismiss)
- tmux command generation: verify correct tmux commands

### Integration Tests
- API: GET /api/sessions returns crashed sessions
- API: DELETE /api/sessions/:id works for crashed sessions
- API: GET /api/sessions/:id/scrollback returns preserved history
- Clean shutdown: no crashed sessions after normal stop

### System Tests
- Simulate crash: set `hub_status = 'running'`, create active sessions, run recovery logic
- Verify remote sessions attempt tmux reattachment
- Verify local sessions preserve scrollback
- Verify clean shutdown sets `hub_status = 'stopped'`

## Migration

```sql
ALTER TABLE sessions ADD COLUMN crash_recovered_at TEXT;
```

The `crashed` status value is handled at the application level (SessionStatus type). SQLite's CHECK constraint is permissive when the application inserts new values not in the original constraint — the migration recreates the constraint or the app simply validates status values itself.
