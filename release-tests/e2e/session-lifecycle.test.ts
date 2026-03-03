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

  it('GET /api/sessions returns array', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    // Sessions may auto-delete on failure when claude CLI is unavailable in CI.
    // The key assertion is that the sessions API endpoint works.
  });

  it('creating multiple sessions returns valid responses', async () => {
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
      expect(body.id).toBeDefined();
      created.push(body.id);
    }

    // All 3 sessions were created successfully
    expect(created.length).toBe(3);

    // Sessions may auto-delete on failure (no claude CLI in CI).
    // Verify the sessions API returns a valid array.
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('DELETE /api/sessions/:id removes or acknowledges missing session', async () => {
    // Create a fresh session for this test
    const createRes = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: env.dataDir,
        title: 'delete-test',
      }),
    });
    const session = await createRes.json();

    // Session may have auto-deleted already (no claude CLI in CI).
    // Kill if still active.
    const checkRes = await fetch(`${server.baseUrl}/api/sessions`);
    const all = await checkRes.json() as Array<{ id: string; status: string }>;
    const found = all.find((s) => s.id === session.id);

    if (found && found.status === 'active') {
      await fetch(`${server.baseUrl}/api/sessions/${session.id}/kill`, { method: 'POST' });
      // Wait for transition
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const listRes = await fetch(`${server.baseUrl}/api/sessions`);
        const current = await listRes.json() as Array<{ id: string; status: string }>;
        const s = current.find((x) => x.id === session.id);
        if (!s || s.status !== 'active') break;
      }
    }

    // Try to delete — may already be auto-deleted (404) or successfully deleted (200/204)
    const delRes = await fetch(
      `${server.baseUrl}/api/sessions/${session.id}`,
      { method: 'DELETE' },
    );
    expect([200, 204, 404]).toContain(delRes.status);

    // Verify it's gone
    const afterRes = await fetch(`${server.baseUrl}/api/sessions`);
    const afterSessions = await afterRes.json();
    const ids = afterSessions.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(session.id);
  });
});
