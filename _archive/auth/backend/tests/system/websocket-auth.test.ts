import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createAuthTestServer, generateAndActivate, getBaseUrl, type AuthTestServer } from './auth-test-server.js';

function connectWs(
  port: number,
  sessionId: string,
  options?: { cookie?: string },
): Promise<{ ws: WebSocket; messages: unknown[]; error?: Error; waitClose: () => Promise<void> }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    if (options?.cookie) {
      headers.Cookie = options.cookie;
    }

    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}`, { headers });
    const messages: unknown[] = [];

    const waitClose = () =>
      new Promise<void>((res) => {
        if (ws.readyState === WebSocket.CLOSED) {
          res();
          return;
        }
        ws.on('close', () => res());
        ws.close();
        // Safety timeout
        setTimeout(res, 500);
      });

    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        messages.push(data.toString());
      }
    });

    ws.on('open', () => {
      // Give it a moment to receive initial messages
      setTimeout(() => resolve({ ws, messages, waitClose }), 100);
    });

    ws.on('error', (error) => {
      resolve({ ws, messages, error, waitClose });
    });

    // Timeout after 3 seconds
    setTimeout(() => resolve({ ws, messages, waitClose }), 3000);
  });
}

describe('System: WebSocket Auth (US1 + US2)', () => {
  describe('Localhost mode', () => {
    let ts: AuthTestServer;

    beforeEach(async () => {
      ts = await createAuthTestServer({ authRequired: false });
    });

    afterEach(async () => {
      await ts.close();
    });

    it('WebSocket connects without cookie in localhost mode', async () => {
      // Create a session first
      const baseUrl = getBaseUrl(ts.port);
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDirectory: '/tmp', title: 'WS Test' }),
      });
      const session = await createRes.json();

      const { ws, messages, error, waitClose } = await connectWs(ts.port, session.id);
      expect(error).toBeUndefined();
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Should receive session_status message
      expect(messages.length).toBeGreaterThanOrEqual(1);
      const statusMsg = messages.find((m: unknown) => (m as { type: string }).type === 'session_status');
      expect(statusMsg).toBeDefined();

      await waitClose();
    });
  });

  describe('Remote mode', () => {
    let ts: AuthTestServer;
    let baseUrl: string;

    beforeEach(async () => {
      ts = await createAuthTestServer({ authRequired: true });
      baseUrl = getBaseUrl(ts.port);
    });

    afterEach(async () => {
      await ts.close();
    });

    it('WebSocket rejected without cookie', async () => {
      // Create a session (need auth first)
      const { cookie } = await generateAndActivate(baseUrl);
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ workingDirectory: '/tmp', title: 'WS Auth Test' }),
      });
      const session = await createRes.json();

      // Try to connect WITHOUT cookie
      const { ws, error, waitClose } = await connectWs(ts.port, session.id);
      // Should fail — either error event or socket not in OPEN state
      const failed = error !== undefined || ws.readyState !== WebSocket.OPEN;
      expect(failed).toBe(true);

      await waitClose();
    });

    it('WebSocket connects with valid cookie', async () => {
      const { cookie } = await generateAndActivate(baseUrl);

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ workingDirectory: '/tmp', title: 'WS Auth Test' }),
      });
      const session = await createRes.json();

      const { ws, messages, error, waitClose } = await connectWs(ts.port, session.id, { cookie });
      expect(error).toBeUndefined();
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Should receive session_status
      expect(messages.length).toBeGreaterThanOrEqual(1);

      await waitClose();
    });

    it('WebSocket rejected with garbage cookie', async () => {
      const { cookie } = await generateAndActivate(baseUrl);

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ workingDirectory: '/tmp', title: 'WS Garbage Test' }),
      });
      const session = await createRes.json();

      // Try with garbage cookie
      const { ws, error, waitClose } = await connectWs(ts.port, session.id, {
        cookie: 'agentide_session=this-is-not-a-jwt',
      });
      const failed = error !== undefined || ws.readyState !== WebSocket.OPEN;
      expect(failed).toBe(true);

      await waitClose();
    });
  });
});
