# Implementation Plan: Worker Management UX + Always-Visible Machine Badges

**Branch**: `012-session-connect-ux` | **Date**: 2026-02-21 | **Spec**: `specs/012-session-connect-ux/spec.md`

## Summary

Add a "Machines" section to the Settings panel so users can add/edit/remove remote workers through the UI (FR-024/025/027), and make the machine badge always visible on every session card even with a single local worker (FR-026). The backend already has most CRUD endpoints — the only gap is a `PUT /api/workers/:id` update endpoint.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, ssh2, better-sqlite3, Tailwind CSS 3
**Storage**: SQLite (existing `workers` table, no schema changes needed)
**Testing**: Vitest 2.1.0, supertest
**Target Platform**: Linux server + web browser

## Constitution Check

| Principle | Status |
|-----------|--------|
| I. Comprehensive Testing | PASS — tests for new endpoint + repo method |
| II. UX-First Design | PASS — this feature exists specifically because UX was missing |
| III. UI Quality & Consistency | PASS — follows existing SettingsPanel patterns |
| IV. Simplicity | PASS — reuses existing components/patterns, minimal new code |
| V. CI/CD | PASS — no merge, just feature work |
| VI. Frontend Plugin Quality | PASS — no new dependencies |
| VII. Backend Security | PASS — local worker protected, SSH key validated, no secrets in API |
| VIII. Observability | PASS — structured logging on worker CRUD operations |

## Project Structure

```text
backend/
├── src/
│   ├── models/
│   │   ├── types.ts          # Add UpdateWorkerInput interface
│   │   └── repository.ts     # Add updateWorker() method
│   ├── api/routes/
│   │   └── workers.ts        # Add PUT /:id endpoint
│   └── services/
│       └── worker-manager.ts  # (no changes — already has validateSshKeyFile, testConnection)
└── tests/
    ├── unit/repository.test.ts      # Add updateWorker tests
    └── integration/ssh-worker.test.ts # Add PUT endpoint tests

frontend/
├── src/
│   ├── components/
│   │   ├── SettingsPanel.tsx  # Major: add "Machines" section with CRUD
│   │   └── WorkerBadge.tsx    # Fix: always show badge (remove workers.length <= 1 guard)
│   ├── pages/
│   │   └── Dashboard.tsx      # Pass workers + onWorkersChange to SettingsPanel
│   └── services/
│       └── api.ts             # Add workers.update(), workers.create(), workers.delete(), workers.test()
```

## Implementation Steps

### Step 1: Backend — Add UpdateWorkerInput type
**File**: `backend/src/models/types.ts`
- Add `UpdateWorkerInput` interface with optional fields: name, sshHost, sshPort, sshUser, sshKeyPath, maxSessions
- Follows existing pattern from `UpdateSessionInput` and `UpdateProjectInput`

### Step 2: Backend — Add updateWorker() to Repository
**File**: `backend/src/models/repository.ts`
- Add `updateWorker(id, input)` method using the same dynamic-SQL pattern as `updateSession()` and `updateProject()`
- Build SET clause from non-undefined fields, execute UPDATE, return refreshed worker
- Return null for non-existent ID

### Step 3: Backend — Add PUT /api/workers/:id route
**File**: `backend/src/api/routes/workers.ts`
- Add between existing POST and DELETE handlers
- Guards: 404 if not found, 403 if local worker
- If sshKeyPath changed: validate via `workerManager.validateSshKeyFile()`
- If any SSH field changed: disconnect + reconnect worker
- Return updated worker

### Step 4: Frontend — Add worker API methods
**File**: `frontend/src/services/api.ts`
- Add `workers.create()` — POST /api/workers
- Add `workers.update()` — PUT /api/workers/:id
- Add `workers.delete()` — DELETE /api/workers/:id
- Add `workers.test()` — POST /api/workers/:id/test

### Step 5: Frontend — Fix WorkerBadge (always visible)
**File**: `frontend/src/components/WorkerBadge.tsx`
- Remove `workers.length <= 1` bail-out
- When workerId is null but only 1 worker exists, show that worker
- Badge always renders with worker name text

### Step 6: Frontend — Add "Machines" section to SettingsPanel
**File**: `frontend/src/components/SettingsPanel.tsx`
- Expand props: add `workers: Worker[]` and `onWorkersChange: (workers: Worker[]) => void`
- Widen popover from w-64 to w-80
- Add "Machines" section below existing settings:
  - Worker list: each row shows status dot + name + type badge + session count
  - Local worker: read-only, no edit/delete buttons
  - Remote workers: Edit / Test / Delete buttons on hover
  - "+ Add Machine" button
- Add Machine form: name, sshHost, sshUser, sshKeyPath (required) + sshPort, maxSessions (optional)
  - "Test Connection" button calls POST /:id/test, shows latency or error
  - "Save" creates/updates worker, calls onWorkersChange
- Edit mode: same form, pre-populated with current values
- Delete confirmation: inline warning about active sessions (FR-027)

### Step 7: Frontend — Wire SettingsPanel in Dashboard
**File**: `frontend/src/pages/Dashboard.tsx`
- Pass `workers={workersList}` and `onWorkersChange={setWorkersList}` to SettingsPanel

### Step 8: Tests
- `backend/tests/unit/repository.test.ts`: updateWorker — name change, SSH field change, empty input, non-existent ID
- `backend/tests/integration/ssh-worker.test.ts`: PUT endpoint — 404, 403 for local, 400 for bad key, 200 success

## Verification

1. `npm test` — all existing + new tests pass
2. `npm run lint` — no errors
3. Manual: Open Settings, see "Machines" section with local worker listed
4. Manual: Click "Add Machine", fill SSH details, test connection, save — new worker appears in machine selector
5. Manual: Edit a remote worker's name — updated everywhere
6. Manual: Delete a remote worker — confirmation dialog, then removed
7. Manual: Every session card shows machine name badge (even single local worker)
