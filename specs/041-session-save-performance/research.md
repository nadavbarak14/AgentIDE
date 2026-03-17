# Research: Session Save & Performance

**Feature**: 041-session-save-performance
**Date**: 2026-03-17

## Research Summary

Three key areas investigated: (1) why sessions are lost on restart/crash, (2) why session switching/creation is slow, (3) gaps in crash recovery and state persistence.

---

## R1: Session Loss on Restart/Crash

### Decision: Fix session deletion order and prevent premature cleanup

### Rationale

The current startup sequence in `hub-entry.ts` calls `deleteNonActiveSessions()` at line 110 BEFORE recovery at line 340. This deletes all `completed`/`failed` sessions from previous runs. While `active` sessions are preserved (they get marked `crashed` for recovery), the core bug is:

1. **Clean shutdown path**: On SIGTERM, `hub_status` is set to `'stopped'` but active sessions are NOT explicitly preserved — they rely on tmux being alive. If tmux also dies (e.g., system reboot), sessions become unrecoverable.

2. **Recovery failure cascade**: When recovery fails (tmux dead), sessions are marked `completed` → next restart deletes them at startup line 110.

3. **Event-driven deletion**: `session_completed` and `session_failed` event handlers immediately call `repo.deleteSession()`, removing the session and ALL cascade data (panel_states, comments, images, videos).

### Key Code Paths

| Path | Location | Effect |
|------|----------|--------|
| Startup deletion | hub-entry.ts:110 | Deletes status NOT IN ('active','crashed') |
| Complete event | hub-entry.ts:299-312 | Deletes session + cascades |
| Fail event | hub-entry.ts:314-327 | Deletes session + cascades |
| Mark crashed | session-manager.ts:608 | active → crashed |
| Recovery fail | session-manager.ts:584,589 | crashed → completed (then deleted next restart) |

### Solution Direction

- Stop deleting sessions on completion/failure events — mark status only
- Preserve completed/failed sessions in DB with their scrollback
- Add cleanup policy: delete sessions older than N days (configurable)
- On clean shutdown, ensure session state is fully flushed before exit
- On startup, recover ALL non-completed sessions, not just crashed ones

### Alternatives Considered

1. **Keep current delete-on-complete**: Rejected — users lose sessions permanently on any disruption
2. **Write session state to separate recovery file**: Rejected — adds complexity; SQLite WAL is already crash-safe
3. **Background checkpoint process**: Rejected — overengineered; the fix is simpler (don't delete)

---

## R2: Session Switching Performance

### Decision: Cache terminal state, batch API calls, debounce switches

### Rationale

Session switching currently takes 300-1000ms due to multiple sequential operations:

| Bottleneck | Latency | Location |
|-----------|---------|----------|
| Panel state save (old) + load (new) | 200-400ms | usePanel.ts:246-297 |
| Extension/widget separate fetches | 100-300ms | SessionCard.tsx:185-208 |
| WebSocket handshake | 50-150ms | ws connection |
| 1-second poll interval | 0-1000ms | useSessionQueue.ts:21 |

### Solution Direction

1. **Cache panel state in memory** for last N sessions — avoid API round-trip on re-visit
2. **Batch extension + widget into single metadata endpoint** — one round-trip instead of two
3. **Keep WebSocket connections alive** for recently-viewed sessions (already partially done with hidden SessionCards)
4. **Use WebSocket broadcasts for state changes** instead of polling — eliminate poll interval delay
5. **Debounce rapid session switches** — cancel intermediate switches, only execute final

### Alternatives Considered

1. **Server-sent events instead of WebSocket**: Rejected — WebSocket already in use, no benefit to switching
2. **Preload all session states on startup**: Rejected — wasteful for many sessions; lazy + cache is better
3. **Remove polling entirely**: Rejected — WebSocket broadcasts should supplement polling, not replace it (resilience)

---

## R3: Session Creation Performance

### Decision: Parallelize spawn steps, make skill injection async

### Rationale

Session creation takes 1.5-2.5 seconds due to sequential blocking operations:

| Bottleneck | Latency | Location |
|-----------|---------|----------|
| Skill file copying (sync loop) | 500-2000ms | pty-spawner.ts:197-240 |
| fs.mkdirSync | 50-100ms | sessions.ts:75 |
| execSync('git init') | 200-300ms | sessions.ts:86-89 |
| tmux double-fork | 100-300ms | pty-spawner.ts:267 |
| File watcher startup | 200-1000ms | websocket.ts:106 |

### Solution Direction

1. **Replace sync skill file copy with symlinks or async copy** — biggest single win (500-2000ms saved)
2. **Replace execSync with async exec** for git init
3. **Show optimistic UI** — display session card immediately, show loading state while PTY spawns
4. **Lazy-start file watcher** — don't block on chokidar scan at connection time

### Alternatives Considered

1. **Pre-spawn PTY pool**: Rejected — complexity for marginal gain; skill injection is the real bottleneck
2. **Skip tmux for local sessions**: Rejected — tmux wrapping is essential for crash resilience
3. **Copy skills in background after spawn**: Rejected — Claude needs skills directory at startup

---

## R4: Scrollback Persistence Gaps

### Decision: Reduce flush interval, add crash-safe buffering

### Rationale

Current 2-second throttled flush means up to 2 seconds of data loss on crash. The `scrollbackPending` in-memory buffer is the vulnerability — if the hub process dies, this buffer is lost.

### Solution Direction

1. **Reduce flush interval to 500ms** — acceptable I/O overhead, reduces worst-case loss to 500ms
2. **Flush scrollback synchronously on SIGTERM/SIGINT** before exit (already partially done)
3. **Accept that SIGKILL data loss is unavoidable** — document as known limitation
4. **Add periodic panel state auto-save** (every 5 seconds) — currently only saved on explicit PUT

### Alternatives Considered

1. **Write-through (no buffering)**: Rejected — too much disk I/O, would harm terminal performance
2. **Memory-mapped file**: Rejected — platform complexity (Windows + Linux), marginal benefit
3. **Append-only log with WAL**: Rejected — SQLite WAL already provides this for DB; scrollback files are already append-only

---

## R5: Panel State Persistence

### Decision: Add automatic periodic panel state saving

### Rationale

Panel state is currently saved ONLY when the frontend makes an explicit PUT request. There is no auto-save timer or debounce. If the hub crashes between explicit saves, panel layout changes are lost.

### Solution Direction

1. **Frontend auto-save**: Debounced save (5-second interval) whenever panel state changes
2. **Save on visibility change**: Flush state when tab becomes hidden (user switching away)
3. **Save on session switch**: Already partially done — ensure it completes before switch

### Alternatives Considered

1. **Backend-initiated save via WebSocket ping**: Rejected — frontend owns state, backend doesn't know layout
2. **LocalStorage-first with lazy sync**: Rejected — adds dual-source-of-truth complexity

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State persistence | SQLite (existing) | Already crash-safe with WAL mode; no new dependencies |
| Session caching | In-memory LRU (frontend) | Avoids API round-trips for recent sessions |
| Scrollback storage | Filesystem (existing) | Append-friendly, no schema changes needed |
| Communication | WebSocket broadcasts (extend existing) | Replace some polling; already have infrastructure |
| Skill injection | Symlinks or async copy | Replace blocking sync loop; biggest perf win |
| Panel auto-save | Frontend debounced timer | Frontend owns state; 5-second interval balances I/O vs data loss |
