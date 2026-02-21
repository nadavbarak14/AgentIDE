# Research: Clean Session & Connection UX

**Feature**: 012-session-connect-ux
**Date**: 2026-02-21

## R-001: Remote PTY Execution over SSH

**Decision**: Use ssh2's `Client.shell()` method (not `exec()`) to allocate an interactive PTY on the remote machine, then stream stdin/stdout bidirectionally over the existing SSH connection.

**Rationale**: The current `TunnelManager.exec()` runs one-shot commands and returns a string — unsuitable for interactive terminal sessions. `ssh2.Client.shell({ term: 'xterm-256color', cols, rows })` allocates a real PTY on the remote side and returns a duplex stream. This gives us:
- Full PTY support (colors, cursor movement, TUI rendering)
- Resize support via `stream.setWindow(rows, cols)`
- Binary-safe I/O matching the local `node-pty` pattern
- No need for a custom daemon on the remote machine

**Alternatives considered**:
- `WorkerClient.sendCommand()` (existing) — pipes JSON to `worker-entry.js` via `exec()`. Designed for fire-and-forget commands, not interactive streaming. Would require a persistent daemon and custom framing protocol.
- Port forwarding + remote `node-pty` server — too complex. Requires installing and running a daemon on every remote worker.
- `exec()` with PTY flag — ssh2's `exec()` supports `{ pty: true }` but is still single-command oriented. `shell()` is the correct primitive for persistent interactive sessions.

**Implementation**: Add `shell(workerId, options)` method to `TunnelManager` that returns a duplex `ClientChannel`. Create `RemotePtyBridge` class that wraps this stream with the same EventEmitter interface as `PtySpawner` (`data`, `exit` events, `write()`, `resize()` methods) so `WebSocketServer` can treat local and remote sessions identically.

## R-002: Remote Directory Browsing over SSH

**Decision**: Use `TunnelManager.exec()` to run `ls -1p "$HOME"` (and subdirectories) on the remote machine, parse the output, and return it through the same API shape as local directory browsing.

**Rationale**: The local directory endpoint uses `fs.readdirSync()` — obviously unavailable for remote filesystems. The simplest equivalent is running `ls` over the existing SSH connection. The exec primitive already exists and works reliably.

**Alternatives considered**:
- SFTP subsystem (ssh2 supports `sftp()`) — heavier setup, but more robust for large directory trees. Overkill for listing 20 entries at a time.
- Caching remote filesystem tree on connection — too much data, stale quickly.

**Implementation**: New endpoint `GET /api/workers/:id/directories?path=&query=` that calls `tunnelManager.exec(workerId, command)` where command is:
```bash
ls -1pa "$path" 2>/dev/null | grep '/$' | head -20
```
Then filters hidden dirs (except `.config`), excludes `node_modules/`, matches query prefix, and returns the same `{ path, entries, exists }` shape. Results are cached in-memory per worker for 5 seconds to reduce SSH round-trips during autocomplete.

## R-003: Per-Worker Concurrency Limits

**Decision**: Replace the global `settings.maxConcurrentSessions` check in `QueueManager` with per-worker checks using the existing `workers.max_sessions` column and `repo.getActiveSessionsOnWorker()` method.

**Rationale**: The infrastructure is already 90% built:
- `workers.max_sessions` column exists (DEFAULT 2)
- `repo.getActiveSessionsOnWorker(workerId)` query exists
- Sessions already store `worker_id`

The only gap is that `QueueManager.hasAvailableSlot()` and `tryDispatch()` use the global count instead.

**Alternatives considered**:
- Keep global limit AND add per-worker limit — double enforcement is confusing. The per-worker limit subsumes the global one (total capacity = sum of all workers' max_sessions).
- Remove `settings.max_concurrent_sessions` entirely — risky for backwards compatibility. Instead, keep it as a soft cap but make per-worker the primary control.

**Implementation**:
1. `hasAvailableSlot()` → iterate all workers, check if ANY worker has `getActiveSessionsOnWorker(id) < worker.maxSessions`. If yes, slot available.
2. `tryDispatch()` → when picking the next session to activate, find a worker with capacity. If session has a `targetWorker`, check that specific worker. If no target, find any worker with capacity.
3. `getNextQueuedSession()` remains unchanged (just gets the next queued session by position).
4. Keep `settings.max_concurrent_sessions` as a global ceiling for backwards compatibility — total active across all workers cannot exceed this value.

## R-004: $HOME Directory Restriction

**Decision**: Enforce server-side in the directories route and session creation route. Resolve the provided path and verify it starts with `os.homedir()`. Reject with 403 if not.

**Rationale**: Server-side enforcement is the only secure approach — frontend restrictions can be bypassed. The check is a simple `path.resolve()` + `startsWith()` comparison.

**Alternatives considered**:
- Symlink-aware check using `fs.realpathSync()` — would block symlinks pointing outside `$HOME`. Accepted: use `realpath` to prevent symlink traversal.
- Configurable allowed roots — spec says `$HOME` only; keep it simple.

**Implementation**: Helper function `isWithinHomeDir(dirPath: string): boolean` that resolves both the provided path and `$HOME` via `fs.realpathSync()` (falling back to `path.resolve()` if path doesn't exist yet), then checks `resolvedPath.startsWith(resolvedHome)`. Applied in:
- `GET /api/directories` — reject paths outside `$HOME`
- `POST /api/sessions` — reject `workingDirectory` outside `$HOME`
- `GET /api/workers/:id/directories` — restrict remote browsing to remote `$HOME`

## R-005: Git Auto-Initialization for Worktree Sessions

**Decision**: Before spawning a worktree session, check if the target directory is a git repository. If not, run `git init` in that directory. On failure, abort session creation with a descriptive error.

**Rationale**: Claude's `--worktree` flag requires a git repo. Currently, if the directory isn't a git repo, the Claude process fails with a confusing error. Auto-initializing removes this friction.

**Alternatives considered**:
- Prompt the user to confirm before initializing — adds a round-trip for a common case. The spec says "automatically".
- Run `git init` on the remote machine for remote worktree sessions — same logic, but via `tunnelManager.exec(workerId, 'git init ...')`.

**Implementation**: In `POST /api/sessions`, after directory validation and before `sessionManager.createSession()`:
1. If `worktree === true`, check for `.git` directory (or `git rev-parse --git-dir`) in the target directory
2. If not a git repo: for local sessions, run `child_process.execSync('git init', { cwd: dir })`; for remote sessions, run `tunnelManager.exec(workerId, 'cd "$dir" && git init')`
3. If git init fails, return 422 with error message
4. Log the auto-initialization event

## R-006: Remote PTY Lifecycle and Session Continuation

**Decision**: Remote sessions follow the same lifecycle as local sessions (queued → active → completed/failed), with the remote PTY bridge replacing `PtySpawner`. Session continuation re-spawns on the same worker.

**Rationale**: The existing `SessionManager.activateSession()` decision tree (spawn, spawnResume, spawnContinue) applies equally to remote sessions — the only difference is WHERE the process runs. By giving `RemotePtyBridge` the same interface as `PtySpawner`, the session manager can dispatch to either based on `session.workerId`.

**Implementation**: In `SessionManager.activateSession()`:
1. Look up `session.workerId` → get the worker
2. If worker is local (or null) → use `PtySpawner` (existing behavior)
3. If worker is remote → use `RemotePtyBridge.spawn()` which:
   - Opens `tunnelManager.shell(workerId, { term, cols, rows })`
   - Sends the appropriate claude command as the first input line
   - Emits `data` and `exit` events matching PtySpawner's interface
4. For continuation, the worker_id is already stored on the session — the re-queued session will be dispatched to the same worker

## R-007: Project Bookmark Data Model

**Decision**: New `projects` table in SQLite with columns for worker binding, custom alias, bookmark flag, and usage tracking.

**Rationale**: Projects are a new first-class entity that doesn't fit into existing tables. They need to persist across sessions, be queryable (recent, bookmarked, per-worker), and support custom aliases.

**Alternatives considered**:
- Store in `settings` table as JSON blob — poor queryability, no per-project operations
- Browser localStorage — doesn't persist across devices, spec says server-side
- Extend `sessions` table — projects and sessions have different lifecycles

**Implementation**: See data-model.md for full schema.

## R-008: Worker Update Strategy

**Decision**: Add `PUT /api/workers/:id` endpoint with partial updates using the same dynamic-SQL pattern as existing `updateSession`/`updateProject`.

**Rationale**: Consistent with codebase conventions. Only changed fields are sent. On SSH config change, the existing tunnel is disconnected and a new connection is established with updated config.

**Alternatives considered**:
- DELETE + re-CREATE (destructive — loses ID references in sessions and projects)
- PATCH with JSON Merge Patch (unnecessary complexity for 6 fields)
- No update, require delete + recreate (poor UX for a name change)

**Implementation**: New `updateWorker(id, input)` in repository using dynamic SQL, new `PUT /:id` route in workers.ts with guards (404 not found, 403 local worker, 400 bad SSH key).

## R-009: Worker Management UX Location

**Decision**: "Machines" section within the existing SettingsPanel popover (user chose option B in clarification).

**Rationale**: Keeps all configuration in one place. The popover widens from w-64 to w-80. Worker list is typically 1-3 items.

**Alternatives considered**:
- Inline in sidebar next to worker selector (too cramped for SSH config form)
- Dedicated "Machines" page (overkill for 1-3 workers)
- Modal dialog (interrupts workflow)

## R-010: Machine Badge Visibility

**Decision**: Always show worker name text on every session card, even with single local worker.

**Rationale**: User explicitly requested "for each session mention what machine it is." FR-026 codifies this. The badge is subtle gray text, non-intrusive for single-worker setups.

**Alternatives considered**:
- Hide for single worker (original FR-013, now updated)
- Colored dot + name (user chose text-only in clarification)
