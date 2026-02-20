import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('E2E: Settings persistence', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let artifact: InstalledArtifact;
  let server: RunningServer;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
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

  it('GET /api/settings returns defaults', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxConcurrentSessions).toBe(2);
    expect(body.theme).toBe('dark');
  });

  it('PATCH /api/settings updates values', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxConcurrentSessions: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxConcurrentSessions).toBe(5);
  });

  it('GET /api/settings reflects updated values', async () => {
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxConcurrentSessions).toBe(5);
  });

  it('settings survive server restart', async () => {
    // Stop the current server
    await server.stop();

    // Start a new server in the same environment (same dataDir / c3.db)
    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);

    // Verify settings persisted
    const res = await fetch(`${server.baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.maxConcurrentSessions).toBe(5);
  });
});
