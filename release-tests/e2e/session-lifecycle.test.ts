import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('E2E: Session lifecycle', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let server: RunningServer;
  let artifact: InstalledArtifact;

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

  it('POST /api/sessions creates a session', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: env.dataDir,
        title: 'lifecycle-test-1',
      }),
    });
    expect([200, 201, 202]).toContain(res.status);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBeDefined();
    expect(body.workingDirectory).toBe(env.dataDir);
  });

  it('GET /api/sessions returns created sessions', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('creating multiple sessions tracks them all', async () => {
    // Create additional sessions beyond default max_concurrent_sessions (2)
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${server.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workingDirectory: env.dataDir,
          title: `overflow-session-${i}`,
        }),
      });
      const body = await res.json();
      created.push(body.id);
    }

    const res = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await res.json();

    // All created sessions should appear in the list (regardless of status,
    // since sessions may transition from queued→failed quickly in CI
    // when claude CLI is not available)
    const ids = sessions.map((s: { id: string }) => s.id);
    for (const id of created) {
      expect(ids).toContain(id);
    }
    // Total should be at least 4 (1 from first test + 3 here)
    expect(sessions.length).toBeGreaterThanOrEqual(4);
  });

  it('DELETE /api/sessions/:id removes a session', async () => {
    // Get sessions and delete the last one
    const listRes = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await listRes.json();
    const lastSession = sessions[sessions.length - 1];

    const delRes = await fetch(
      `${server.baseUrl}/api/sessions/${lastSession.id}`,
      { method: 'DELETE' },
    );
    expect([200, 204]).toContain(delRes.status);

    // Verify it's gone
    const afterRes = await fetch(`${server.baseUrl}/api/sessions`);
    const afterSessions = await afterRes.json();
    const ids = afterSessions.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(lastSession.id);
  });
});
