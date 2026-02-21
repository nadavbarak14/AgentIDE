# Tasks: Clean Session & Connection UX

**Input**: Design documents from `/specs/012-session-connect-ux/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration, shared types, and security utilities needed by all stories

- [x] T001 Add `projects` table migration to `backend/src/models/db.ts` — CREATE TABLE with columns (id, worker_id, directory_path, display_name, bookmarked, position, last_used_at, created_at), UNIQUE(worker_id, directory_path) constraint, and three indexes (idx_projects_worker, idx_projects_last_used, idx_projects_bookmarked) per data-model.md
- [x] T002 Add `Project` TypeScript interface and related input types (`CreateProjectInput`, `UpdateProjectInput`) to `backend/src/models/types.ts` — fields: id, workerId, directoryPath, displayName, bookmarked, position, lastUsedAt, createdAt
- [x] T003 [P] Create `isWithinHomeDir(dirPath: string): boolean` helper function in `backend/src/api/routes/directories.ts` (or a shared utils file) — resolves path via `fs.realpathSync()` (fallback to `path.resolve()` if path doesn't exist), checks `resolvedPath.startsWith(resolvedHome)`. This is the server-side $HOME restriction per research R-004.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend services and repository methods that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add project CRUD repository methods to `backend/src/models/repository.ts` — implement `createProject()` (upsert on worker_id+directory_path), `getProject()`, `listProjects(workerId?)` (bookmarked by position then recent by last_used_at DESC, limit 10 recent), `updateProject()`, `deleteProject()`, `touchProject(workerId, directoryPath)` (update last_used_at or create if not exists), `evictOldRecent(maxRecent=10)` per data-model.md
- [x] T005 [P] Create `backend/src/services/project-service.ts` — ProjectService class wrapping repository methods with validation logic: validate workerId references existing worker, validate directoryPath within $HOME (using isWithinHomeDir), auto-derive displayName from path.basename() when not provided, call evictOldRecent after touchProject
- [x] T006 [P] Modify `QueueManager.hasAvailableSlot()` in `backend/src/services/queue-manager.ts` — replace global-only check with per-worker capacity: iterate all workers, check if ANY has `getActiveSessionsOnWorker(id) < worker.maxSessions`, also keep `settings.maxConcurrentSessions` as global ceiling. Modify `tryDispatch()` to find a worker with capacity for the queued session's `targetWorker` (or any worker if null)
- [x] T007 [P] Create project API routes in `backend/src/api/routes/projects.ts` — implement GET /api/projects (list, optional ?workerId filter, enrich with workerName/workerType/workerStatus), POST /api/projects (create/bookmark), PATCH /api/projects/:id (update alias/bookmark/position), DELETE /api/projects/:id. Register routes in Express app. All endpoints validate $HOME restriction.
- [x] T008 Add project API client methods to `frontend/src/services/api.ts` — add `Project` interface, add `projects.list(workerId?)`, `projects.create(data)`, `projects.update(id, data)`, `projects.delete(id)` methods following existing API client patterns

**Checkpoint**: Foundation ready — project persistence, per-worker queue logic, and API layer complete

---

## Phase 3: User Story 1 — Quick Session Creation from Projects (Priority: P1) 🎯 MVP

**Goal**: Replace raw directory path input with a project picker showing recent and bookmarked projects by friendly name. Restrict directory browsing to $HOME. Auto-track recently used projects.

**Independent Test**: Open dashboard, see project list with friendly names, select a project, create a session — no raw paths visible.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [x] T009 [P] [US1] Write unit tests for project repository methods in `tests/unit/project-service.test.ts` — test createProject (upsert behavior), listProjects (bookmarked-first ordering, 10-recent limit), touchProject (creates or updates last_used_at), evictOldRecent (deletes oldest non-bookmarked beyond limit), deleteProject. Use real SQLite database.
- [x] T010 [P] [US1] Write unit tests for $HOME directory restriction in `tests/unit/directory-security.test.ts` — test isWithinHomeDir: valid paths within $HOME return true, paths outside $HOME return false, symlink traversal outside $HOME is blocked, edge cases (root path, relative paths, non-existent paths). Use real filesystem.
- [x] T011 [P] [US1] Write integration tests for project API in `tests/integration/project-api.test.ts` — test GET/POST/PATCH/DELETE /api/projects with real Express server and SQLite. Test $HOME validation returns 403 for out-of-bounds paths. Test POST /api/sessions rejects workingDirectory outside $HOME with 403. Test session creation auto-tracks project via touchProject.

### Implementation for User Story 1

- [x] T012 [US1] Enforce $HOME restriction in `backend/src/api/routes/directories.ts` — add isWithinHomeDir check at the top of GET /api/directories handler, return 403 with `{ error: "Directory not allowed: path must be within home directory" }` if path resolves outside $HOME
- [x] T013 [US1] Enforce $HOME restriction and auto-track projects in `backend/src/api/routes/sessions.ts` — add isWithinHomeDir check in POST /api/sessions before directory creation, return 403 if outside $HOME. After successful session creation, call `projectService.touchProject(workerId, workingDirectory)` to auto-track recent projects. Default targetWorker to local worker ID when null.
- [x] T014 [US1] Add git auto-init for worktree sessions in `backend/src/api/routes/sessions.ts` — after $HOME validation and before sessionManager.createSession(), if `worktree === true`: check for `.git` directory via `fs.existsSync(path.join(dir, '.git'))`, if missing run `execSync('git init', { cwd: dir })`, on failure return 422 with `{ error: "Failed to initialize git repository", details: stderr }`. Log the auto-init event.
- [x] T015 [P] [US1] Create `frontend/src/components/ProjectPicker.tsx` — React component showing two sections: "Favorites" (bookmarked, pinned at top) and "Recent" (last 10, ordered by last_used_at). Each entry shows: displayName as primary label (bold), abbreviated path as secondary label (last 2 segments, text-gray-500), worker name badge if multiple workers exist. Click selects project (sets directory + workerId). "Browse" button toggles the existing DirectoryPicker for manual path entry. Empty state for first-time users shows Browse button and text field. Follow existing Tailwind dark-theme patterns.
- [x] T016 [US1] Replace DirectoryPicker with ProjectPicker in `frontend/src/components/SessionQueue.tsx` — modify the "New Session" form: replace the DirectoryPicker input with ProjectPicker component. When a project is selected, populate directory and workerId state. Keep title input, startFresh checkbox, worktree checkbox. Pass targetWorker (from selected project or null) to onCreateSession instead of hardcoded null. After successful creation, show a toast/prompt to bookmark if directory was entered manually (not from a saved project).
- [x] T017 [US1] Add structured logging for project operations and $HOME validation in `backend/src/api/routes/sessions.ts` and `backend/src/api/routes/projects.ts` — log project create/update/delete events, $HOME rejection events (WARN level with attempted path), auto-track events, and git auto-init events per Principle VIII

**Checkpoint**: User Story 1 complete — project picker replaces raw paths, $HOME security enforced, git auto-init works, recent projects auto-tracked

---

## Phase 4: User Story 2 — Machine Visibility and Selection (Priority: P2)

**Goal**: Show which machine each session runs on (worker badge on cards), add machine picker to session creation when multiple workers exist, enforce per-worker concurrency limits.

**Independent Test**: Add a remote worker in settings, create a session — machine selector appears, session card shows worker badge.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [x] T018 [P] [US2] Write unit tests for per-worker queue dispatch in `tests/unit/queue-manager.test.ts` — test hasAvailableSlot returns true when any worker has capacity, returns false when all workers full. Test tryDispatch routes session to correct worker. Test targetWorker preference is respected. Test global ceiling (settings.maxConcurrentSessions) is still enforced. Use real SQLite database.

### Implementation for User Story 2

- [x] T019 [P] [US2] Create `frontend/src/components/WorkerSelector.tsx` — dropdown component showing available workers: each entry displays worker name, type label (local/remote), status dot (green=connected, gray=disconnected, red=error), session load ("2/4 sessions"). Disconnected workers are dimmed and unselectable. Hidden entirely when only one worker exists (FR-013). Emits selected workerId on change.
- [x] T020 [P] [US2] Create `frontend/src/components/WorkerBadge.tsx` — compact inline badge component: shows worker name in a small pill (e.g., `text-xs bg-gray-700 px-1.5 py-0.5 rounded`). "local" label is subtle/muted. Remote worker names are slightly more prominent. Accepts workerId and workers list as props, resolves name from workers list.
- [x] T021 [US2] Integrate WorkerSelector into SessionQueue in `frontend/src/components/SessionQueue.tsx` — add WorkerSelector below the ProjectPicker in the new session form. Fetch workers list via `workers.list()`. Show selector only when workers.length > 1. Selected worker ID flows into the create session call. When ProjectPicker selects a saved project with a bound workerId, auto-set the WorkerSelector to that worker.
- [x] T022 [US2] Add WorkerBadge to SessionCard header in `frontend/src/components/SessionCard.tsx` — insert WorkerBadge after the title in the header left cluster (around line 588-597). Show badge for all sessions that have workerId. Fetch workers list from parent or context. Also replace raw workingDirectory in footer with project displayName if available (abbreviated path as secondary label).
- [x] T023 [US2] Add WorkerBadge to SessionItem in `frontend/src/components/SessionQueue.tsx` — in the session list items (Active/Queued/Completed sections), add WorkerBadge next to the session title. Show only when multiple workers exist (consistent with FR-013).
- [x] T024 [US2] Modify `backend/src/services/session-manager.ts` createSession to default workerId to local worker — when targetWorker is null in createSession(), look up the local worker via `repo.getLocalWorker()` and set it as the default. This ensures all new sessions have a workerId for badge display.

**Checkpoint**: User Story 2 complete — machine badges visible on all sessions, machine picker in create form, per-worker limits enforced

---

## Phase 5: User Story 3 — Remote Session Execution (Priority: P3)

**Goal**: Actually spawn Claude processes on remote workers via SSH, stream terminal I/O bidirectionally, browse remote directories live, handle connection failures.

**Independent Test**: Configure a remote worker with SSH credentials, create a session targeted at that worker, verify Claude runs on the remote machine (run `hostname` in terminal).

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ✅

- [x] T025 [P] [US3] Write integration tests for remote session lifecycle in `tests/integration/remote-session.test.ts` — test TunnelManager.shell() opens an interactive PTY stream, test RemotePtyBridge emits data/exit events, test write/resize forwarding, test SSH disconnect detection. Mock only the SSH connection itself (genuine unavailability justification: no real remote host in CI). Test remote directory browsing endpoint returns valid entries via mocked exec.

### Implementation for User Story 3

- [x] T026 [US3] Add `shell(workerId, options)` method to `backend/src/hub/tunnel.ts` — call `client.shell({ term: 'xterm-256color', cols: options.cols, rows: options.rows })` on the stored ssh2.Client for that workerId. Return the duplex `ClientChannel` stream. Support resize via `stream.setWindow(rows, cols, height, width)`. Throw if worker not connected.
- [x] T027 [US3] Create `backend/src/worker/remote-pty-bridge.ts` — RemotePtyBridge class extending EventEmitter with same interface as PtySpawner per session: `spawn(sessionId, workingDirectory, args)` opens a shell via TunnelManager.shell(), sends the claude command (with --settings and args) as first input, emits `('data', sessionId, data)` on stream data, emits `('exit', sessionId, code)` on stream close. Implements `write(sessionId, data)`, `resize(sessionId, cols, rows)`, `kill(sessionId)`. Manages a Map<sessionId, ClientChannel> for active remote sessions. Handles SSH disconnect: emits `('connection_lost', sessionId)`, attempts reconnect.
- [x] T028 [US3] Modify `backend/src/services/session-manager.ts` activateSession to route based on worker type — lookup `session.workerId` → get worker from repo. If `worker.type === 'local'` (or null): use existing PtySpawner path (unchanged). If `worker.type === 'remote'`: use RemotePtyBridge.spawn() with same args. Handle remote git auto-init for worktree sessions via `tunnelManager.exec(workerId, 'cd "$dir" && git init')` before spawn.
- [x] T029 [US3] Add remote directory browsing endpoint in `backend/src/api/routes/workers.ts` — implement GET /api/workers/:id/directories?path=&query=. Use tunnelManager.exec() to run `ls -1pa "$path" 2>/dev/null | grep '/$' | head -20`. Parse output, filter hidden dirs (except .config), exclude node_modules/, apply query prefix filter. Return same shape as local: `{ path, entries: [{name, path}], exists }`. Restrict to remote $HOME (query via `echo $HOME` cached per worker). Cache results in-memory for 5 seconds per worker+path.
- [x] T030 [P] [US3] Add remote directory browsing API client method to `frontend/src/services/api.ts` — add `workers.directories(workerId, path?, query?)` → GET /api/workers/:id/directories
- [x] T031 [US3] Modify DirectoryPicker to support remote browsing mode in `frontend/src/components/DirectoryPicker.tsx` — accept optional `workerId` and `isRemote` props. When `isRemote && workerId` is set, call `workers.directories(workerId, path, query)` instead of `directories.list(path, query)`. Same autocomplete UX but routed through SSH. Show loading indicator during SSH round-trips. Show "connection lost" inline error if SSH fails.
- [x] T032 [US3] Bridge remote PTY streams through WebSocket in `backend/src/api/websocket.ts` — when a session's worker is remote, register data/exit listeners on RemotePtyBridge instead of PtySpawner. Forward binary frames from RemotePtyBridge to WebSocket clients and vice versa. Forward resize messages to RemotePtyBridge.resize(). Emit `{ type: 'connection_lost' }` and `{ type: 'connection_restored' }` JSON messages on SSH disconnect/reconnect.
- [x] T033 [US3] Add connection lost/restored UI handling in `frontend/src/components/SessionCard.tsx` — listen for `connection_lost` and `connection_restored` WebSocket messages. On `connection_lost`: show an amber overlay banner on the terminal area with "Connection lost — Reconnecting..." text. On `connection_restored`: dismiss the banner. Provide a manual "Reconnect" button.
- [x] T034 [US3] Add structured logging for all remote SSH operations in `backend/src/worker/remote-pty-bridge.ts` and `backend/src/api/routes/workers.ts` — log remote spawn events (INFO), SSH disconnect/reconnect (WARN), remote directory browsing requests (DEBUG), SSH exec failures (ERROR) per Principle VIII

**Checkpoint**: User Story 3 complete — remote sessions fully functional, terminal streams bidirectionally, remote directory browsing works, connection failures handled

---

## Phase 6: User Story 4 — Project Management and Cleanup (Priority: P4)

**Goal**: Let users rename, bookmark/unbookmark, reorder, and remove projects. Auto-evict old recent projects beyond limit.

**Independent Test**: Bookmark a project, rename it, verify the new name persists in the project picker on next visit.

### Implementation for User Story 4

- [x] T035 [P] [US4] Add project context menu to ProjectPicker in `frontend/src/components/ProjectPicker.tsx` — add a three-dot overflow menu (or right-click context menu) on each project entry with actions: "Rename" (inline edit), "Bookmark" / "Unbookmark" toggle, "Remove". Rename opens an inline text input pre-filled with current displayName, saves on Enter/blur via projects.update(). Bookmark/unbookmark calls projects.update() with bookmarked toggle. Remove calls projects.delete() with confirmation. Bookmarked projects show a pin/star icon.
- [x] T036 [US4] Add drag-to-reorder for bookmarked projects in `frontend/src/components/ProjectPicker.tsx` — bookmarked (Favorites) section supports drag-and-drop reordering. On drop, update position values for affected projects via projects.update(). Use simple mouseDown/mouseMove/mouseUp handlers (no external drag library). Only bookmarked projects are reorderable; recent section is always sorted by last_used_at.
- [x] T037 [US4] Handle stale projects with missing directories in `frontend/src/components/ProjectPicker.tsx` — when a project's directory no longer exists (detected via a 404 or error on session creation), show a "directory not found" warning icon on that entry. Context menu gains an "Update path" option in addition to "Remove". For remote projects whose worker is deleted/unreachable, show "worker unavailable" warning.

**Checkpoint**: User Story 4 complete — full project CRUD in the picker UI, auto-eviction keeps list clean

---

## Phase 7: User Story 5 — Connection Health Dashboard (Priority: P5)

**Goal**: Show compact worker connection health on the main dashboard (not buried in settings). Auto-hide when only local worker exists.

**Independent Test**: View dashboard with remote workers configured, disconnect one, see status update within 30 seconds.

### Implementation for User Story 5

- [x] T038 [P] [US5] Create `frontend/src/components/WorkerHealth.tsx` — compact horizontal widget showing each worker as: colored status dot (green=connected, yellow=reconnecting, red=disconnected/error), worker name, active session count (e.g., "2/4"). Hidden when only one local worker exists (FR-013). Polls workers.list() every 10 seconds (reuse existing polling if available). Clicking a worker's status opens a tooltip/popover with latency info and last heartbeat time.
- [x] T039 [US5] Integrate WorkerHealth into Dashboard top bar in `frontend/src/pages/Dashboard.tsx` — add WorkerHealth component in the top bar right cluster (between the session counter and the sidebar toggle / settings button). Only render when workers.length > 1. Ensure it fits the existing `flex items-center gap-3` layout without breaking responsiveness.

**Checkpoint**: User Story 5 complete — operational awareness without settings deep-dive

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, logging audit, and CI readiness

- [x] T040 [P] Verify test coverage across all stories — run `npm test` and ensure all new unit + integration tests pass. Check no existing tests are broken. Verify coverage hasn't decreased per Principle I.
- [x] T041 [P] Security audit: verify $HOME restriction is enforced in all three entry points — GET /api/directories, POST /api/sessions, GET /api/workers/:id/directories. Test with symlinks, relative paths, URL-encoded paths, and path traversal attempts (../../). Verify no raw filesystem paths leak to frontend in default flows (SC-002).
- [x] T042 [P] Verify structured logging covers all error paths per Principle VIII — audit all new/modified files for: SSH failures logged with context, $HOME violations logged as WARN, project CRUD logged as INFO, git auto-init logged, queue dispatch decisions logged with worker capacity info.
- [x] T043 Run `npm run lint` and fix any TypeScript or ESLint errors introduced by new/modified files
- [ ] T044 Run quickstart.md validation — follow all test scenarios in `specs/012-session-connect-ux/quickstart.md` manually: test project picker flow, per-worker limits, git auto-init, directory security, remote session (if remote worker available)
- [ ] T045 Push branch, wait for CI green, create PR via `gh pr create`, merge via `gh pr merge --rebase` after all checks pass (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion (T001-T003) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — no dependencies on other stories
- **User Story 2 (Phase 4)**: Depends on Phase 2 — benefits from US1 (project picker exists) but independently testable
- **User Story 3 (Phase 5)**: Depends on Phase 2 — benefits from US2 (worker selector exists) but independently testable
- **User Story 4 (Phase 6)**: Depends on US1 (ProjectPicker must exist to add context menu)
- **User Story 5 (Phase 7)**: Depends on Phase 2 — fully independent of other stories
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)
    ↓
    ├── Phase 3 (US1: Project Picker) ← MVP
    │       ↓
    │   Phase 6 (US4: Project Management) — needs ProjectPicker from US1
    │
    ├── Phase 4 (US2: Machine Visibility) — can start in parallel with US1
    │       ↓
    │   Phase 5 (US3: Remote Execution) — benefits from WorkerSelector from US2
    │
    └── Phase 7 (US5: Health Dashboard) — fully independent
            ↓
        Phase 8 (Polish)
```

### Within Each User Story

- Tests written first and verified to fail before implementation
- Repository/model changes before service logic
- Service logic before API routes
- Backend before frontend
- Core implementation before integration

### Parallel Opportunities

**Phase 1**: T001 → T002 sequential (types depend on migration); T003 parallel with T002
**Phase 2**: T004 sequential; T005, T006, T007 all [P] parallel (different files); T008 after T007
**Phase 3**: T009, T010, T011 all [P] parallel (test files); T012-T014 sequential (same file); T015 [P] parallel (frontend)
**Phase 4**: T018 [P] parallel; T019, T020 [P] parallel (different components); T021-T024 sequential
**Phase 5**: T025 [P] parallel; T026 → T027 → T028 sequential (dependency chain); T029, T030 [P] parallel; T031-T034 sequential
**Phase 7**: T038 [P] parallel; T039 after T038

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests in parallel:
Task: "T009 [P] [US1] Unit tests for project repo in tests/unit/project-service.test.ts"
Task: "T010 [P] [US1] Unit tests for $HOME restriction in tests/unit/directory-security.test.ts"
Task: "T011 [P] [US1] Integration tests for project API in tests/integration/project-api.test.ts"

# After tests written, launch backend changes:
Task: "T012 [US1] Enforce $HOME in directories.ts"
Task: "T013 [US1] Enforce $HOME + auto-track in sessions.ts"
Task: "T014 [US1] Git auto-init for worktree in sessions.ts"

# In parallel with backend, launch frontend:
Task: "T015 [P] [US1] Create ProjectPicker.tsx"

# Then integrate:
Task: "T016 [US1] Replace DirectoryPicker in SessionQueue.tsx"
Task: "T017 [US1] Add structured logging"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008)
3. Complete Phase 3: User Story 1 (T009-T017)
4. **STOP and VALIDATE**: Test project picker independently — create sessions via project picker, verify no raw paths, verify $HOME restriction, verify git auto-init
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Project Picker) → MVP! Clean session creation with friendly names
3. Add US2 (Machine Visibility) → Users see which machine each session runs on
4. Add US3 (Remote Execution) → Remote sessions actually work end-to-end
5. Add US4 (Project Management) → Rename, bookmark, organize projects
6. Add US5 (Health Dashboard) → Operational awareness
7. Polish → CI green, security audit, logging verified

### Suggested MVP Scope

**User Story 1 only** (Phases 1-3, tasks T001-T017). This delivers:
- Project picker replacing raw paths
- $HOME security restriction
- Git auto-init for worktree sessions
- Auto-tracking of recent projects

This is independently valuable and demoable without any remote worker functionality.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The existing `workers.max_sessions` column and `repo.getActiveSessionsOnWorker()` method are already in the codebase but unused — US2 wires them in
- The existing `WorkerClient` and `TunnelManager` provide SSH infrastructure — US3 extends them with shell() for interactive PTY
- No new npm dependencies are needed for any task
