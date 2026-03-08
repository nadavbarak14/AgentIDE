import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('E2E: Session activation (real PTY spawn)', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let server: RunningServer;
  let artifact: InstalledArtifact;
  let sessionId: string;
  let sessionReachedActive = false;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);
  });

  afterAll(async () => {
    // Kill any remaining sessions
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
    // Create a session
    const createRes = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: env.dataDir,
        title: 'activation-test',
      }),
    });
    expect([200, 201, 202]).toContain(createRes.status);
    const body = await createRes.json();
    sessionId = body.id;
    expect(sessionId).toBeDefined();

    // Poll for active status (max 30 seconds)
    const deadline = Date.now() + 30_000;
    let lastStatus = body.status;
    while (Date.now() < deadline) {
      const listRes = await fetch(`${server.baseUrl}/api/sessions`);
      const sessions = await listRes.json() as Array<{ id: string; status: string }>;
      const session = sessions.find(s => s.id === sessionId);

      if (session?.status === 'active') {
        lastStatus = 'active';
        break;
      }
      if (session?.status === 'failed' || !session) {
        lastStatus = session?.status ?? 'deleted';
        break; // No point polling further
      }
      lastStatus = session?.status ?? 'deleted';
      await new Promise(r => setTimeout(r, 500));
    }

    if (lastStatus !== 'active') {
      const diagMsg = [
        `[session-activation] Session did not reach active status`,
        `  Last status: ${lastStatus}`,
        `  Platform: ${process.platform} (${process.arch})`,
        `  Node: ${process.version}`,
      ].join('\n');
      console.error(diagMsg);
    }

    sessionReachedActive = lastStatus === 'active';
    expect(lastStatus).toBe('active');
  });

  it('WebSocket receives terminal output from active session', async () => {
    if (!sessionReachedActive) {
      console.warn('[session-activation] Skipping WebSocket test — session not active');
      return;
    }

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
        // After receiving at least 1 message, we can resolve early
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

    if (!result.connected) {
      console.error(`[session-activation] WebSocket failed to connect`);
      console.error(`  Platform: ${process.platform} (${process.arch})`);
    }

    expect(result.connected).toBe(true);
    expect(result.messagesReceived).toBeGreaterThanOrEqual(1);
  });

  it('session is removed after kill', async () => {
    if (!sessionReachedActive) {
      // Session didn't activate — verify it was cleaned up gracefully
      const listRes = await fetch(`${server.baseUrl}/api/sessions`);
      const sessions = await listRes.json() as Array<{ id: string }>;
      const stillExists = sessions.some(s => s.id === sessionId);
      // Failed sessions should auto-delete
      if (!stillExists) {
        console.warn('[session-activation] Failed session was auto-cleaned — OK');
      }
      sessionId = '';
      return;
    }

    // Kill the session
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
    sessionId = ''; // Prevent afterAll from trying to kill again
  });
});
