# Data Model: Session Terminal

**Feature**: 011-session-terminal
**Date**: 2026-02-20

## Schema Changes

**None.** No database schema changes required.

The shell terminal is entirely ephemeral — its state is managed in-memory (active PTY processes) and on disk (scrollback files). This is consistent with how the Claude terminal PTY is managed today.

## Entities

### ShellProcess (in-memory)

Managed by `ShellSpawner` in a `Map<string, ShellProcess>`.

| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | Session this shell belongs to |
| pid | number | OS process ID of the shell |
| shell | string | Shell binary path (e.g., `/bin/bash`, `/bin/zsh`) |
| cwd | string | Working directory the shell was started in |
| cols | number | Current terminal width |
| rows | number | Current terminal height |
| write | function | Send input to PTY |
| resize | function | Resize PTY dimensions |
| kill | function | Terminate shell process |

### Shell Scrollback (disk)

| Aspect | Detail |
|--------|--------|
| Location | `scrollback/shell-{sessionId}.scrollback` |
| Format | Raw terminal output (binary-safe string) |
| Write frequency | Throttled, every 5 seconds |
| Max size | Unbounded (same as Claude scrollback) |
| Cleanup | Deleted when session is deleted |

## State Transitions

```text
Shell Terminal States:

  [none] ──(user opens panel)──→ [spawning] ──(PTY ready)──→ [running]
                                                                  │
                                     ┌────────────────────────────┤
                                     │                            │
                              (shell exits/crashes)    (session suspend/complete)
                                     │                            │
                                     ▼                            ▼
                                 [stopped]                    [killed]
                                     │                            │
                              (user reopens)              (user continues session
                                     │                    + reopens panel)
                                     ▼                            ▼
                                [spawning]                   [spawning]
```

States:
- **none**: No shell has been opened for this session
- **spawning**: PTY creation in progress (sub-second)
- **running**: Shell is active and accepting input
- **stopped**: Shell exited on its own (exit command, crash)
- **killed**: Shell terminated due to session lifecycle event

## Panel State Extension

The existing `panel_states` table stores panel configuration as JSON. The `bottomPanel` field (already exists) will accept `'shell'` as a new value alongside existing values (`'none'`, `'files'`, `'git'`, `'preview'`, `'issues'`).

No migration needed — the field is a free-form string stored in a JSON blob.

## WebSocket Message Types (new)

### Server → Client

| Message | Fields | When |
|---------|--------|------|
| `shell_status` | `{ type, sessionId, status: 'running'\|'stopped'\|'killed', pid?, exitCode? }` | Shell state changes |
| Binary frame | Raw PTY output | Shell produces output |

### Client → Server

| Message | Fields | When |
|---------|--------|------|
| Binary frame | Raw keyboard input | User types in shell terminal |
| `{ type: 'resize', cols, rows }` | Terminal dimensions | Shell panel resized |
