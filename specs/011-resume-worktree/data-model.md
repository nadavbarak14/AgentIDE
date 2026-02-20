# Data Model: Session Resume & Worktree Isolation

**Feature**: 011-resume-worktree
**Date**: 2026-02-20

## Entity Changes

### Session (modified)

| Field | Type | Default | Change | Notes |
|-------|------|---------|--------|-------|
| id | TEXT PK | uuid | — | No change |
| claude_session_id | TEXT | NULL | **Used** | Already exists. Now used for `--resume <id>` instead of just logging |
| worktree | INTEGER | 0 | **New** | Boolean: 1 = spawn with `--worktree` flag |
| status | TEXT | 'queued' | — | No change |
| working_directory | TEXT | — | — | No change |
| title | TEXT | '' | — | No change |
| ... | ... | ... | — | All other fields unchanged |

### Migration

```sql
ALTER TABLE sessions ADD COLUMN worktree INTEGER NOT NULL DEFAULT 0;
```

- Added in `db.ts:migrate()` function
- Safe for existing databases: default 0 means all existing sessions are non-worktree

## Type Changes

### CreateSessionInput (modified)

```typescript
export interface CreateSessionInput {
  workingDirectory: string;
  title: string;
  targetWorker?: string | null;
  worktree?: boolean;  // NEW
}
```

### Session (modified)

```typescript
export interface Session {
  // ... existing fields ...
  worktree: boolean;  // NEW — maps from INTEGER column
}
```

## State Transitions

No new state transitions. The `worktree` field is immutable after creation — set once during `createSession`, read during `activateSession` to decide CLI flags.

The `claudeSessionId` field lifecycle is unchanged:
1. Set to NULL on creation
2. Populated by SessionEnd hook callback (`POST /api/hooks/event`)
3. Read during `activateSession` to decide `--resume <id>` vs `-c`
