import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, createActiveSession, type RunningServer } from '../helpers/server.js';

describe('E2E: Session activation (real PTY spawn)', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let server: RunningServer;
  let artifact: InstalledArtifact;
  let sessionId: string;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);
  });

  afterAll(async () => {
    if (sessionId) {
      try {
        await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });
      } catch { /* ignore */ }
    }
    try {
      if (server) await server.stop();
    } finally {
      if (env) await env.cleanup();
    }
  });

  it('session reaches active status after creation', async () => {
    sessionId = await createActiveSession(server, env.dataDir, 'activation-test');
    expect(sessionId).toBeDefined();
  });

  it('WebSocket receives terminal output from active session', async () => {
    expect(sessionId).toBeDefined();

    const result = await new Promise<{ connected: boolean; messagesReceived: number }>((resolve) => {
      let messagesReceived = 0;
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      const timer = setTimeout(() => {
        ws.close();
        resolve({ connected: true, messagesReceived });
      }, 10_000);

      ws.on('open', () => {
        // Connection established — wait for messages
      });

      ws.on('message', () => {
        messagesReceived++;
        if (messagesReceived >= 1) {
          clearTimeout(timer);
          ws.close();
          resolve({ connected: true, messagesReceived });
        }
      });

      ws.on('error', () => {
        clearTimeout(timer);
        resolve({ connected: false, messagesReceived: 0 });
      });
    });

    expect(result.connected).toBe(true);
    expect(result.messagesReceived).toBeGreaterThanOrEqual(1);
  });

  it('session is removed after kill', async () => {
    expect(sessionId).toBeDefined();

    const killRes = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, {
      method: 'POST',
    });
    expect([200, 404]).toContain(killRes.status);

    // Poll until session disappears (max 15 seconds)
    const deadline = Date.now() + 15_000;
    let stillExists = true;
    while (Date.now() < deadline) {
      const listRes = await fetch(`${server.baseUrl}/api/sessions`);
      const sessions = await listRes.json() as Array<{ id: string }>;
      stillExists = sessions.some(s => s.id === sessionId);
      if (!stillExists) break;
      await new Promise(r => setTimeout(r, 500));
    }

    expect(stillExists).toBe(false);
    sessionId = '';
  });
});
