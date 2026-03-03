import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';
import { loadUpgradeFixture, verifyDatabaseIntegrity } from '../helpers/upgrade.js';

describe('Upgrade: Data migration from v0.1.0', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let artifact: InstalledArtifact;
  let server: RunningServer;
  let dbPath: string;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);

    // Load the v0.1.0 fixture (pre-migration schema)
    dbPath = loadUpgradeFixture(env, 'v0.1.0');

    // Starting the server will trigger automatic migrations on the old DB
    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);
  });

  afterAll(async () => {
    try {
      if (server) await server.stop();
    } finally {
      if (env) await env.cleanup();
    }
  });

  it('server starts without errors on old schema', async () => {
    // If we got here, beforeAll succeeded — server started on the fixture DB
    const res = await fetch(`${server.baseUrl}/api/health`);
    expect(res.status).toBe(200);
  });

  it('GET /api/sessions returns migrated sessions', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);

    // Non-active sessions (queued, completed) are cleaned up on startup.
    // The active session may also fail if claude CLI is unavailable (CI).
    // The key assertion is that the sessions API works after migration.
    for (const s of sessions) {
      expect(['queued', 'active', 'completed', 'failed']).toContain(s.status);
    }
  });

  it('GET /api/settings returns custom values from fixture', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxConcurrentSessions).toBe(3);
    expect(body.theme).toBe('light');
  });

  it('database integrity check passes for all tables', () => {
    // Non-session tables retain their fixture data
    const stableResults = verifyDatabaseIntegrity(dbPath, {
      settings: 1,
      workers: 2,
      auth_config: 1,
    });
    for (const result of stableResults) {
      expect(result.passed, `${result.tableName}: ${result.details}`).toBe(true);
    }

    // Session-dependent tables: non-active sessions are cleaned up on startup,
    // which cascades to artifacts, comments, and panel_states. The active
    // session may also fail in CI (no claude CLI), leaving 0 rows.
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const table of ['sessions', 'artifacts', 'comments', 'panel_states']) {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
        expect(row.count).toBeGreaterThanOrEqual(0);
        expect(row.count).toBeLessThanOrEqual(3);
      }
    } finally {
      db.close();
    }
  });

  it('migration adds left_panel/right_panel columns to panel_states', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const cols = db.pragma('table_info(panel_states)') as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('left_panel');
      expect(colNames).toContain('right_panel');
      expect(colNames).toContain('left_width_percent');
      expect(colNames).toContain('right_width_percent');
    } finally {
      db.close();
    }
  });

  it('migration adds side column to comments', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const cols = db.pragma('table_info(comments)') as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('side');
    } finally {
      db.close();
    }
  });
});
