# Quickstart: CLI Session Flags Redesign

**Feature**: 026-cli-session-flags
**Date**: 2026-03-06

## What Changed

1. **Default behavior inverted**: Creating a session with no flags now starts a **fresh** Claude conversation (previously it used `--continue`)
2. **"Clean Start" removed**: No longer needed since fresh is the default
3. **"Continue Latest" added**: New toggle that passes `--continue` to resume the most recent conversation
4. **"Resume" added**: New toggle that passes `--resume` to open Claude's interactive session picker in the terminal

## Files Modified

### Backend
- `backend/src/models/types.ts` — `CreateSessionInput`: remove `startFresh`, add `continueLatest`, `resume`
- `backend/src/services/session-manager.ts` — `activateLocalSession()`: invert spawn logic
- `backend/src/api/routes/sessions.ts` — POST `/api/sessions`: accept `continueLatest`, `resume` in body

### Frontend
- `frontend/src/components/SessionQueue.tsx` — Replace "Clean Start" toggle, add "Continue Latest" + "Resume" toggles
- `frontend/src/hooks/useSessionQueue.ts` — Update `createSession` params
- `frontend/src/services/api.ts` — Update `create()` payload type

### Tests
- `backend/tests/unit/session-manager.test.ts` — Update for new default + flags
- `backend/tests/integration/session-flags.test.ts` — Update for new default + flags
- `frontend/tests/components/SessionQueue.test.tsx` — Update for new toggles

## How to Test

```bash
# Run all tests
cd backend && npm test
cd frontend && npm test

# Manual testing:
# 1. Create session with no flags → should NOT see --continue in logs
# 2. Toggle "Continue Latest" → should see --continue in logs
# 3. Toggle "Resume" → should see --resume in logs, Claude picker appears in terminal
# 4. Toggle both → only Resume should take effect (mutually exclusive)
# 5. Worktree sessions → should always start fresh with --worktree regardless of toggles
```
