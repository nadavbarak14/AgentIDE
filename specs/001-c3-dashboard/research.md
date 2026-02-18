# Research: C3 Dashboard

**Branch**: `001-c3-dashboard` | **Date**: 2026-02-17

## Decision 1: SSH Tunnel Management

**Decision**: Use the `ssh2` npm package (mscdex/ssh2) for all SSH tunnel management.

**Rationale**:
- Programmatic control over connection lifecycle — listen to `close`/`error` events, reconnect with exponential backoff
- Multiplexed channels over a single TCP connection — forwarding multiple ports costs one connection
- Dynamic port forwarding at runtime via `client.forwardOut()` — no need to restart tunnels when a dev server starts on a new port
- Port discovery via `client.exec('ss -tlnp')` over the same connection
- 4.85M weekly npm downloads, active maintenance, full `@types/ssh2` TypeScript coverage
- Clean resource cleanup — `client.destroy()` terminates everything, no zombie processes

**Alternatives rejected**:
- `ssh -L` child processes: Cannot forward dynamically-discovered ports without restarting; orphaned zombie processes on unclean exit; no typed interface
- `tunnel-ssh`: Abstracts away the `ssh2` Client, preventing multiplexed dynamic port forwarding
- `ssh2-promise`: Inactive maintenance, opaque reconnect behavior
- WebSocket relay agent on workers: Additional operational dependency, violates Simplicity principle

**Key packages**: `ssh2@^1.17.x`, `@types/ssh2@^1.15.x`

## Decision 2: Queue Persistence

**Decision**: Use `better-sqlite3` directly (no ORM) with WAL journal mode.

**Rationale**:
- ACID transactions with WAL mode — crash-safe, readers never block writers
- Zero-config: no external database server, single file on disk
- Full SQL query capability for ordered task retrieval, status filtering
- Sub-millisecond query latency at queue scale (hundreds of rows)
- Synchronous API simplifies TypeScript code (no async wrapper needed)
- Complete `@types/better-sqlite3` coverage

**Alternatives rejected**:
- JSON file + atomic writes: No concurrent read isolation, full-file serialization on every write, no query capability
- `drizzle-orm` + `better-sqlite3`: Doubles dependency footprint for 4-column schema — premature. Revisit if schema grows to 5+ tables
- LevelDB/RocksDB: Key-value semantics require reimplementing query logic; `Level/rocksdb` officially archived

**Key packages**: `better-sqlite3@^11.x`, `@types/better-sqlite3@^7.x`

**Pragmas on open**:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -16000;
```

## Decision 3: Terminal Streaming Protocol

**Decision**: Use `ws` (WebSocket) with one connection per session. Send raw terminal data as binary (ArrayBuffer), control messages as JSON text frames.

**Rationale**:
- One WebSocket per session avoids multiplexing complexity — sessions are independent entities with independent lifecycles
- Binary frames for terminal data preserve exact byte sequences (ANSI escapes, UTF-8) without encoding overhead
- JSON text frames for control messages (resize, input injection, session lifecycle) are easy to parse and debug
- `ws` is lower-level than `socket.io` — no automatic reconnection layer or room abstraction that adds overhead for raw streaming
- Backpressure: use WebSocket `bufferedAmount` to detect slow consumers and drop frames rather than buffering unboundedly

**Alternatives rejected**:
- `socket.io`: Adds ~50KB client bundle, auto-reconnect and room features are unnecessary for raw PTY streaming, binary support requires explicit configuration
- Single multiplexed WebSocket: Adds framing complexity; the browser limit of ~200 connections per origin is far above practical session counts (4-20)

**Key packages**: `ws@^8.x`, `@types/ws@^8.x`

**xterm.js addons**:
- `xterm-addon-fit` (required): Auto-resize terminal to container
- `xterm-addon-webgl` (recommended): GPU-accelerated rendering for multiple terminals
- `xterm-addon-web-links` (optional): Clickable URLs in terminal output
- `xterm-addon-search` (optional): Search through terminal buffer

## Decision 4: Process & Port Detection

**Decision**: Use `lsof -i -P -n -sTCP:LISTEN` for port detection (cross-platform Linux + macOS). Store PIDs in SQLite for process resume detection.

**Rationale**:
- `lsof` works identically on Linux and macOS (both ship it by default)
- `-P` (no port names), `-n` (no DNS), `-sTCP:LISTEN` (only listening sockets) produce clean, parseable output
- For process resume: store `{ sessionId, pid, claudeSessionId }` in SQLite. On restart, check `kill(pid, 0)` to see if process is still alive
- `/proc/net/tcp` is Linux-only; `ss` is Linux-only; `netstat` output format varies across platforms

**Port discovery flow**:
1. Worker runs `lsof -i -P -n -sTCP:LISTEN` filtered to agent's process tree
2. Parse output to extract port numbers
3. Compare against known forwarded ports
4. Forward new ports via `ssh2` `forwardOut()`

**Process resume flow**:
1. On session start: store `{ sessionId, pid, claudeSessionId }` in SQLite
2. On dashboard restart: query SQLite for sessions with status=active
3. For each: `kill(pid, 0)` — if alive, reattach PTY output stream
4. If dead: mark session completed, Claude session ID still available for `claude -c` continuation

## Decision 5: Frontend Architecture

**Decision**: React 18 + Tailwind CSS + Vite. CSS Grid for masonry layout (no masonry library).

**Rationale**:
- React 18 with hooks provides component model suitable for complex interactive panels
- Tailwind CSS: utility-first, rapid iteration, no custom CSS files for layout
- Vite: fast dev server, native TypeScript support, optimized production builds
- CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(400px, 1fr))` provides responsive masonry-like behavior without a library (Principle IV: Simplicity, Principle VI: no unnecessary plugins)
- Monaco Editor via `@monaco-editor/react`: well-maintained React wrapper, read-only mode is one prop
- `diff2html` for git diff visualization: 2.5M weekly downloads, actively maintained, renders unified/split diffs

**Key packages**:
- `react@^18.x`, `react-dom@^18.x`
- `tailwindcss@^3.x`
- `xterm@^5.x`, `xterm-addon-fit`, `xterm-addon-webgl`
- `@monaco-editor/react@^4.x`
- `diff2html@^3.x`

## Decision 6: Session Lifecycle & `claude -c`

**Decision**: Sessions follow a spawn-complete-continue lifecycle. Active slots are limited to `max_sessions`. Continuation uses `claude -c <session-id>`.

**Rationale**:
- `max_sessions` controls only **actively running** Claude processes — this bounds resource usage
- When a Claude process exits (task complete), the session moves to "Completed" state, freeing the slot
- The Claude session ID is persisted so the user can resume the conversation later with `claude -c`
- Continuation spawns a new Claude process in a new active slot — subject to the same `max_sessions` limit
- If all slots are full, continue requests are queued just like new tasks

**Lifecycle states**: `pending → active → completed → (continue) → active → completed → ...`

## Decision 7: Monorepo Structure

**Decision**: npm workspaces monorepo with `backend/` and `frontend/` packages. Worker mode is a different entry point in the same backend codebase.

**Rationale**:
- Hub and Worker share types, protocols, and models — same codebase avoids duplication
- `npm run start:hub` vs `npm run start:worker` switches mode via CLI flag
- Frontend is a separate package because it has a different build toolchain (Vite vs Node.js)
- No need for Turborepo or Nx at this scale (Principle IV: Simplicity)

## Decision 8: Testing Strategy

**Decision**: Vitest for all unit/integration tests. Playwright for system (e2e) tests. Real dependencies per Constitution Principle I.

**Rationale**:
- Vitest: fast, native TypeScript, compatible with both frontend (React Testing Library) and backend
- Playwright: cross-browser system tests covering full user workflows
- Real dependencies: tests spawn actual `node-pty` processes, use real SQLite databases, establish real WebSocket connections
- Mocks permitted only for: SSH connections to non-existent remote machines (use `ssh2` mock server instead)

**Key packages**: `vitest@^2.x`, `@playwright/test@^1.x`, `@testing-library/react@^16.x`, `supertest@^7.x`
