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
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued', 'active', 'completed', 'failed')),
  working_directory TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER,
  pid INTEGER,
  needs_input INTEGER NOT NULL DEFAULT 0,
  lock INTEGER NOT NULL DEFAULT 0,
  continuation_count INTEGER NOT NULL DEFAULT 0,
  terminal_scrollback TEXT,
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
    CHECK(theme IN ('dark', 'light'))
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
  file_tabs TEXT NOT NULL DEFAULT '[]',
  active_tab_index INTEGER NOT NULL DEFAULT 0,
  tab_scroll_positions TEXT NOT NULL DEFAULT '{}',
  git_scroll_position INTEGER NOT NULL DEFAULT 0,
  preview_url TEXT NOT NULL DEFAULT '',
  panel_width_percent INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
}

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || path.join(process.cwd(), 'c3.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
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
