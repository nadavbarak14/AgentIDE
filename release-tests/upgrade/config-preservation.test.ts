import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';
import { loadUpgradeFixture } from '../helpers/upgrade.js';

// Must match the value in generate-fixture.ts
const FIXTURE_JWT_SECRET = 'fixture-jwt-secret-for-testing-0123456789abcdef';

describe('Upgrade: Config preservation from v0.1.0', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let artifact: InstalledArtifact;
  let server: RunningServer;
  let dbPath: string;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
    dbPath = loadUpgradeFixture(env, 'v0.1.0');
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

  it('JWT secret from fixture is preserved', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare('SELECT jwt_secret FROM auth_config WHERE id = 1')
        .get() as { jwt_secret: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.jwt_secret).toBe(FIXTURE_JWT_SECRET);
    } finally {
      db.close();
    }
  });

  it('GET /api/settings returns fixture custom settings, not defaults', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fixture has max_concurrent_sessions=3, theme='light' (not default 2/'dark')
    expect(body.maxConcurrentSessions).toBe(3);
    expect(body.theme).toBe('light');
  });

  it('panel_states table exists with correct schema after migration', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      // Panel states rows may be cleaned up when their parent sessions are
      // auto-removed on startup (non-active sessions are deleted).
      // Verify the table exists and has the expected schema.
      const cols = db.pragma('table_info(panel_states)') as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain('session_id');
      expect(colNames).toContain('active_panel');
      expect(colNames).toContain('file_tabs');
      expect(colNames).toContain('panel_width_percent');
    } finally {
      db.close();
    }
  });

  it('auth_config auth_required flag is preserved', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare('SELECT auth_required FROM auth_config WHERE id = 1')
        .get() as { auth_required: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.auth_required).toBe(0);
    } finally {
      db.close();
    }
  });
});
