# Research: Session Persistence & Crash Recovery

**Feature**: 023-session-persistence
**Date**: 2026-03-03

## R-001: Crash vs. Clean Shutdown Detection

**Decision**: Use a `hub_status` row in the existing `settings` table to track whether the hub is running. On startup, set `hub_status = 'running'`. On clean shutdown (SIGINT/SIGTERM), set `hub_status = 'stopped'` before cleanup. If hub starts and finds `hub_status = 'running'`, the previous exit was a crash.

**Rationale**: The settings table already exists and supports key-value pairs. A simple flag is reliable because SQLite WAL mode ensures durability — the write survives even if the process crashes immediately after. No new tables or filesystem files needed.

**Alternatives considered**:
- **PID file**: Write PID to file, check if process alive on restart. Rejected: PID reuse on Linux makes this unreliable; adds filesystem complexity.
- **Separate `hub_state` table**: Overkill for a single boolean flag. Settings table already serves this purpose.
- **`process.on('exit')` handler**: Unreliable — not called on SIGKILL or crashes.

---

## R-002: Remote Session Process Survival

**Decision**: Wrap remote Claude processes in `tmux` sessions on the remote worker. Instead of running `claude` directly in the SSH shell, run `tmux new-session -d -s c3-<id> '...'` and attach with `tmux attach -t c3-<id>`. When the hub's SSH connection drops (crash), tmux keeps the Claude process running. On recovery, reconnect SSH and reattach to the tmux session.

**Rationale**: tmux is the industry-standard tool for persistent terminal sessions. It handles output buffering, terminal state preservation, and reattachment natively. It requires minimal changes to RemotePtyBridge — only the command string changes. tmux is pre-installed on nearly all Linux servers.

**Alternatives considered**:
- **Remote agent process management**: Extend the remote agent (port 4100) to spawn/manage Claude processes directly. Rejected: Major architectural change; remote agent is designed for file operations, not process lifecycle management.
- **nohup + log tailing**: Run `nohup claude ... > /tmp/log 2>&1 &` and tail the log. Rejected: Loses interactive terminal state; hard to send input back; output buffering issues.
- **screen**: Similar to tmux but less common and fewer features. Rejected: tmux is more widely available and has better programmatic control.

---

## R-003: Local Session Recovery Strategy

**Decision**: Local PTY processes cannot survive hub crashes (they lose their controlling terminal and receive SIGHUP). Recovery for local sessions means preserving scrollback files and displaying the session as "crashed" with full terminal history viewable. Users can review what happened and start a new session with `--continue` to resume work.

**Rationale**: This is the tmux-like "session history" behavior requested. The scrollback data is already written to disk every 2 seconds by PtySpawner. The key change is not deleting these files on crash — only on clean shutdown. Users get the equivalent of `tmux` history without needing tmux locally.

**Alternatives considered**:
- **Spawn local sessions in tmux**: Would make local sessions fully recoverable. Rejected for now: Adds tmux as a local dependency; changes the node-pty spawning model significantly; can be added in a future iteration.
- **Reattach to orphaned PIDs**: Find the orphaned claude process by PID and reattach. Rejected: node-pty doesn't support reattaching to existing processes; the PTY file descriptor is lost.

---

## R-004: Session Status Model Extension

**Decision**: Add `crashed` status to the session status enum (`active`, `completed`, `failed`, `crashed`). Crashed sessions are preserved in the database with their scrollback intact. They are shown in the UI with a distinct visual treatment and can be dismissed by the user.

**Rationale**: A new status clearly separates "process exited abnormally" (failed, auto-deleted) from "hub crashed while session was running" (crashed, preserved for review). This keeps the auto-delete behavior for normal failures while preserving crash victims.

**Alternatives considered**:
- **Reuse `failed` status with a `crash_recovery` flag**: Adds a boolean column but reuses the status. Rejected: Would interfere with the auto-delete logic in feature 021 which deletes all non-active sessions.
- **Keep `active` status for crashed sessions**: Confusing — they're not actually running. Rejected: Would cause the system to try to interact with non-existent PTY processes.

---

## R-005: Remote Session Reconnection Protocol

**Decision**: On crash recovery, for each session that was remote and is now in `crashed` status:
1. Re-establish SSH tunnel to the worker
2. Execute `tmux has-session -t c3-<id>` to check if Claude is still running
3. If alive: spawn new SSH shell, attach to tmux session, resume streaming
4. If dead: preserve scrollback, leave as `crashed` status
5. If worker unreachable: mark as `crashed` (worker may come back later)

**Rationale**: The check-then-attach pattern is standard tmux usage. It handles all three outcomes (alive, dead, unreachable) gracefully. The existing WorkerManager reconnection logic can be leveraged for SSH tunnel re-establishment.

---

## R-006: Scrollback Durability

**Decision**: Keep the existing 2-second throttled write pattern. This already meets the "at most a few seconds of terminal output lost" requirement. Additionally, ensure scrollback files are NOT deleted during crash recovery — only during clean shutdown or explicit user dismissal.

**Rationale**: The existing scrollback write frequency is sufficient. The key change is lifecycle management: scrollback files currently get cleaned up when sessions are deleted. After a crash, sessions should not be deleted, so scrollback survives.

---

## R-007: Testing Strategy

**Decision**: Implement tests at three levels:
1. **Unit tests**: Test crash detection logic, session status transitions, scrollback preservation, and tmux command generation in isolation.
2. **Integration tests**: Test API endpoints for crashed sessions (list, dismiss, view scrollback), clean shutdown flag persistence.
3. **System tests**: Simulate crash scenarios by manipulating the `hub_status` flag and session state directly, then running the recovery logic.

**Rationale**: True crash testing (killing processes) is inherently flaky in CI. By testing the recovery logic deterministically (set up crash state → run recovery → verify outcomes), we get reliable tests. The unit tests verify each component; system tests verify the integration.

**Alternatives considered**:
- **Actually killing the hub process in tests**: Rejected: Flaky, timing-dependent, hard to make deterministic. The recovery logic doesn't actually need a real crash — it just needs the database to be in a crash state.
- **E2E tests with process killing**: Good for release tests but too slow for regular CI. Can be added later.

---

## R-008: tmux Dependency for Remote Workers

**Decision**: Require tmux on remote workers as a prerequisite. Document this in the worker setup instructions. Check for tmux availability during worker health checks and warn if missing.

**Rationale**: tmux is available in default package managers on all major Linux distributions (`apt install tmux`, `yum install tmux`). It's a lightweight dependency. The alternative (no tmux, no persistence) is worse for users.
