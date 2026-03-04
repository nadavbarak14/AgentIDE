# Data Model: Session Permission Flags

**Feature**: 020-session-permissions
**Date**: 2026-03-03

## Schema Changes

### sessions table — add `flags` column

```sql
ALTER TABLE sessions ADD COLUMN flags TEXT NOT NULL DEFAULT '';
```

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `flags` | TEXT | `''` | Raw CLI flags string entered by the user at session creation (e.g., `--dangerously-skip-permissions`). Empty string means no custom flags. |

**Notes**:
- The existing `worktree` column (INTEGER) remains unchanged — it is still set from the worktree predefined flag chip.
- `startFresh` is NOT stored in the database (existing behavior unchanged).
- The `flags` column stores only additional CLI flags beyond the system-managed `--worktree`, `--continue`, and `--settings` flags.

## Entity Updates

### CreateSessionInput (types.ts)

```typescript
export interface CreateSessionInput {
  workingDirectory: string;
  title: string;
  targetWorker?: string | null;
  worktree?: boolean;       // existing — now set from predefined flag chip
  startFresh?: boolean;     // existing — now set from predefined flag chip
  flags?: string;           // NEW — raw CLI flags string
}
```

### Session (types.ts)

Add `flags` field:

```typescript
export interface Session {
  // ... existing fields ...
  flags: string;            // NEW — stored flags string
}
```

### Frontend API types (api.ts)

Update the `sessions.create()` payload type to include `flags`:

```typescript
create: (data: {
  workingDirectory: string;
  title: string;
  targetWorker?: string | null;
  worktree?: boolean;
  startFresh?: boolean;
  flags?: string;            // NEW
}) => request<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
```

## Frontend-Only Entities (no DB storage)

### PredefinedFlag

```typescript
interface PredefinedFlag {
  id: string;                // unique identifier
  label: string;             // display text (e.g., "Skip Permissions")
  flag: string;              // CLI flag value (e.g., "--dangerously-skip-permissions"), empty for pseudo-flags
  description: string;       // tooltip/help text
  warningLevel: 'normal' | 'caution';  // determines warning display
  isPseudo: boolean;         // true for worktree/startFresh (maps to booleans, not raw flags)
}
```

**MVP Predefined Flags**:

| id | label | flag | warningLevel | isPseudo |
|----|-------|------|-------------|----------|
| `skip-permissions` | Skip Permissions | `--dangerously-skip-permissions` | caution | false |
| `worktree` | Worktree | `--worktree` | normal | true |
| `clean-start` | Clean Start | — | normal | true |

## State Transitions

No new state transitions. The `flags` field is immutable after session creation — it records what the session was started with.

## Relationships

```
Session 1──1 flags (TEXT column)
PredefinedFlag (static frontend array, no DB)
```
