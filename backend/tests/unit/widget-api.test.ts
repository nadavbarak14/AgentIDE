import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Widget types & store (replicated from hub-entry.ts for unit testing) ──

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

describe('Widget API', () => {
  let app: express.Express;
  let widgetStore: Map<string, Map<string, Widget>>;
  let broadcastedMessages: Array<Record<string, unknown>>;
  const SESSION_ID = 'test-session-123';

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

  beforeEach(() => {
    widgetStore = new Map();
    broadcastedMessages = [];

    app = express();
    app.use(express.json({ limit: '2mb' }));

    // POST /api/sessions/:id/widget
    app.post('/api/sessions/:id/widget', (req, res) => {
      const sessionId = req.params.id;
      const { name, html } = req.body as { name?: string; html?: string };

      if (!name || !html) {
        res.status(400).json({ error: 'Missing name or html' });
        return;
      }
      if (!WIDGET_NAME_PATTERN.test(name)) {
        res.status(400).json({ error: 'Invalid widget name — must be lowercase alphanumeric with hyphens' });
        return;
      }
      const htmlBytes = Buffer.byteLength(html, 'utf-8');
      if (htmlBytes > WIDGET_HTML_MAX_BYTES) {
        res.status(413).json({ error: 'Widget HTML exceeds 512KB limit' });
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

      broadcastedMessages.push({
        type: 'board_command', sessionId,
        command: 'widget.create',
        params: { name, html },
      });

      res.json({ ok: true, name, ...(replaced ? { replaced: true } : { created: true }) });
    });

    // DELETE /api/sessions/:id/widget/:name
    app.delete('/api/sessions/:id/widget/:name', (req, res) => {
      const sessionId = req.params.id;
      const { name } = req.params;

      if (!deleteWidget(sessionId, name)) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }

      broadcastedMessages.push({
        type: 'board_command', sessionId,
        command: 'widget.dismiss',
        params: { name },
      });

      res.json({ ok: true, name });
    });

    // POST /api/sessions/:id/widget/:name/result
    app.post('/api/sessions/:id/widget/:name/result', (req, res) => {
      const sessionId = req.params.id;
      const { name } = req.params;
      const { data } = req.body as { data?: unknown };

      const widget = getWidget(sessionId, name);
      if (!widget) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }

      const resultJson = JSON.stringify(data ?? {});
      if (Buffer.byteLength(resultJson, 'utf-8') > WIDGET_RESULT_MAX_BYTES) {
        res.status(413).json({ error: 'Result exceeds 1MB limit' });
        return;
      }

      widget.result = (data ?? {}) as Record<string, unknown>;
      widget.resultAt = Date.now();

      res.json({ ok: true });
    });

    // GET /api/sessions/:id/widget/:name/result
    app.get('/api/sessions/:id/widget/:name/result', (req, res) => {
      const sessionId = req.params.id;
      const { name } = req.params;

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

    // GET /api/sessions/:id/widgets
    app.get('/api/sessions/:id/widgets', (req, res) => {
      const sessionId = req.params.id;
      const session = widgetStore.get(sessionId);
      if (!session || session.size === 0) {
        res.json({ widgets: [] });
        return;
      }
      const widgets = Array.from(session.values()).map(w => ({
        name: w.name, createdAt: w.createdAt, hasResult: w.result !== null,
      }));
      res.json({ widgets });
    });

    // GET /api/widget-bridge.js
    app.get('/api/widget-bridge.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.send('window.C3={sendResult:function(d){window.parent.postMessage({type:"widget-result",data:d},"*")},onRequest:function(cb){},ready:function(){}}');
    });
  });

  describe('POST /api/sessions/:id/widget (create)', () => {
    it('creates a new widget', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'color-picker', html: '<h1>Pick</h1>' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, name: 'color-picker', created: true });
    });

    it('replaces existing widget with same name', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>V1</h1>' });

      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>V2</h1>' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, name: 'picker', replaced: true });

      // Verify content was updated
      const widget = getWidget(SESSION_ID, 'picker');
      expect(widget?.html).toBe('<h1>V2</h1>');
    });

    it('clears result when replacing a widget', async () => {
      // Create widget and add result
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>V1</h1>' });
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: { color: 'red' } });

      // Replace
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>V2</h1>' });

      const widget = getWidget(SESSION_ID, 'picker');
      expect(widget?.result).toBeNull();
      expect(widget?.resultAt).toBeNull();
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ html: '<h1>No name</h1>' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing name or html');
    });

    it('rejects missing html', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing name or html');
    });

    it('rejects invalid widget name format', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'UPPER_CASE', html: '<h1>Bad</h1>' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid widget name');
    });

    it('rejects names with spaces', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'has spaces', html: '<h1>Bad</h1>' });

      expect(res.status).toBe(400);
    });

    it('accepts valid hyphenated names', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'my-color-picker-2', html: '<h1>OK</h1>' });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
    });

    it('rejects HTML exceeding 512KB', async () => {
      const largeHtml = 'x'.repeat(512 * 1024 + 1);
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'big', html: largeHtml });

      expect(res.status).toBe(413);
      expect(res.body.error).toContain('512KB');
    });

    it('broadcasts widget.create board command', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'test', html: '<h1>Hi</h1>' });

      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0]).toMatchObject({
        type: 'board_command',
        command: 'widget.create',
        params: { name: 'test', html: '<h1>Hi</h1>' },
      });
    });
  });

  describe('DELETE /api/sessions/:id/widget/:name (dismiss)', () => {
    it('dismisses an existing widget', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      const res = await request(app)
        .delete(`/api/sessions/${SESSION_ID}/widget/picker`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, name: 'picker' });
    });

    it('returns 404 for non-existent widget', async () => {
      const res = await request(app)
        .delete(`/api/sessions/${SESSION_ID}/widget/nonexistent`);

      expect(res.status).toBe(404);
    });

    it('broadcasts widget.dismiss board command', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });
      broadcastedMessages.length = 0; // Clear create broadcast

      await request(app).delete(`/api/sessions/${SESSION_ID}/widget/picker`);

      expect(broadcastedMessages).toHaveLength(1);
      expect(broadcastedMessages[0]).toMatchObject({
        command: 'widget.dismiss',
        params: { name: 'picker' },
      });
    });

    it('widget is gone after dismiss', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      await request(app).delete(`/api/sessions/${SESSION_ID}/widget/picker`);

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widget/picker/result`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/sessions/:id/widget/:name/result (submit result)', () => {
    it('stores result on widget', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: { color: '#ff5500', opacity: 0.8 } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const widget = getWidget(SESSION_ID, 'picker');
      expect(widget?.result).toEqual({ color: '#ff5500', opacity: 0.8 });
      expect(widget?.resultAt).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent widget', async () => {
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/ghost/result`)
        .send({ data: { x: 1 } });

      expect(res.status).toBe(404);
    });

    it('rejects result exceeding 1MB', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      const largeData = { payload: 'x'.repeat(1024 * 1024 + 1) };
      const res = await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: largeData });

      expect(res.status).toBe(413);
      expect(res.body.error).toContain('1MB');
    });

    it('overwrites previous result', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: { color: 'red' } });

      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: { color: 'blue' } });

      const widget = getWidget(SESSION_ID, 'picker');
      expect(widget?.result).toEqual({ color: 'blue' });
    });
  });

  describe('GET /api/sessions/:id/widget/:name/result (poll result)', () => {
    it('returns pending when no result yet', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widget/picker/result`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'pending' });
    });

    it('returns ready with result data', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker', html: '<h1>Pick</h1>' });

      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker/result`)
        .send({ data: { color: '#ff5500' } });

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widget/picker/result`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.result).toEqual({ color: '#ff5500' });
      expect(res.body.receivedAt).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent widget', async () => {
      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widget/ghost/result`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sessions/:id/widgets (list)', () => {
    it('returns empty array when no widgets', async () => {
      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widgets`);

      expect(res.status).toBe(200);
      expect(res.body.widgets).toEqual([]);
    });

    it('lists all widgets with hasResult flag', async () => {
      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker-a', html: '<h1>A</h1>' });

      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget`)
        .send({ name: 'picker-b', html: '<h1>B</h1>' });

      await request(app)
        .post(`/api/sessions/${SESSION_ID}/widget/picker-a/result`)
        .send({ data: { choice: 'yes' } });

      const res = await request(app)
        .get(`/api/sessions/${SESSION_ID}/widgets`);

      expect(res.body.widgets).toHaveLength(2);
      const a = res.body.widgets.find((w: { name: string }) => w.name === 'picker-a');
      const b = res.body.widgets.find((w: { name: string }) => w.name === 'picker-b');
      expect(a.hasResult).toBe(true);
      expect(b.hasResult).toBe(false);
    });
  });

  describe('GET /api/widget-bridge.js (bridge SDK)', () => {
    it('returns JavaScript with correct content-type', async () => {
      const res = await request(app).get('/api/widget-bridge.js');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/javascript');
    });

    it('includes no-cache header', async () => {
      const res = await request(app).get('/api/widget-bridge.js');

      expect(res.headers['cache-control']).toBe('no-cache');
    });

    it('contains C3.sendResult function', async () => {
      const res = await request(app).get('/api/widget-bridge.js');

      expect(res.text).toContain('sendResult');
    });

    it('contains C3.onRequest function', async () => {
      const res = await request(app).get('/api/widget-bridge.js');

      expect(res.text).toContain('onRequest');
    });

    it('contains C3.ready function', async () => {
      const res = await request(app).get('/api/widget-bridge.js');

      expect(res.text).toContain('ready');
    });
  });
});
