import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('local', 'remote')),
  ssh_host TEXT,
  ssh_port INTEGER DEFAULT 22,
  ssh_user TEXT,
  ssh_key_path TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK(status IN ('connected', 'disconnected', 'error')),
  max_sessions INTEGER NOT NULL DEFAULT 2,
  last_heartbeat TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  claude_session_id TEXT,
  worker_id TEXT REFERENCES workers(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'completed', 'failed', 'crashed')),
  working_directory TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER,
  pid INTEGER,
  needs_input INTEGER NOT NULL DEFAULT 0,
  lock INTEGER NOT NULL DEFAULT 0,
  continuation_count INTEGER NOT NULL DEFAULT 0,
  terminal_scrollback TEXT,
  crash_recovered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('image', 'pdf', 'diff', 'file')),
  path TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  max_concurrent_sessions INTEGER NOT NULL DEFAULT 2,
  max_visible_sessions INTEGER NOT NULL DEFAULT 4,
  auto_approve INTEGER NOT NULL DEFAULT 0,
  grid_layout TEXT NOT NULL DEFAULT 'auto'
    CHECK(grid_layout IN ('auto', '1x1', '2x2', '3x3')),
  theme TEXT NOT NULL DEFAULT 'dark'
    CHECK(theme IN ('dark', 'light')),
  hub_status TEXT NOT NULL DEFAULT 'stopped'
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_position ON sessions(position);
CREATE INDEX IF NOT EXISTS idx_sessions_needs_input ON sessions(needs_input);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);

CREATE TABLE IF NOT EXISTS panel_states (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  active_panel TEXT NOT NULL DEFAULT 'none'
    CHECK(active_panel IN ('none', 'files', 'git', 'preview')),
  left_panel TEXT NOT NULL DEFAULT 'none'
    CHECK(left_panel IN ('none', 'files')),
  right_panel TEXT NOT NULL DEFAULT 'none'
    CHECK(right_panel IN ('none', 'git', 'preview')),
  left_width_percent INTEGER NOT NULL DEFAULT 25,
  right_width_percent INTEGER NOT NULL DEFAULT 35,
  bottom_panel TEXT NOT NULL DEFAULT 'none',
  bottom_height_percent INTEGER NOT NULL DEFAULT 40,
  terminal_position TEXT NOT NULL DEFAULT 'center'
    CHECK(terminal_position IN ('center', 'bottom')),
  terminal_visible INTEGER NOT NULL DEFAULT 1,
  file_tabs TEXT NOT NULL DEFAULT '[]',
  active_tab_index INTEGER NOT NULL DEFAULT 0,
  tab_scroll_positions TEXT NOT NULL DEFAULT '{}',
  git_scroll_position INTEGER NOT NULL DEFAULT 0,
  preview_url TEXT NOT NULL DEFAULT '',
  preview_viewport TEXT NOT NULL DEFAULT 'desktop'
    CHECK(preview_viewport IN ('desktop', 'mobile', 'custom')),
  custom_viewport_width INTEGER,
  custom_viewport_height INTEGER,
  font_size INTEGER NOT NULL DEFAULT 14,
  panel_width_percent INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS panel_layout_snapshots (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  view_mode TEXT NOT NULL DEFAULT '',
  combination_key TEXT NOT NULL,
  left_width_percent INTEGER NOT NULL DEFAULT 25,
  right_width_percent INTEGER NOT NULL DEFAULT 35,
  bottom_height_percent INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, view_mode, combination_key)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  code_snippet TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);

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

CREATE TABLE IF NOT EXISTS preview_comments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  element_selector TEXT,
  element_tag TEXT,
  element_rect_json TEXT,
  screenshot_path TEXT,
  page_url TEXT,
  pin_x REAL NOT NULL,
  pin_y REAL NOT NULL,
  viewport_width INTEGER,
  viewport_height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sent', 'stale')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_preview_comments_session_status
  ON preview_comments(session_id, status);

CREATE TABLE IF NOT EXISTS uploaded_images (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  compressed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'sent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_session
  ON uploaded_images(session_id);

CREATE TABLE IF NOT EXISTS video_recordings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  events_path TEXT,
  thumbnail_path TEXT,
  duration_ms INTEGER,
  file_size INTEGER,
  event_count INTEGER,
  page_url TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_recordings_session
  ON video_recordings(session_id);

CREATE TABLE IF NOT EXISTS auth_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  key_hash TEXT NOT NULL,
  cookie_secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  source_ip TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON auth_audit_log(created_at);
`;

const SEED = `
INSERT OR IGNORE INTO settings (id) VALUES (1);
`;

/** Run forward-only migrations for existing databases */
function migrate(database: Database.Database): void {
  // Check if panel_states has left_panel column
  const cols = database.pragma('table_info(panel_states)') as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('left_panel')) {
    database.exec(`
      ALTER TABLE panel_states ADD COLUMN left_panel TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE panel_states ADD COLUMN right_panel TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE panel_states ADD COLUMN left_width_percent INTEGER NOT NULL DEFAULT 25;
      ALTER TABLE panel_states ADD COLUMN right_width_percent INTEGER NOT NULL DEFAULT 35;
    `);
  }

  // Add side column to comments table
  const commentCols = database.pragma('table_info(comments)') as Array<{ name: string }>;
  const commentColNames = new Set(commentCols.map((c) => c.name));
  if (!commentColNames.has('side')) {
    database.exec("ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'");
  }

  // Add worktree column to sessions table
  const sessionCols = database.pragma('table_info(sessions)') as Array<{ name: string }>;
  const sessionColNames = new Set(sessionCols.map((c) => c.name));
  if (!sessionColNames.has('worktree')) {
    database.exec('ALTER TABLE sessions ADD COLUMN worktree INTEGER NOT NULL DEFAULT 0');
  }

  // Add enabled_extensions column to panel_states
  if (!colNames.has('enabled_extensions')) {
    database.exec("ALTER TABLE panel_states ADD COLUMN enabled_extensions TEXT NOT NULL DEFAULT '[]'");
  }

  // Add v6 panel state columns (bottom panel, viewport, etc.)
  if (!colNames.has('bottom_panel')) {
    database.exec(`
      ALTER TABLE panel_states ADD COLUMN bottom_panel TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE panel_states ADD COLUMN bottom_height_percent INTEGER NOT NULL DEFAULT 40;
      ALTER TABLE panel_states ADD COLUMN terminal_position TEXT NOT NULL DEFAULT 'center';
      ALTER TABLE panel_states ADD COLUMN terminal_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE panel_states ADD COLUMN preview_viewport TEXT NOT NULL DEFAULT 'desktop';
      ALTER TABLE panel_states ADD COLUMN custom_viewport_width INTEGER;
      ALTER TABLE panel_states ADD COLUMN custom_viewport_height INTEGER;
      ALTER TABLE panel_states ADD COLUMN font_size INTEGER NOT NULL DEFAULT 14;
    `);
  }

  // v7: Rebuild panel_states to remove FK constraint (allows "{uuid}:zoomed" keys for dual layout)
  // and relax CHECK constraints on left_panel/right_panel (allow 'issues', 'shell', extensions, etc.)
  const hasFk = (database.prepare(
    "SELECT sql FROM sqlite_master WHERE name='panel_states' AND type='table'"
  ).get() as { sql: string } | undefined)?.sql?.includes('REFERENCES sessions');
  if (hasFk) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS panel_states_v7 (
        session_id TEXT PRIMARY KEY,
        active_panel TEXT NOT NULL DEFAULT 'none',
        left_panel TEXT NOT NULL DEFAULT 'none',
        right_panel TEXT NOT NULL DEFAULT 'none',
        left_width_percent INTEGER NOT NULL DEFAULT 25,
        right_width_percent INTEGER NOT NULL DEFAULT 35,
        bottom_panel TEXT NOT NULL DEFAULT 'none',
        bottom_height_percent INTEGER NOT NULL DEFAULT 40,
        terminal_position TEXT NOT NULL DEFAULT 'center',
        terminal_visible INTEGER NOT NULL DEFAULT 1,
        file_tabs TEXT NOT NULL DEFAULT '[]',
        active_tab_index INTEGER NOT NULL DEFAULT 0,
        tab_scroll_positions TEXT NOT NULL DEFAULT '{}',
        git_scroll_position INTEGER NOT NULL DEFAULT 0,
        preview_url TEXT NOT NULL DEFAULT '',
        preview_viewport TEXT NOT NULL DEFAULT 'desktop',
        custom_viewport_width INTEGER,
        custom_viewport_height INTEGER,
        font_size INTEGER NOT NULL DEFAULT 14,
        panel_width_percent INTEGER NOT NULL DEFAULT 40,
        enabled_extensions TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO panel_states_v7
        SELECT session_id, active_panel, left_panel, right_panel, left_width_percent, right_width_percent,
               bottom_panel, bottom_height_percent, terminal_position, terminal_visible,
               file_tabs, active_tab_index, tab_scroll_positions, git_scroll_position,
               preview_url, preview_viewport, custom_viewport_width, custom_viewport_height,
               font_size, panel_width_percent, enabled_extensions, updated_at
        FROM panel_states;
      DROP TABLE panel_states;
      ALTER TABLE panel_states_v7 RENAME TO panel_states;
    `);
  }

  // Migrate any leftover queued sessions to failed (queue feature removed)
  database.exec("UPDATE sessions SET status = 'failed' WHERE status = 'queued'");

  // Add crash_recovered_at column and update sessions CHECK constraint to include 'crashed'
  if (!sessionColNames.has('crash_recovered_at')) {
    database.pragma('foreign_keys = OFF');
    database.exec(`
      CREATE TABLE sessions_v2 (
        id TEXT PRIMARY KEY,
        claude_session_id TEXT,
        worker_id TEXT REFERENCES workers(id),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active', 'completed', 'failed', 'crashed')),
        working_directory TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        position INTEGER,
        pid INTEGER,
        needs_input INTEGER NOT NULL DEFAULT 0,
        lock INTEGER NOT NULL DEFAULT 0,
        continuation_count INTEGER NOT NULL DEFAULT 0,
        worktree INTEGER NOT NULL DEFAULT 0,
        terminal_scrollback TEXT,
        crash_recovered_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO sessions_v2 SELECT id, claude_session_id, worker_id, status, working_directory,
        title, position, pid, needs_input, lock, continuation_count, worktree, terminal_scrollback,
        NULL, created_at, started_at, completed_at, updated_at FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_v2 RENAME TO sessions;
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_position ON sessions(position);
      CREATE INDEX IF NOT EXISTS idx_sessions_needs_input ON sessions(needs_input);
    `);
    database.pragma('foreign_keys = ON');
  }

  // Add hub_status column to settings table
  const settingsCols = database.pragma('table_info(settings)') as Array<{ name: string }>;
  const settingsColNames = new Set(settingsCols.map((c) => c.name));
  if (!settingsColNames.has('hub_status')) {
    database.exec("ALTER TABLE settings ADD COLUMN hub_status TEXT NOT NULL DEFAULT 'stopped'");
  }

  // Add remote_agent_port column to workers table
  const workerCols = database.pragma('table_info(workers)') as Array<{ name: string }>;
  const workerColNames = new Set(workerCols.map((c) => c.name));
  if (!workerColNames.has('remote_agent_port')) {
    database.exec('ALTER TABLE workers ADD COLUMN remote_agent_port INTEGER');
  }

  // Add flags column to sessions table
  if (!sessionColNames.has('flags')) {
    database.exec("ALTER TABLE sessions ADD COLUMN flags TEXT NOT NULL DEFAULT ''");
  }

  // Add wait_reason column to sessions table (034-agent-wait-hooks)
  if (!sessionColNames.has('wait_reason')) {
    database.exec('ALTER TABLE sessions ADD COLUMN wait_reason TEXT DEFAULT NULL');
  }

  // Add mobile_device_id column to panel_states
  if (!colNames.has('mobile_device_id')) {
    database.exec('ALTER TABLE panel_states ADD COLUMN mobile_device_id TEXT DEFAULT NULL');
  }

  // Add auth_config table if it doesn't exist (029-mobile-secure-access)
  const authTableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_config'"
  ).get();
  if (!authTableExists) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS auth_config (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        key_hash TEXT NOT NULL,
        cookie_secret TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // Add auth_audit_log table if it doesn't exist (035-endpoint-auth-hardening)
  const auditTableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_audit_log'"
  ).get();
  if (!auditTableExists) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        source_ip TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON auth_audit_log(created_at);
    `);
  }

  // Migrate video_recordings table for WebM format
  const videoCols = database.pragma('table_info(video_recordings)') as Array<{ name: string }>;
  const videoColNames = new Set(videoCols.map((c) => c.name));
  if (!videoColNames.has('video_path')) {
    database.exec(`
      ALTER TABLE video_recordings ADD COLUMN video_path TEXT;
      ALTER TABLE video_recordings ADD COLUMN file_size INTEGER;
      ALTER TABLE video_recordings ADD COLUMN status TEXT DEFAULT 'pending';
    `);
    // Copy existing events_path values to video_path for backwards compatibility
    database.exec(`UPDATE video_recordings SET video_path = events_path WHERE video_path IS NULL`);
  }

  // Add parent_id and github_repo columns to projects (046-project-first-ui)
  const projectCols = database.pragma('table_info(projects)') as Array<{ name: string }>;
  const projectColNames = new Set(projectCols.map((c) => c.name));
  if (!projectColNames.has('parent_id')) {
    database.exec('ALTER TABLE projects ADD COLUMN parent_id TEXT DEFAULT NULL REFERENCES projects(id) ON DELETE SET NULL');
  }
  if (!projectColNames.has('github_repo')) {
    database.exec('ALTER TABLE projects ADD COLUMN github_repo TEXT DEFAULT NULL');
  }

  // Add panel_layout_snapshots table (035-save-panel-position)
  const layoutSnapshotTableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='panel_layout_snapshots'"
  ).get();
  if (!layoutSnapshotTableExists) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS panel_layout_snapshots (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        view_mode TEXT NOT NULL DEFAULT '',
        combination_key TEXT NOT NULL,
        left_width_percent INTEGER NOT NULL DEFAULT 25,
        right_width_percent INTEGER NOT NULL DEFAULT 35,
        bottom_height_percent INTEGER NOT NULL DEFAULT 40,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, view_mode, combination_key)
      );
    `);
  }
}

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || path.join(process.cwd(), 'c3.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  // WSL2: WAL mode works on ext4, path.join is platform-aware
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  db.exec(SEED);
  migrate(db);
  return db;
}

export function initDb(dbPath?: string): Database.Database {
  return getDb(dbPath);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function createTestDb(): Database.Database {
  // In-memory database for tests
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(SCHEMA);
  testDb.exec(SEED);
  migrate(testDb);
  // Override the module-level db so getDb() returns this in tests
  db = testDb;
  return testDb;
}
