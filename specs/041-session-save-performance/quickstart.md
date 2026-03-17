# Quickstart: Session Save & Performance

**Feature**: 041-session-save-performance
**Date**: 2026-03-17

## What This Feature Does

Makes sessions survive any type of hub shutdown (crash, restart, update) and makes session switching and creation faster.

## Key Changes Summary

### 1. Sessions Are Never Deleted Automatically

**Before**: Sessions deleted immediately when they complete/fail. Also bulk-deleted on startup.
**After**: Sessions stay in the database. Only cleaned up after 7 days.

**Files to change**:
- `backend/src/hub-entry.ts` — Remove `deleteSession()` calls from event handlers; replace `deleteNonActiveSessions()` with age-based cleanup
- `backend/src/models/repository.ts` — Add `cleanupStaleSessions(maxAgeDays)` method

### 2. Faster Scrollback Flushing

**Before**: Scrollback buffered for 2 seconds before disk write.
**After**: Flush every 500ms.

**Files to change**:
- `backend/src/worker/pty-spawner.ts` — Change `SCROLLBACK_FLUSH_INTERVAL` from 2000 to 500

### 3. Frontend Panel State Auto-Save

**Before**: Panel state only saved on explicit user action.
**After**: Auto-saved every 5 seconds (debounced) + on session switch + on tab blur.

**Files to change**:
- `frontend/src/hooks/usePanel.ts` — Add debounced auto-save timer

### 4. Frontend Session State Caching

**Before**: Every session switch makes API round-trip for panel state.
**After**: LRU cache for last 5 sessions; cache hit skips API call.

**Files to change**:
- `frontend/src/hooks/usePanel.ts` — Add in-memory cache
- `frontend/src/hooks/useSession.ts` — Add switch debouncing (100ms)

### 5. Batched Metadata Endpoint

**Before**: Two separate API calls for widgets and extensions per session mount.
**After**: Single `/api/sessions/:id/metadata` endpoint.

**Files to change**:
- `backend/src/api/routes/sessions.ts` — Add GET `/metadata` route
- `frontend/src/components/SessionCard.tsx` — Replace two fetches with one

### 6. WebSocket State Broadcasts

**Before**: Frontend polls every 1 second for session state.
**After**: WebSocket broadcasts push state changes; polling relaxed to 5s fallback.

**Files to change**:
- `backend/src/api/websocket.ts` — Add `session_state_changed` broadcast
- `backend/src/hub-entry.ts` — Emit broadcasts on status/input changes
- `frontend/src/hooks/useSessionQueue.ts` — Listen for WS broadcasts, increase poll interval

### 7. Async Skill Injection

**Before**: Synchronous file copy loop blocks session creation (500-2000ms).
**After**: Use symlinks or async copy to eliminate blocking.

**Files to change**:
- `backend/src/worker/pty-spawner.ts` — Replace `fs.cpSync` loop with symlink or async alternative

## Development Order

1. **Session preservation** (P1 — stops the data loss)
2. **Panel auto-save + scrollback flush** (P2 — continuous state saving)
3. **Session switch caching + debounce** (P2 — fast switching)
4. **Metadata batching + WS broadcasts** (P2 — reduces latency)
5. **Async skill injection** (P3 — fast creation)

## Testing Strategy

- **Unit tests**: Repository cleanup logic, cache behavior, debounce logic
- **Integration tests**: Session survival across simulated restart, API contract tests
- **System tests**: Full crash → restart → recovery → verify state cycle

## Running Locally

```bash
# Start the hub
npm run dev

# Create sessions, interact with them
# Kill hub (Ctrl+C or kill -9)
# Restart hub
# Verify sessions are restored
```
