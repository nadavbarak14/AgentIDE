import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, createActiveSession, type RunningServer } from '../helpers/server.js';

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

  it('POST /api/sessions creates a session that reaches active', async () => {
    const sessionId = await createActiveSession(server, env.dataDir, 'lifecycle-test-1');
    expect(sessionId).toBeDefined();

    // Verify it appears in the session list as active
    const listRes = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await listRes.json() as Array<{ id: string; status: string }>;
    const session = sessions.find(s => s.id === sessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('active');

    // Cleanup
    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });
  });

  it('GET /api/sessions returns active sessions', async () => {
    const sessionId = await createActiveSession(server, env.dataDir, 'lifecycle-list');

    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const sessions = await res.json() as Array<{ id: string; status: string }>;
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.some(s => s.id === sessionId && s.status === 'active')).toBe(true);

    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });
  });

  it('creating multiple sessions returns valid active sessions', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const id = await createActiveSession(server, env.dataDir, `multi-session-${i}`);
      ids.push(id);
    }

    const res = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await res.json() as Array<{ id: string; status: string }>;
    for (const id of ids) {
      expect(sessions.some(s => s.id === id && s.status === 'active')).toBe(true);
    }

    // Cleanup
    for (const id of ids) {
      await fetch(`${server.baseUrl}/api/sessions/${id}/kill`, { method: 'POST' });
    }
  });

  it('DELETE /api/sessions/:id removes active session', async () => {
    const sessionId = await createActiveSession(server, env.dataDir, 'delete-test');

    // Kill it first
    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });

    // Wait for it to leave active state
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const listRes = await fetch(`${server.baseUrl}/api/sessions`);
      const sessions = await listRes.json() as Array<{ id: string; status: string }>;
      const s = sessions.find(x => x.id === sessionId);
      if (!s || s.status !== 'active') break;
      await new Promise(r => setTimeout(r, 500));
    }

    // Delete
    const delRes = await fetch(`${server.baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE' });
    expect([200, 204, 404]).toContain(delRes.status);

    // Verify gone
    const afterRes = await fetch(`${server.baseUrl}/api/sessions`);
    const afterSessions = await afterRes.json() as Array<{ id: string }>;
    expect(afterSessions.map(s => s.id)).not.toContain(sessionId);
  });
});
