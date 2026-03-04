# Quickstart: Session Permission Flags

**Feature**: 020-session-permissions
**Date**: 2026-03-03

## What This Feature Does

Adds a CLI flags input field to the session creation UI, allowing users to pass custom flags (like `--dangerously-skip-permissions`) to the Claude process when starting a session. Existing worktree and clean-start checkboxes are consolidated into predefined flag chips alongside the new permissions flag.

## Files to Modify

### Backend

1. **`backend/src/models/db.ts`** — Add migration: `ALTER TABLE sessions ADD COLUMN flags TEXT NOT NULL DEFAULT ''`
2. **`backend/src/models/types.ts`** — Add `flags` field to `CreateSessionInput` and `Session` interfaces
3. **`backend/src/models/repository.ts`** — Include `flags` in INSERT and SELECT queries for sessions
4. **`backend/src/api/routes/sessions.ts`** — Extract `flags` from request body, pass to session manager
5. **`backend/src/services/session-manager.ts`** — Parse flags string, merge into args array passed to pty spawner
6. **`backend/src/worker/pty-spawner.ts`** — No changes needed (already accepts arbitrary args)

### Frontend

7. **`frontend/src/components/SessionQueue.tsx`** — Replace worktree/startFresh checkboxes with unified flags UI (text input + predefined chips)
8. **`frontend/src/services/api.ts`** — Add `flags` to create session payload and Session type
9. **`frontend/src/hooks/useSessionQueue.ts`** — Pass `flags` through to API

### Tests

10. **Backend unit tests** — Flag parsing, deduplication, merging with system args
11. **Backend integration tests** — Session creation with flags, flags stored and returned in API
12. **Frontend component tests** — Flag chips toggle, text input, warning display

## Implementation Order

1. Backend: DB migration + types (files 1-2)
2. Backend: Repository + API route (files 3-4)
3. Backend: Session manager flag parsing (file 5)
4. Backend tests (file 10-11)
5. Frontend: API client update (file 8-9)
6. Frontend: SessionQueue UI (file 7)
7. Frontend tests (file 12)

## Key Design Decisions

- **Pseudo-flags**: Worktree and Clean Start are "pseudo-flags" in the UI — they map to existing `worktree` and `startFresh` booleans, NOT to raw CLI flag strings. This preserves backward compatibility.
- **No flag validation**: The backend does not validate flag names. Invalid flags are passed to Claude as-is.
- **Flags column**: Stores only additional user-typed flags, not the system-managed `--worktree`, `--continue`, or `--settings` flags.
- **Inline warning**: A caution message appears below the flags field when `--dangerously-skip-permissions` is active. No blocking modal.
