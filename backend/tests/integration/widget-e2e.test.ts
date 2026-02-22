import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Widget E2E System Test
 *
 * Tests the full widget lifecycle through the real Express app + WebSocket,
 * verifying that board commands are broadcast when widgets are created/dismissed,
 * and that the result channel (submit → poll) works end-to-end.
 *
 * Uses a standalone Express app with the widget endpoints mounted directly
 * (mirroring hub-entry.ts) and a WebSocket server for board command broadcast.
 */

interface Widget {
  name: string;
  html: string;
  sessionId: string;
  createdAt: number;
  result: Record<string, unknown> | null;
  resultAt: number | null;
}

const WIDGET_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WIDGET_HTML_MAX_BYTES = 512 * 1024;
const WIDGET_RESULT_MAX_BYTES = 1024 * 1024;

describe('Widget E2E', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;
  let widgetStore: Map<string, Map<string, Widget>>;
  const wsClients = new Map<string, Set<WebSocket>>();
  const openSockets: WebSocket[] = [];
  const SESSION_ID = 'e2e-session-001';

  // Widget store helpers
  function getSessionWidgets(sessionId: string): Map<string, Widget> {
    let session = widgetStore.get(sessionId);
    if (!session) {
      session = new Map();
      widgetStore.set(sessionId, session);
    }
    return session;
  }

  function getWidget(sessionId: string, name: string): Widget | undefined {
    return widgetStore.get(sessionId)?.get(name);
  }

  function setWidget(sessionId: string, name: string, widget: Widget): void {
    getSessionWidgets(sessionId).set(name, widget);
  }

  function deleteWidget(sessionId: string, name: string): boolean {
    const session = widgetStore.get(sessionId);
    if (!session) return false;
    return session.delete(name);
  }

  function broadcastToSession(sessionId: string, message: Record<string, unknown>) {
    const clients = wsClients.get(sessionId);
    if (!clients) return;
    const data = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  beforeAll(async () => {
    widgetStore = new Map();

    const app = express();
    app.use(express.json({ limit: '2mb' }));

    // Widget bridge SDK
    app.get('/api/widget-bridge.js', (_req, res) => {
      const bridgePath = path.join(import.meta.dirname, '../../src/api/widget-bridge.js');
      if (fs.existsSync(bridgePath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(bridgePath);
      } else {
        res.status(404).send('Bridge SDK not found');
      }
    });

    // Create/replace widget
    app.post('/api/sessions/:id/widget', (req, res) => {
      const sessionId = req.params.id;
      const { name, html } = req.body;
      if (!name || typeof name !== 'string' || !WIDGET_NAME_PATTERN.test(name)) {
        res.status(400).json({ error: 'Invalid widget name' });
        return;
      }
      if (!html || typeof html !== 'string') {
        res.status(400).json({ error: 'Missing html' });
        return;
      }
      const htmlBytes = Buffer.byteLength(html, 'utf8');
      if (htmlBytes > WIDGET_HTML_MAX_BYTES) {
        res.status(413).json({ error: 'HTML too large' });
        return;
      }
      const existing = getWidget(sessionId, name);
      const replaced = !!existing;
      const widget: Widget = {
        name, html, sessionId,
        createdAt: Date.now(),
        result: null, resultAt: null,
      };
      setWidget(sessionId, name, widget);
      broadcastToSession(sessionId, {
        type: 'board_command',
        command: 'widget.create',
        params: { name, html },
      });
      res.json({ ok: true, name, status: replaced ? 'replaced' : 'created' });
    });

    // Dismiss widget
    app.delete('/api/sessions/:id/widget/:name', (req, res) => {
      const { id: sessionId, name } = req.params;
      const existed = deleteWidget(sessionId, name);
      if (!existed) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }
      broadcastToSession(sessionId, {
        type: 'board_command',
        command: 'widget.dismiss',
        params: { name },
      });
      res.json({ ok: true });
    });

    // Submit result
    app.post('/api/sessions/:id/widget/:name/result', (req, res) => {
      const { id: sessionId, name } = req.params;
      const widget = getWidget(sessionId, name);
      if (!widget) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }
      const bodyStr = JSON.stringify(req.body.data ?? {});
      if (Buffer.byteLength(bodyStr, 'utf8') > WIDGET_RESULT_MAX_BYTES) {
        res.status(413).json({ error: 'Result too large' });
        return;
      }
      widget.result = req.body.data ?? {};
      widget.resultAt = Date.now();
      res.json({ ok: true });
    });

    // Poll result
    app.get('/api/sessions/:id/widget/:name/result', (req, res) => {
      const { id: sessionId, name } = req.params;
      const widget = getWidget(sessionId, name);
      if (!widget) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }
      if (widget.result !== null) {
        res.json({ status: 'ready', result: widget.result, receivedAt: widget.resultAt });
      } else {
        res.json({ status: 'pending' });
      }
    });

    // List widgets
    app.get('/api/sessions/:id/widgets', (req, res) => {
      const sessionId = req.params.id;
      const widgets = getSessionWidgets(sessionId);
      const list = Array.from(widgets.values()).map(w => ({
        name: w.name,
        createdAt: w.createdAt,
        hasResult: w.result !== null,
      }));
      res.json({ widgets: list });
    });

    server = http.createServer(app);

    // WebSocket server for board command broadcast testing
    const wss = new WebSocketServer({ server, path: '/ws/test' });
    wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://localhost`);
      const sid = url.searchParams.get('sessionId') || SESSION_ID;
      if (!wsClients.has(sid)) wsClients.set(sid, new Set());
      wsClients.get(sid)!.add(ws);
      ws.on('close', () => {
        wsClients.get(sid)?.delete(ws);
      });
    });

    port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
      });
    });
    baseUrl = `http://localhost:${port}`;
  });

  beforeEach(() => {
    widgetStore.clear();
  });

  afterAll(async () => {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connectWs(sessionId = SESSION_ID): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/test?sessionId=${sessionId}`);
      openSockets.push(ws);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS timeout')), 5000);
    });
  }

  function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Message timeout')), timeoutMs);
      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  // ── Full lifecycle: create → board_command → result → poll ──

  it('full widget lifecycle: create → board_command broadcast → submit result → poll result', async () => {
    const ws = await connectWs();
    const msgPromise = waitForMessage(ws);

    // 1. Create widget
    const createRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'color-picker', html: '<h1>Pick a color</h1>' }),
    });
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json();
    expect(createBody.ok).toBe(true);
    expect(createBody.status).toBe('created');

    // 2. Verify board_command was broadcast via WebSocket
    const msg = await msgPromise;
    expect(msg.type).toBe('board_command');
    expect(msg.command).toBe('widget.create');
    expect((msg.params as Record<string, unknown>).name).toBe('color-picker');
    expect((msg.params as Record<string, unknown>).html).toBe('<h1>Pick a color</h1>');

    // 3. Poll — should be pending initially
    const pendingRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/color-picker/result`);
    const pendingBody = await pendingRes.json();
    expect(pendingBody.status).toBe('pending');

    // 4. Submit result (simulating user interaction)
    const resultRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/color-picker/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { color: 'blue', hex: '#0000FF' } }),
    });
    expect(resultRes.status).toBe(200);

    // 5. Poll — should be ready
    const readyRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/color-picker/result`);
    const readyBody = await readyRes.json();
    expect(readyBody.status).toBe('ready');
    expect(readyBody.result).toEqual({ color: 'blue', hex: '#0000FF' });
    expect(readyBody.receivedAt).toBeTypeOf('number');

    ws.close();
  });

  it('replace widget clears previous result and broadcasts board_command', async () => {
    const ws = await connectWs();

    // Create original widget — set up listener BEFORE HTTP to avoid race
    const createMsgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'picker', html: '<p>v1</p>' }),
    });
    await createMsgPromise; // consume create message

    // Submit result for v1
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/picker/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { version: 1 } }),
    });

    // Verify v1 result is ready
    const v1Res = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/picker/result`);
    expect((await v1Res.json()).status).toBe('ready');

    // Replace widget with same name
    const replacePromise = waitForMessage(ws);
    const replaceRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'picker', html: '<p>v2</p>' }),
    });
    const replaceBody = await replaceRes.json();
    expect(replaceBody.status).toBe('replaced');

    // Verify board_command broadcast for replace
    const msg = await replacePromise;
    expect(msg.command).toBe('widget.create');

    // Result should be cleared (pending again)
    const v2Res = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/picker/result`);
    expect((await v2Res.json()).status).toBe('pending');

    ws.close();
  });

  it('dismiss widget broadcasts board_command and removes from store', async () => {
    const ws = await connectWs();

    // Create two widgets — set up listeners BEFORE HTTP to avoid race
    const createAPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'widget-a', html: '<p>A</p>' }),
    });
    await createAPromise;

    const createBPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'widget-b', html: '<p>B</p>' }),
    });
    await createBPromise;

    // Dismiss widget-a
    const dismissPromise = waitForMessage(ws);
    const dismissRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/widget-a`, {
      method: 'DELETE',
    });
    expect(dismissRes.status).toBe(200);

    // Verify board_command broadcast for dismiss
    const msg = await dismissPromise;
    expect(msg.command).toBe('widget.dismiss');
    expect((msg.params as Record<string, unknown>).name).toBe('widget-a');

    // widget-b should still exist
    const listRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widgets`);
    const listBody = await listRes.json();
    expect(listBody.widgets).toHaveLength(1);
    expect(listBody.widgets[0].name).toBe('widget-b');

    // Dismiss non-existent returns 404
    const notFoundRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/widget-a`, {
      method: 'DELETE',
    });
    expect(notFoundRes.status).toBe(404);

    ws.close();
  });

  it('bridge SDK serves JavaScript with correct headers', async () => {
    const res = await fetch(`${baseUrl}/api/widget-bridge.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    const body = await res.text();
    expect(body).toContain('C3.sendResult');
    expect(body).toContain('C3.ready');
    expect(body).toContain('C3.onRequest');
  });

  it('widget list shows hasResult flag correctly', async () => {
    // Create two widgets
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'with-result', html: '<p>1</p>' }),
    });
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'no-result', html: '<p>2</p>' }),
    });

    // Submit result for only one
    await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widget/with-result/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { done: true } }),
    });

    const listRes = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/widgets`);
    const listBody = await listRes.json();
    expect(listBody.widgets).toHaveLength(2);

    const withResult = listBody.widgets.find((w: { name: string }) => w.name === 'with-result');
    const noResult = listBody.widgets.find((w: { name: string }) => w.name === 'no-result');
    expect(withResult.hasResult).toBe(true);
    expect(noResult.hasResult).toBe(false);
  });
});
