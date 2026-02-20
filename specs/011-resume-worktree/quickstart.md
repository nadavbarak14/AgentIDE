# Quickstart: Session Resume & Worktree Isolation

**Feature**: 011-resume-worktree
**Date**: 2026-02-20

## Integration Scenarios

### Scenario 1: Resume specific conversation

1. User creates a session in `/home/user/project` → session A
2. Claude works, session completes. SessionEnd hook stores `claudeSessionId = "abc123"`
3. User creates another session in `/home/user/project` → session B
4. Session B completes with `claudeSessionId = "def456"`
5. User clicks "Restart" on session A
6. System spawns: `claude --settings <hooks> --resume abc123` (in `/home/user/project`)
7. Claude resumes conversation `abc123` — NOT `def456`

### Scenario 2: Fallback to --continue

1. User has a legacy session with `claudeSessionId = null`
2. User clicks "Restart"
3. System spawns: `claude --settings <hooks> -c` (fallback behavior)

### Scenario 3: Worktree session

1. User fills session creation form, toggles "Use worktree" checkbox
2. POST /api/sessions with `{ worktree: true, ... }`
3. Session created with `worktree = 1` in DB
4. When session activates: `claude --settings <hooks> --worktree`
5. Claude Code creates a git worktree and works in isolation

### Scenario 4: Continue a worktree session

1. Worktree session completes with `claudeSessionId = "xyz789"`
2. User clicks "Restart"
3. System spawns: `claude --settings <hooks> --resume xyz789` (NO --worktree flag)
4. The original worktree may or may not still exist — resume targets the conversation, not the worktree

### Scenario 5: Auto-suspend and re-queue with resume

1. Session A is active, has received user input, goes idle
2. Queue has waiting sessions → session A auto-suspended
3. SessionEnd hook fires, stores `claudeSessionId`
4. Session A re-queued with `continuationCount++`
5. When dispatched again: spawns with `--resume <claudeSessionId>`

## File Change Summary

| File | Change |
|------|--------|
| `backend/src/models/types.ts` | Add `worktree` to Session and CreateSessionInput |
| `backend/src/models/db.ts` | Migration: add `worktree` column |
| `backend/src/models/repository.ts` | Read/write `worktree` field |
| `backend/src/services/session-manager.ts` | Use `--resume <id>` instead of `-c`; pass `--worktree` on new sessions |
| `backend/src/worker/pty-spawner.ts` | Add `spawnResume()` method |
| `backend/src/api/routes/sessions.ts` | Accept `worktree` in POST body |
| `frontend/src/services/api.ts` | Add `worktree` to Session interface and create params |
| `frontend/src/components/SessionQueue.tsx` | Add worktree checkbox |
