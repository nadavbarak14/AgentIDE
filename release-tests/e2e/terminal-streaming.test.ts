import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, createActiveSession, type RunningServer } from '../helpers/server.js';

describe('E2E: Terminal streaming via WebSocket', { timeout: 120_000 }, () => {
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

    // Create an active session for streaming tests
    sessionId = await createActiveSession(server, env.dataDir, 'ws-stream-test');
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

  it('WebSocket connects to active session', async () => {
    const connected = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      const timer = setTimeout(() => { ws.close(); resolve(false); }, 5000);
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(true); });
      ws.on('error', () => { clearTimeout(timer); resolve(false); });
    });
    expect(connected).toBe(true);
  });

  it('WebSocket receives terminal data from active session', async () => {
    const received = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      const timer = setTimeout(() => { ws.close(); resolve(false); }, 10_000);
      ws.on('message', () => { clearTimeout(timer); ws.close(); resolve(true); });
      ws.on('error', () => { clearTimeout(timer); resolve(false); });
    });
    expect(received).toBe(true);
  });

  it('WebSocket rejects non-existent session', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const result = await new Promise<'connected' | 'error' | 'timeout'>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${fakeId}`);
      const timer = setTimeout(() => { ws.close(); resolve('timeout'); }, 3000);
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve('connected'); });
      ws.on('error', () => { clearTimeout(timer); resolve('error'); });
    });
    expect(result).toBe('error');
  });

  it('WebSocket close event fires cleanly', async () => {
    const result = await new Promise<'clean-close' | 'error' | 'timeout'>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/sessions/${sessionId}`);
      const timer = setTimeout(() => resolve('timeout'), 5000);
      ws.on('open', () => { ws.close(); });
      ws.on('close', () => { clearTimeout(timer); resolve('clean-close'); });
      ws.on('error', () => { clearTimeout(timer); resolve('error'); });
    });
    expect(result).toBe('clean-close');
  });
});
