# Quickstart: Remove Completed Sessions

## Overview

Auto-delete sessions when they complete or fail. No new endpoints, no new UI elements, no new dependencies. Changes span ~6 existing files.

## Backend Changes (3 files)

### 1. `backend/src/services/session-manager.ts`
After `completeSession()` emits `session_completed` event, call `repo.deleteSession(id)` + `shellSpawner.deleteScrollback(id)` to auto-delete. Same for `failSession()`.

### 2. `backend/src/models/repository.ts`
Add `deleteNonActiveSessions()` method: `DELETE FROM sessions WHERE status != 'active'` + manual panel_states cleanup. Returns count of deleted sessions.

### 3. `backend/src/hub-entry.ts`
Call `repo.deleteNonActiveSessions()` during server startup to clean up stale sessions from before this feature.

## Frontend Changes (3 files)

### 4. `frontend/src/hooks/useSessionQueue.ts`
When receiving a `session_status` WebSocket message with status `completed` or `failed`, remove the session from local state (filter it out) instead of updating its status.

### 5. `frontend/src/components/SessionCard.tsx`
Remove the "Continue" button that shows for completed sessions (dead code since completed sessions no longer exist).

### 6. `frontend/src/components/SessionQueue.tsx`
Remove the "Completed" section from the sidebar (dead code since completed sessions no longer exist).

## Testing

- Integration test: session auto-deleted after completion
- Integration test: session auto-deleted after failure
- Integration test: startup cleanup removes stale sessions
- Integration test: active sessions are NOT deleted
- Verify existing tests still pass (some may need updates since they expect completed sessions to persist)

## Dev Workflow

```bash
npm test          # Run all tests
npm run lint      # Type check + lint
npm run dev       # Start dev server to manually verify
```
