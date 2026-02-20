#!/usr/bin/env tsx
/**
 * Generate a database fixture for upgrade testing.
 *
 * Usage: npx tsx release-tests/fixtures/generate-fixture.ts --output release-tests/fixtures/v0.1.0.db
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
if (outputIdx === -1 || !args[outputIdx + 1]) {
  console.error('Usage: generate-fixture.ts --output <path>');
  process.exit(1);
}
const outputPath = path.resolve(args[outputIdx + 1]);

// Create the schema manually (matching db.ts SCHEMA without migrations)
// This represents the "base" schema that a fresh v0.1.0 install would create
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

const db = new Database(outputPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);

// Known JWT secret for fixture verification
const KNOWN_JWT_SECRET = 'fixture-jwt-secret-for-testing-0123456789abcdef';

// Seed settings (custom values, not defaults)
db.prepare('INSERT INTO settings (id, max_concurrent_sessions, max_visible_sessions, theme) VALUES (1, 3, 6, ?)').run('light');

// Seed auth_config
db.prepare('INSERT INTO auth_config (id, jwt_secret, auth_required) VALUES (1, ?, 0)').run(KNOWN_JWT_SECRET);

// Seed workers
const localWorkerId = randomUUID();
const remoteWorkerId = randomUUID();
db.prepare('INSERT INTO workers (id, name, type, status, max_sessions) VALUES (?, ?, ?, ?, ?)').run(localWorkerId, 'local-worker', 'local', 'connected', 2);
db.prepare('INSERT INTO workers (id, name, type, ssh_host, ssh_port, ssh_user, status, max_sessions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(remoteWorkerId, 'remote-worker', 'remote', '192.168.1.100', 22, 'ubuntu', 'disconnected', 4);

// Seed sessions (3 rows: queued, active, completed)
const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
db.prepare('INSERT INTO sessions (id, worker_id, status, working_directory, title) VALUES (?, ?, ?, ?, ?)').run(sessionIds[0], localWorkerId, 'queued', '/tmp/project-a', 'Session A');
db.prepare('INSERT INTO sessions (id, worker_id, status, working_directory, title, started_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))').run(sessionIds[1], localWorkerId, 'active', '/tmp/project-b', 'Session B');
db.prepare('INSERT INTO sessions (id, worker_id, status, working_directory, title, started_at, completed_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))').run(sessionIds[2], localWorkerId, 'completed', '/tmp/project-c', 'Session C');

// Seed artifacts (1 per session)
db.prepare('INSERT INTO artifacts (id, session_id, type, path) VALUES (?, ?, ?, ?)').run(randomUUID(), sessionIds[0], 'file', '/tmp/project-a/output.txt');
db.prepare('INSERT INTO artifacts (id, session_id, type, path) VALUES (?, ?, ?, ?)').run(randomUUID(), sessionIds[1], 'diff', '/tmp/project-b/changes.diff');
db.prepare('INSERT INTO artifacts (id, session_id, type, path) VALUES (?, ?, ?, ?)').run(randomUUID(), sessionIds[2], 'image', '/tmp/project-c/screenshot.png');

// Seed panel_states (2 rows)
db.prepare('INSERT INTO panel_states (session_id, active_panel, file_tabs) VALUES (?, ?, ?)').run(sessionIds[0], 'files', '["index.ts"]');
db.prepare('INSERT INTO panel_states (session_id, active_panel, file_tabs) VALUES (?, ?, ?)').run(sessionIds[1], 'git', '["app.ts", "lib.ts"]');

// Seed comments (2 rows on different sessions)
db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), sessionIds[0], 'src/index.ts', 10, 15, 'function main() {', 'Consider error handling here');
db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), sessionIds[1], 'src/app.ts', 1, 5, 'import express', 'Update import style');

db.close();

console.log(`Fixture generated at ${outputPath}`);
console.log('Seed data:');
console.log('  settings: 1 row (max_concurrent=3, theme=light)');
console.log('  auth_config: 1 row (known JWT secret)');
console.log(`  workers: 2 rows (local + remote)`);
console.log(`  sessions: 3 rows (queued, active, completed)`);
console.log(`  artifacts: 3 rows`);
console.log(`  panel_states: 2 rows`);
console.log(`  comments: 2 rows`);
console.log(`  JWT secret: ${KNOWN_JWT_SECRET}`);

// Export the known JWT secret for tests to reference
export const FIXTURE_JWT_SECRET = KNOWN_JWT_SECRET;
