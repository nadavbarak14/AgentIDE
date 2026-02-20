# Research: Session Terminal

**Feature**: 011-session-terminal
**Date**: 2026-02-20

## Decision 1: Shell PTY Spawner — New Module vs Extend PtySpawner

**Decision**: Create a new `ShellSpawner` class in `backend/src/worker/shell-spawner.ts`.

**Rationale**: The existing `PtySpawner` is heavily coupled to Claude-specific behavior — it injects Claude env vars, strips nested session detection, parses OSC board commands, manages hook callbacks, and tracks `claudeSessionId`. A shell terminal needs none of this. Extending `PtySpawner` would require conditionals throughout and violate Simplicity (Constitution IV). A separate, simpler class follows the same node-pty patterns but without Claude-specific logic.

**Alternatives considered**:
- **Extend PtySpawner with a `mode` flag**: Rejected — adds branching to every method, harder to test, higher risk of regression on Claude terminal behavior.
- **Generic base class + two subclasses**: Rejected — premature abstraction for two consumers. The shared surface (spawn pty, write, resize, kill) is small enough that duplication is cheaper than inheritance.

## Decision 2: WebSocket Channel — Separate Endpoint vs Multiplexed

**Decision**: Use a separate WebSocket endpoint `/ws/sessions/{sessionId}/shell` alongside the existing `/ws/sessions/{sessionId}` (Claude terminal).

**Rationale**: The existing WebSocket handler uses binary frames for raw PTY I/O. Multiplexing two PTY streams over one connection would require a framing protocol (e.g., prefixed channel bytes), breaking backward compatibility and adding complexity. A separate endpoint keeps both channels independent, uses the same binary/JSON pattern, and requires minimal changes to the existing WebSocket handler.

**Alternatives considered**:
- **Multiplex over single WS**: Rejected — requires custom framing protocol, breaks existing clients, adds parsing overhead on every frame.
- **Shared WS with JSON-wrapped binary**: Rejected — JSON-encoding binary terminal data is inefficient and breaks the existing xterm.js write pattern.

## Decision 3: Shell Scrollback Persistence

**Decision**: Persist shell scrollback to disk using the same file-based pattern as Claude terminal scrollback (`scrollback/shell-{sessionId}.scrollback`), with the same 5-second throttled writes.

**Rationale**: The existing scrollback mechanism in `PtySpawner` is proven and simple — throttled disk writes, file-based storage, loaded on reconnect. Reusing this pattern (not the code, but the approach) keeps behavior consistent and avoids introducing a new persistence mechanism.

**Alternatives considered**:
- **Store in database**: Rejected — scrollback can be large (10K+ lines), frequent writes would stress SQLite WAL, and it's ephemeral data that doesn't need ACID guarantees.
- **In-memory only**: Rejected — scrollback would be lost when all clients disconnect and reconnect (FR-006 requires persistence).

## Decision 4: Shell Detection

**Decision**: Read `process.env.SHELL`, fall back to `/bin/bash`.

**Rationale**: Standard Unix convention. `$SHELL` reflects the user's preferred login shell on both Linux and macOS. The fallback to `/bin/bash` is safe — it's universally available on all supported platforms.

**Alternatives considered**:
- **Read `/etc/passwd`**: Rejected — more complex, doesn't account for user overrides, and `$SHELL` is the standard approach.
- **Configurable per session**: Rejected — YAGNI (Constitution IV). Single shell per session with OS default covers all current needs.

## Decision 5: Frontend Panel Integration

**Decision**: Add `'shell'` as a new panel type in the existing panel system, defaulting to the bottom panel position.

**Rationale**: The panel system (`usePanel` hook + `SessionCard` layout) already supports multiple panel types with persistence, resize handles, and responsive layout. Adding a new type follows the established pattern exactly. The bottom position matches the clarified requirement (separate panel below Claude terminal).

**Alternatives considered**:
- **Tabs within terminal area**: Rejected by user clarification — should be a separate panel, not tabs.
- **New layout zone**: Rejected — the existing bottom panel zone is exactly what's needed.

## Decision 6: Shell Lifecycle Coupling

**Decision**: Shell process is spawned on-demand (user opens panel) and killed when session suspends, completes, or user closes the panel. No auto-restart.

**Rationale**: Simplest lifecycle that satisfies all requirements. FR-007 requires termination on suspend/complete. FR-009 requires manual restart capability. On-demand spawn avoids wasting resources for sessions that never use the shell.

**Alternatives considered**:
- **Auto-spawn on session activation**: Rejected — spec says opt-in only. Wastes PTY resources.
- **Keep shell alive across session suspend/continue**: Rejected — session suspend kills the Claude process; keeping the shell alive would be inconsistent and complicate lifecycle management.
