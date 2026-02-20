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

  it('panel_states rows from fixture are intact', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare('SELECT * FROM panel_states')
        .all() as Array<Record<string, unknown>>;
      expect(rows.length).toBe(2);

      // Verify original data is preserved
      const panels = rows.map(
        (r: Record<string, unknown>) => r.active_panel as string,
      );
      expect(panels.sort()).toEqual(['files', 'git']);
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
