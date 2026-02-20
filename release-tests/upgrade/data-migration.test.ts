import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
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
    const res = await fetch(`${server.baseUrl}/api/auth/status`);
    expect([200, 401]).toContain(res.status);
  });

  it('GET /api/sessions returns all 3 fixture sessions', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(3);

    // The server may process queued/active sessions on startup
    // (they'll fail/complete because fixture working dirs don't exist).
    // The key assertion is that all 3 rows survived the migration.
    const statuses = sessions.map((s: { status: string }) => s.status);
    for (const status of statuses) {
      expect(['queued', 'active', 'completed', 'failed']).toContain(status);
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
    const results = verifyDatabaseIntegrity(dbPath, {
      settings: 1,
      sessions: 3,
      workers: 2,
      comments: 2,
      panel_states: 2,
      auth_config: 1,
      artifacts: 3,
    });

    for (const result of results) {
      expect(result.passed, `${result.tableName}: ${result.details}`).toBe(true);
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
