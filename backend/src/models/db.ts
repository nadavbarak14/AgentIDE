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

CREATE TABLE IF NOT EXISTS auth_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  jwt_secret TEXT NOT NULL,
  license_key_hash TEXT,
  license_email TEXT,
  license_plan TEXT,
  license_max_sessions INTEGER,
  license_expires_at TEXT,
  license_issued_at TEXT,
  auth_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SEED = `
INSERT OR IGNORE INTO settings (id) VALUES (1);
INSERT OR IGNORE INTO auth_config (id, jwt_secret, auth_required)
  VALUES (1, hex(randomblob(32)), 0);
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
