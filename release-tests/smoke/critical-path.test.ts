import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

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

  it('agentide binary exists and is executable', () => {
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

  it('POST /api/sessions creates a session', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: env.dataDir,
        title: 'smoke-test-session',
      }),
    });
    // Could be 201 (created) or 200/202 (auto-continued)
    expect([200, 201, 202]).toContain(res.status);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBeDefined();
  });

  it('WebSocket connects and opens successfully', async () => {
    // First create a session to get a valid session ID for the WS endpoint
    const sessionRes = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await sessionRes.json();
    // Use the session created in the previous test, or create one
    let sessionId: string;
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
    } else {
      const createRes = await fetch(`${server.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDirectory: env.dataDir, title: 'ws-test' }),
      });
      const session = await createRes.json();
      sessionId = session.id;
    }

    const connected = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      const timer = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    expect(connected).toBe(true);
  });

  it('server shuts down cleanly', async () => {
    // This test runs last — we stop the server and verify clean exit
    const exitCode = await server.stop();
    // SIGTERM results in null exit code on some systems, or 143 (128+15)
    expect(exitCode === null || exitCode === 0 || exitCode === 143).toBe(true);
    // Prevent afterAll from trying to stop again
    server = null as unknown as RunningServer;
  });
});
