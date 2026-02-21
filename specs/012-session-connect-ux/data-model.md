# Data Model: Clean Session & Connection UX

**Feature**: 012-session-connect-ux
**Date**: 2026-02-21

## New Table: `projects`

Stores bookmarked and recently-used project directories, each bound to a specific worker.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `worker_id` | TEXT | NOT NULL, REFERENCES workers(id) ON DELETE CASCADE | The machine this project's path belongs to |
| `directory_path` | TEXT | NOT NULL | Full absolute path on the target machine |
| `display_name` | TEXT | NOT NULL | User-facing name (default: folder name, can be custom alias) |
| `bookmarked` | INTEGER | NOT NULL, DEFAULT 0 | 1 = pinned favorite, 0 = recent-only |
| `position` | INTEGER | DEFAULT NULL | Sort order for bookmarked projects (NULL for recent) |
| `last_used_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Last time a session was created with this project |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | When the project was first added |

**Unique constraint**: `UNIQUE(worker_id, directory_path)` — a directory can only appear once per worker.

**Indexes**:
- `CREATE INDEX idx_projects_worker ON projects(worker_id)`
- `CREATE INDEX idx_projects_last_used ON projects(last_used_at DESC)`
- `CREATE INDEX idx_projects_bookmarked ON projects(bookmarked, position)`

### SQL Migration

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  directory_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bookmarked INTEGER NOT NULL DEFAULT 0,
  position INTEGER DEFAULT NULL,
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(worker_id, directory_path)
);

CREATE INDEX IF NOT EXISTS idx_projects_worker ON projects(worker_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_used ON projects(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_bookmarked ON projects(bookmarked, position);
```

### TypeScript Type

```typescript
interface Project {
  id: string;
  workerId: string;
  directoryPath: string;
  displayName: string;
  bookmarked: boolean;
  position: number | null;
  lastUsedAt: string;
  createdAt: string;
}
```

## Modified Entity: `Session`

No schema changes. The existing `worker_id` column is already present and nullable. The change is behavioral — `worker_id` will now be reliably populated (defaulting to the local worker ID) instead of always being `null`.

## Modified Logic: `settings.max_concurrent_sessions`

Kept for backwards compatibility as a global ceiling, but per-worker `workers.max_sessions` becomes the primary capacity control. The effective max for the system is `min(settings.max_concurrent_sessions, sum(all workers.max_sessions))`.

## State Transitions

### Project Lifecycle

```
[Created via session creation] → Recent (bookmarked=0)
                                    ↓ user bookmarks
                               Bookmarked (bookmarked=1, position assigned)
                                    ↓ user unbookmarks
                               Recent (bookmarked=0, position=NULL)
                                    ↓ eviction (>10 recent, oldest by last_used_at)
                               [Deleted from DB]
```

### Session Activation with Worker Routing

```
Session queued (worker_id = target or local default)
       ↓
QueueManager.tryDispatch()
  → Check worker_id's capacity: getActiveSessionsOnWorker(worker_id) < worker.maxSessions?
  → Check global ceiling: countActiveSessions() < settings.maxConcurrentSessions?
  → If both pass → activate
       ↓
SessionManager.activateSession()
  → Lookup worker by session.workerId
  → If worker.type === 'local' → PtySpawner.spawn()
  → If worker.type === 'remote' → RemotePtyBridge.spawn()
       ↓
Session active (same lifecycle as before: complete/fail/suspend)
```

## Repository Methods (New/Modified)

### New: Project Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `createProject` | `(input: { workerId, directoryPath, displayName, bookmarked? }): Project` | Insert or update (upsert on worker_id+directory_path) |
| `getProject` | `(id: string): Project \| null` | Fetch by ID |
| `listProjects` | `(workerId?: string): Project[]` | List bookmarked (by position) then recent (by last_used_at DESC), limit 10 recent |
| `updateProject` | `(id: string, input: { displayName?, bookmarked?, position? }): Project \| null` | Update alias, bookmark status, or sort order |
| `deleteProject` | `(id: string): boolean` | Remove a project entry |
| `touchProject` | `(workerId: string, directoryPath: string): Project` | Update last_used_at; create if not exists (auto-track recent) |
| `evictOldRecent` | `(maxRecent?: number): void` | Delete non-bookmarked projects beyond the limit (default 10) |

### Modified: Queue/Session Methods

| Method | Change |
|--------|--------|
| `QueueManager.hasAvailableSlot()` | Check per-worker capacity instead of global-only |
| `QueueManager.tryDispatch()` | Find a worker with capacity for the next queued session |
| `SessionManager.activateSession()` | Route to PtySpawner or RemotePtyBridge based on worker type |
| `SessionManager.createSession()` | Default worker_id to local worker when not specified |
