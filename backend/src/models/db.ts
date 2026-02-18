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
`;

const SEED = `
INSERT OR IGNORE INTO settings (id) VALUES (1);
`;

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
  // Override the module-level db so getDb() returns this in tests
  db = testDb;
  return testDb;
}
