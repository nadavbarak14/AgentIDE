import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, createActiveSession, type RunningServer } from '../helpers/server.js';

describe('Release Smoke Test', { timeout: 300_000 }, () => {
  let env: ReleaseEnvironment;
  let artifact: InstalledArtifact;
  let server: RunningServer;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
    server = await startServer({ env, binaryPath: artifact.binaryPath, port: 0 });
    await waitForHealth(server.baseUrl);
  });

  afterAll(async () => {
    try {
      if (server) await server.stop();
    } finally {
      if (env) await env.cleanup();
    }
  });

  it('adyx binary exists and is executable', () => {
    expect(fs.existsSync(artifact.binaryPath)).toBe(true);
    fs.accessSync(artifact.binaryPath, fs.constants.X_OK);
  });

  it('server health endpoint responds 200', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/sessions returns 200 with array', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/sessions creates an active session', async () => {
    const sessionId = await createActiveSession(server, env.dataDir, 'smoke-test-session');
    expect(sessionId).toBeDefined();

    // Verify it's in the session list
    const listRes = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await listRes.json() as Array<{ id: string; status: string }>;
    expect(sessions.some(s => s.id === sessionId && s.status === 'active')).toBe(true);

    // Cleanup
    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });
  });

  it('WebSocket connects to active session and receives data', async () => {
    const sessionId = await createActiveSession(server, env.dataDir, 'ws-smoke-test');

    const result = await new Promise<{ connected: boolean; received: boolean }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      let received = false;
      const timer = setTimeout(() => { ws.close(); resolve({ connected: true, received }); }, 5000);
      ws.on('message', () => {
        received = true;
        clearTimeout(timer);
        ws.close();
        resolve({ connected: true, received: true });
      });
      ws.on('error', () => { clearTimeout(timer); resolve({ connected: false, received: false }); });
    });

    expect(result.connected).toBe(true);
    expect(result.received).toBe(true);

    // Cleanup
    await fetch(`${server.baseUrl}/api/sessions/${sessionId}/kill`, { method: 'POST' });
  });

  it('server shuts down cleanly', async () => {
    const exitCode = await server.stop();
    expect(exitCode === null || exitCode === 0 || exitCode === 143).toBe(true);
    server = null as unknown as RunningServer;
  });
});
