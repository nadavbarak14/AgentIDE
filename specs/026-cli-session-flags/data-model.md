# Data Model: CLI Session Flags Redesign

**Feature**: 026-cli-session-flags
**Date**: 2026-03-06

## Entity Changes

### CreateSessionInput (modified)

The `CreateSessionInput` interface in `backend/src/models/types.ts` is updated to replace the `startFresh` field.

| Field | Type | Required | Change | Description |
|-------|------|----------|--------|-------------|
| workingDirectory | string | Yes | - | Absolute path for the Claude session |
| title | string | Yes | - | Display name for the session |
| targetWorker | string \| null | No | - | Worker ID (defaults to local) |
| worktree | boolean | No | - | Use isolated git worktree |
| ~~startFresh~~ | ~~boolean~~ | ~~No~~ | REMOVE | ~~Skip --continue~~ |
| continueLatest | boolean | No | ADD | Pass `--continue` to Claude |
| resume | boolean | No | ADD | Pass `--resume` to Claude (interactive picker) |
| flags | string | No | - | Additional CLI flags |

### Validation Rules

- `continueLatest` and `resume` are mutually exclusive — if both are `true`, `resume` takes precedence
- `worktree` is independent of `continueLatest`/`resume` — worktree sessions always start fresh (existing behavior unchanged)
- When `worktree=true`, `continueLatest` and `resume` are ignored (worktree always spawns fresh with `--worktree`)

### State Transitions (spawn logic)

```
CreateSession received
  │
  ├─ worktree=true ──────► spawn with ['--worktree', ...userFlags]
  │
  ├─ resume=true ────────► spawn with ['--resume', ...userFlags]
  │
  ├─ continueLatest=true ► spawn with ['--continue', ...userFlags]
  │                         └─ track in continueSessions Map for retry
  │
  └─ (default) ─────────► spawn with [...userFlags]  (fresh session)
```

## No Schema Changes

No SQLite schema changes required. The `sessions` table stores `flags` as a text field — `continueLatest` and `resume` are handled at spawn time and not persisted.
