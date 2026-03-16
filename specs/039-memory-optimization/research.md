# Research: Memory Optimization

**Feature**: 039-memory-optimization | **Date**: 2026-03-16

## Research Findings

### 1. Hub Session Cleanup Gaps

**Decision**: Add `widgetStore.delete(sessionId)` and `cookieJar.clear(sessionId)` to the existing `session_completed` and `session_failed` event handlers in `hub-entry.ts`.

**Rationale**: Both data structures are keyed by sessionId. The `widgetStore` (Map<string, Map<string, Widget>>) stores HTML up to 512KB + results up to 1MB per widget per session — never cleaned. The `PreviewCookieJar` already has a `clear(sessionId)` method (lines 154-161 in preview-proxy.ts) but it is never called anywhere. These are the two highest-impact memory leaks.

**Alternatives considered**:
- Timer-based eviction (rejected: adds complexity, session lifecycle events already exist)
- WeakRef-based storage (rejected: over-engineered for the problem, session IDs are strings not objects)

### 2. Database Cascade Deletion

**Decision**: Extend `Repository.deleteSession()` to cascade-delete from `comments`, `preview_comments`, `uploaded_images`, `video_recordings` tables.

**Rationale**: Currently `deleteSession()` only cascades to `panel_states`. Related tables with session_id foreign keys accumulate orphaned rows. These are small per-session but grow unboundedly.

**Alternatives considered**:
- SQLite foreign key CASCADE constraints (rejected: would require schema migration and `PRAGMA foreign_keys = ON` which may affect other operations)
- Scheduled batch cleanup job (rejected: adds complexity, session lifecycle is the right hook)

### 3. PTY Scrollback Map Cleanup

**Decision**: Add explicit `scrollbackWriters.delete(sessionId)` and `scrollbackPending.delete(sessionId)` to the `cleanup()` methods in both `pty-spawner.ts` and `remote-pty-bridge.ts`.

**Rationale**: The existing `cleanup()` methods delete most maps but skip scrollback maps. While `flushScrollback()` eventually clears pending data, the map entries themselves persist. This is a minor leak but easy to fix.

**Alternatives considered**:
- Rely on existing implicit cleanup (rejected: explicit is safer and clearer)

### 4. Debug Observability

**Decision**: Add a minimal `GET /api/debug/memory` endpoint that reports counts of active widgets, cookie entries, pending commands, PTY processes, and Node.js `process.memoryUsage()`.

**Rationale**: FR-015 requires observability. A single endpoint is the simplest way to verify cleanup is working. Protected by existing auth middleware.

**Alternatives considered**:
- Structured logging only (rejected: harder to query on-demand)
- Full metrics system like Prometheus (rejected: over-engineered, user wants minimal)

### 5. Response Buffer Management

**Decision**: No changes needed.

**Rationale**: Research confirmed that response buffers in preview-proxy.ts are request-scoped (created and released per-request via `Buffer.concat(chunks)`). There is no persistent buffering or session-level accumulation. The original concern was unfounded.

### 6. WebSocket Client Maps

**Decision**: No changes needed.

**Rationale**: `sessionClients` and `shellClients` in websocket.ts already clean up properly on disconnect (remove from Set, delete empty Set). `agentWsConnections` properly deletes on close and replaces on reconnect. No gaps found.

### 7. Tunnel and Agent Tunnel Cleanup

**Decision**: No changes needed.

**Rationale**: Both `tunnel.ts` and `agent-tunnel.ts` have proper `disconnect()` methods that clean up SSH clients, reconnect timers, and local servers. `file-watcher.ts` has comprehensive `stopWatching()` that clears all maps including port scan data.

## Summary of Changes Required

| File | Change | Lines of Code |
|------|--------|---------------|
| `hub-entry.ts` | Add widgetStore + cookieJar cleanup in session_completed/session_failed handlers | ~6 |
| `preview-proxy.ts` | Export cookieJar instance (or expose via function) | ~2 |
| `repository.ts` | Add cascade deletes for comments, preview_comments, uploaded_images, video_recordings | ~8 |
| `pty-spawner.ts` | Add scrollbackWriters/scrollbackPending to cleanup() | ~2 |
| `remote-pty-bridge.ts` | Add scrollbackWriters/scrollbackPending to cleanup() | ~2 |
| `api/routes/debug.ts` (new) | Debug endpoint for resource counts | ~30 |
| **Total production code** | | **~50 lines** |
