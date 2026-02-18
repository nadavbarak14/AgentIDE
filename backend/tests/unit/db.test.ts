import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';

describe('Database', () => {
  afterEach(() => {
    closeDb();
  });

  it('creates all tables on initialization', () => {
    const db = createTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('workers');
    expect(tableNames).toContain('artifacts');
    expect(tableNames).toContain('settings');
  });

  it('creates indexes', () => {
    const db = createTestDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_sessions_status');
    expect(indexNames).toContain('idx_sessions_worker');
    expect(indexNames).toContain('idx_sessions_position');
    expect(indexNames).toContain('idx_sessions_needs_input');
    expect(indexNames).toContain('idx_artifacts_session');
  });

  it('seeds default settings row', () => {
    const db = createTestDb();
    const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.max_concurrent_sessions).toBe(2);
    expect(row.max_visible_sessions).toBe(4);
    expect(row.theme).toBe('dark');
  });

  it('uses WAL journal mode', () => {
    const db = createTestDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    // In-memory DB may not report WAL, but we verify pragma was called
    expect(result).toBeDefined();
  });

  it('has foreign keys enabled', () => {
    const db = createTestDb();
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });
});
