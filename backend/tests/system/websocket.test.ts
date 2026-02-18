import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createTestServer, getBaseUrl, type TestServer } from './test-server.js';

describe('WebSocket Events', () => {
  let ctx: TestServer;
  let baseUrl: string;
  let sessionId: string;
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    ctx = await createTestServer();
    baseUrl = getBaseUrl(ctx.port);

    // Create a session for WebSocket tests
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: '/tmp/ws-test', title: 'WS Test' }),
    });
    const data = await res.json();
    sessionId = data.id;
  });

  afterEach(() => {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    openSockets.length = 0;
  });

  afterAll(async () => {
    // Small delay to let WS connections close before shutting down server
    await new Promise((r) => setTimeout(r, 100));
    await ctx.close();
  });

  function connectWs(sid: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${ctx.port}/ws/sessions/${sid}`);
      openSockets.push(ws);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  }

  it('WebSocket client connects to /ws/sessions/:id', async () => {
    const ws = await connectWs(sessionId);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects connection for invalid session ID', async () => {
    const ws = new WebSocket(`ws://localhost:${ctx.port}/ws/sessions/00000000-0000-0000-0000-000000000000`);
    openSockets.push(ws);

    const result = await new Promise<string>((resolve) => {
      ws.on('open', () => resolve('open'));
      ws.on('error', () => resolve('error'));
      ws.on('close', () => resolve('close'));
      setTimeout(() => resolve('timeout'), 3000);
    });

    // Invalid session should close or error, not stay open
    expect(['error', 'close']).toContain(result);
  });
});
