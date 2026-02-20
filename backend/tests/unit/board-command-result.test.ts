import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Board command result infrastructure tests.
 *
 * The board-command endpoints live inline in hub-entry.ts, so we replicate
 * the core logic in a self-contained Express app for isolated testing.
 * This avoids pulling in the full hub (WebSocket, file watchers, DB, etc.)
 * while still exercising the real request/response contract.
 */

// ─── Minimal replica of the board-command infrastructure from hub-entry.ts ───

function createBoardCommandApp() {
  const app = express();
  app.use(express.json());

  const pendingCommands = new Map<string, {
    resolve: (result: Record<string, unknown>) => void;
    timeout: ReturnType<typeof setTimeout>;
    sessionId: string;
    action: string;
    createdAt: number;
    result?: Record<string, unknown>;
    resolvedAt?: number;
  }>();

  // Captured broadcasts for assertions
  const broadcasts: Array<{
    sessionId: string;
    type: string;
    command: string;
    params: Record<string, unknown>;
    requestId?: string;
  }> = [];

  function broadcastToSession(sessionId: string, msg: Record<string, unknown>) {
    broadcasts.push(msg as typeof broadcasts[number]);
  }

  // POST /api/sessions/:id/board-command
  app.post('/api/sessions/:id/board-command', (req, res) => {
    const sessionId = req.params.id;
    const { command, params, requestId, waitForResult } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Missing command' });
      return;
    }

    broadcastToSession(sessionId, {
      type: 'board_command',
      sessionId,
      command,
      params: params || {},
      requestId: requestId || undefined,
    });

    if (waitForResult && requestId) {
      const timeoutHandle = setTimeout(() => {
        if (pendingCommands.has(requestId)) {
          pendingCommands.delete(requestId);
        }
      }, 5_000); // Short timeout for tests (5s instead of 60s)
      timeoutHandle.unref();

      pendingCommands.set(requestId, {
        resolve: () => {},
        timeout: timeoutHandle,
        sessionId,
        action: command,
        createdAt: Date.now(),
      });
      res.status(202).json({ ok: true, requestId });
    } else {
      res.json({ ok: true });
    }
  });

  // POST /api/sessions/:id/board-command-result
  app.post('/api/sessions/:id/board-command-result', (req, res) => {
    const { requestId, result, error } = req.body;
    if (!requestId) {
      res.status(400).json({ error: 'Missing requestId' });
      return;
    }

    const pending = pendingCommands.get(requestId);
    if (!pending) {
      res.json({ ok: true });
      return;
    }

    clearTimeout(pending.timeout);
    pending.result = error ? { error } : (result || {});
    pending.resolvedAt = Date.now();

    res.json({ ok: true });
  });

  // GET /api/sessions/:id/board-command-result/:requestId
  app.get('/api/sessions/:id/board-command-result/:requestId', (req, res) => {
    const { requestId } = req.params;
    const pending = pendingCommands.get(requestId);

    if (!pending) {
      res.status(404).json({ error: 'Unknown requestId' });
      return;
    }

    if (pending.result) {
      const result = pending.result;
      pendingCommands.delete(requestId);
      res.json({ requestId, result });
      return;
    }

    // Short-poll for tests: wait up to 500ms with 50ms intervals
    const pollTimeout = 500;
    const startTime = Date.now();
    const pollInterval = setInterval(() => {
      const p = pendingCommands.get(requestId);
      if (!p) {
        clearInterval(pollInterval);
        res.status(408).json({ requestId, error: 'Timeout waiting for result' });
        return;
      }
      if (p.result) {
        clearInterval(pollInterval);
        const result = p.result;
        pendingCommands.delete(requestId);
        res.json({ requestId, result });
        return;
      }
      if (Date.now() - startTime > pollTimeout) {
        clearInterval(pollInterval);
        res.status(202).json({ requestId, status: 'pending' });
      }
    }, 50);
  });

  return { app, pendingCommands, broadcasts };
}

// ─── Tests ───

describe('Board Command Result Infrastructure', () => {
  let app: express.Express;
  let pendingCommands: Map<string, Record<string, unknown>>;
  let broadcasts: Array<Record<string, unknown>>;
  let cleanupTimers: ReturnType<typeof setTimeout>[] = [];

  beforeEach(() => {
    const created = createBoardCommandApp();
    app = created.app;
    pendingCommands = created.pendingCommands as Map<string, Record<string, unknown>>;
    broadcasts = created.broadcasts;
    cleanupTimers = [];
  });

  afterEach(() => {
    // Clear all pending command timeouts to avoid leaking timers
    for (const [, cmd] of pendingCommands.entries()) {
      if (cmd.timeout) clearTimeout(cmd.timeout as ReturnType<typeof setTimeout>);
    }
    pendingCommands.clear();
    for (const t of cleanupTimers) clearTimeout(t);
  });

  // ─── POST /api/sessions/:id/board-command ───

  describe('POST /api/sessions/:id/board-command', () => {
    it('returns 200 without waitForResult', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({ command: 'focus-file', params: { path: 'src/app.ts' } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.requestId).toBeUndefined();
    });

    it('returns 202 with requestId when waitForResult is true', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: { path: 'src/app.ts' },
          requestId: 'req-123',
          waitForResult: true,
        });

      expect(res.status).toBe(202);
      expect(res.body.ok).toBe(true);
      expect(res.body.requestId).toBe('req-123');
    });

    it('stores pending command in map when waitForResult is true', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-456',
          waitForResult: true,
        });

      expect(pendingCommands.has('req-456')).toBe(true);
      const pending = pendingCommands.get('req-456')!;
      expect(pending.sessionId).toBe('sess-1');
      expect(pending.action).toBe('view-diff');
    });

    it('does not store pending command without waitForResult', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'focus-file',
          params: {},
          requestId: 'req-789',
        });

      expect(pendingCommands.has('req-789')).toBe(false);
    });

    it('broadcasts to session regardless of waitForResult', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({ command: 'focus-file', params: { path: 'index.ts' } });

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].type).toBe('board_command');
      expect(broadcasts[0].command).toBe('focus-file');
      expect(broadcasts[0].sessionId).toBe('sess-1');
    });

    it('returns 400 when command is missing', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({ params: { path: 'src/app.ts' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing command');
    });
  });

  // ─── POST /api/sessions/:id/board-command-result ───

  describe('POST /api/sessions/:id/board-command-result', () => {
    it('resolves a pending command', async () => {
      // First, create a pending command
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-resolve',
          waitForResult: true,
        });

      // Then, post the result
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-resolve', result: { diffText: '+ new line' } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the result was stored on the pending entry
      const pending = pendingCommands.get('req-resolve') as Record<string, unknown>;
      expect(pending).toBeDefined();
      expect(pending.result).toEqual({ diffText: '+ new line' });
      expect(pending.resolvedAt).toBeDefined();
    });

    it('stores error when error field is provided', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-err',
          waitForResult: true,
        });

      const res = await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-err', error: 'File not found' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const pending = pendingCommands.get('req-err') as Record<string, unknown>;
      expect(pending.result).toEqual({ error: 'File not found' });
    });

    it('returns ok for unknown/expired requestId (graceful)', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'nonexistent-id', result: { data: 'late' } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when requestId is missing', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ result: { data: 'orphan' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing requestId');
    });

    it('defaults result to empty object when not provided', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'focus-file',
          params: {},
          requestId: 'req-empty',
          waitForResult: true,
        });

      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-empty' });

      const pending = pendingCommands.get('req-empty') as Record<string, unknown>;
      expect(pending.result).toEqual({});
    });
  });

  // ─── GET /api/sessions/:id/board-command-result/:requestId ───

  describe('GET /api/sessions/:id/board-command-result/:requestId', () => {
    it('returns result after it has been posted', async () => {
      // Create pending command
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-poll',
          waitForResult: true,
        });

      // Post result
      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-poll', result: { lines: 42 } });

      // Poll for result
      const res = await request(app)
        .get('/api/sessions/sess-1/board-command-result/req-poll');

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBe('req-poll');
      expect(res.body.result).toEqual({ lines: 42 });
    });

    it('cleans up pending entry after returning result', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-cleanup',
          waitForResult: true,
        });

      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-cleanup', result: { ok: true } });

      // First GET returns the result
      const res1 = await request(app)
        .get('/api/sessions/sess-1/board-command-result/req-cleanup');
      expect(res1.status).toBe(200);

      // Second GET returns 404 because the entry was cleaned up
      const res2 = await request(app)
        .get('/api/sessions/sess-1/board-command-result/req-cleanup');
      expect(res2.status).toBe(404);
    });

    it('returns 404 for unknown requestId', async () => {
      const res = await request(app)
        .get('/api/sessions/sess-1/board-command-result/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Unknown requestId');
    });

    it('long-polls and returns result when it arrives during polling', async () => {
      // Create pending command (no result yet)
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-longpoll',
          waitForResult: true,
        });

      // Start the poll in parallel, then post the result after a short delay
      const pollPromise = request(app)
        .get('/api/sessions/sess-1/board-command-result/req-longpoll');

      // Post result after 100ms so the poll picks it up
      await new Promise(resolve => setTimeout(resolve, 100));
      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-longpoll', result: { found: true } });

      const res = await pollPromise;
      expect(res.status).toBe(200);
      expect(res.body.requestId).toBe('req-longpoll');
      expect(res.body.result).toEqual({ found: true });
    });

    it('returns 202 pending when poll times out without result', async () => {
      // Create pending command but never post a result
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-timeout',
          waitForResult: true,
        });

      // Poll should time out after ~500ms (our short test timeout) and return 202
      const res = await request(app)
        .get('/api/sessions/sess-1/board-command-result/req-timeout');

      expect(res.status).toBe(202);
      expect(res.body.requestId).toBe('req-timeout');
      expect(res.body.status).toBe('pending');
    });

    it('returns error result when command had an error', async () => {
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({
          command: 'view-diff',
          params: {},
          requestId: 'req-error',
          waitForResult: true,
        });

      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-error', error: 'Permission denied' });

      const res = await request(app)
        .get('/api/sessions/sess-1/board-command-result/req-error');

      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({ error: 'Permission denied' });
    });
  });

  // ─── End-to-end flow ───

  describe('Full round-trip flow', () => {
    it('skill posts command, frontend resolves, skill polls result', async () => {
      // Step 1: Skill script posts a board command with waitForResult
      const cmdRes = await request(app)
        .post('/api/sessions/sess-42/board-command')
        .send({
          command: 'get-file-content',
          params: { path: 'src/main.ts' },
          requestId: 'flow-req-1',
          waitForResult: true,
        });
      expect(cmdRes.status).toBe(202);
      expect(cmdRes.body.requestId).toBe('flow-req-1');

      // Step 2: Frontend executes the command and posts the result
      const resultRes = await request(app)
        .post('/api/sessions/sess-42/board-command-result')
        .send({
          requestId: 'flow-req-1',
          result: { content: 'console.log("hello")' },
        });
      expect(resultRes.status).toBe(200);

      // Step 3: Skill script polls for the result
      const pollRes = await request(app)
        .get('/api/sessions/sess-42/board-command-result/flow-req-1');
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.requestId).toBe('flow-req-1');
      expect(pollRes.body.result).toEqual({ content: 'console.log("hello")' });

      // Step 4: Verify cleanup - polling again yields 404
      const pollRes2 = await request(app)
        .get('/api/sessions/sess-42/board-command-result/flow-req-1');
      expect(pollRes2.status).toBe(404);
    });

    it('multiple concurrent commands resolve independently', async () => {
      // Register two pending commands
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({ command: 'cmd-a', params: {}, requestId: 'req-a', waitForResult: true });
      await request(app)
        .post('/api/sessions/sess-1/board-command')
        .send({ command: 'cmd-b', params: {}, requestId: 'req-b', waitForResult: true });

      // Resolve them in reverse order
      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-b', result: { value: 'B' } });
      await request(app)
        .post('/api/sessions/sess-1/board-command-result')
        .send({ requestId: 'req-a', result: { value: 'A' } });

      // Each should return its own result
      const resA = await request(app).get('/api/sessions/sess-1/board-command-result/req-a');
      expect(resA.status).toBe(200);
      expect(resA.body.result).toEqual({ value: 'A' });

      const resB = await request(app).get('/api/sessions/sess-1/board-command-result/req-b');
      expect(resB.status).toBe(200);
      expect(resB.body.result).toEqual({ value: 'B' });
    });
  });
});
