import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Integration test for the view-* skill round-trip flow.
 *
 * Tests the board command result system that enables view-* skills
 * to send commands to the frontend and receive results back:
 *
 *   Skill script  --POST board-command-->  Hub  --WS-->  Frontend
 *   Skill script  <--GET result--  Hub  <--POST result--  Frontend
 *
 * Uses a self-contained Express app that replicates the inline board
 * command endpoints from hub-entry.ts, plus a mock WebSocket broadcast.
 */

describe('View Skills — Board Command Round-Trip', () => {
  let app: express.Express;
  let pendingCommands: Map<string, Record<string, unknown>>;
  let wsBroadcasts: Array<Record<string, unknown>>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    pendingCommands = new Map();
    wsBroadcasts = [];

    // Mock WebSocket broadcast — captures messages for assertions
    const broadcastToSession = (sessionId: string, message: Record<string, unknown>) => {
      wsBroadcasts.push({ sessionId, ...message });
    };

    // ── POST /api/sessions/:id/board-command ──
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
        }, 60_000);
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

    // ── POST /api/sessions/:id/board-command-result ──
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

      clearTimeout(pending.timeout as NodeJS.Timeout);
      pending.result = error ? { error } : (result || {});
      pending.resolvedAt = Date.now();

      res.json({ ok: true });
    });

    // ── GET /api/sessions/:id/board-command-result/:requestId ──
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

      // For integration tests, return 202 immediately instead of long-polling
      res.status(202).json({ requestId, status: 'pending' });
    });
  });

  afterEach(() => {
    // Clean up any remaining timeouts
    for (const [, cmd] of pendingCommands) {
      clearTimeout(cmd.timeout as NodeJS.Timeout);
    }
    pendingCommands.clear();
  });

  // ─── T1: Full round-trip ─────────────────────────────────────

  describe('full round-trip: POST command -> POST result -> GET result', () => {
    it('returns the result data that the frontend posted', async () => {
      const sessionId = 'sess-abc';
      const requestId = 'req-001';
      const resultPayload = { filePath: 'src/main.ts', content: 'console.log("hello")' };

      // Step 1: Skill POSTs a board command with waitForResult
      const cmdRes = await request(app)
        .post(`/api/sessions/${sessionId}/board-command`)
        .send({ command: 'view-file', params: { path: 'src/main.ts' }, requestId, waitForResult: true });

      expect(cmdRes.status).toBe(202);
      expect(cmdRes.body.ok).toBe(true);
      expect(cmdRes.body.requestId).toBe(requestId);

      // Verify WebSocket broadcast was sent
      expect(wsBroadcasts).toHaveLength(1);
      expect(wsBroadcasts[0]).toMatchObject({
        type: 'board_command',
        sessionId,
        command: 'view-file',
        requestId,
      });

      // Step 2: Frontend POSTs the result
      const resultRes = await request(app)
        .post(`/api/sessions/${sessionId}/board-command-result`)
        .send({ requestId, result: resultPayload });

      expect(resultRes.status).toBe(200);
      expect(resultRes.body.ok).toBe(true);

      // Step 3: Skill GETs the result
      const getRes = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.requestId).toBe(requestId);
      expect(getRes.body.result).toEqual(resultPayload);
    });
  });

  // ─── T2: Multiple concurrent commands ────────────────────────

  describe('multiple concurrent pending commands', () => {
    it('tracks independent requestIds without interference', async () => {
      const sessionId = 'sess-multi';
      const ids = ['req-A', 'req-B', 'req-C'];

      // POST all three commands
      for (const rid of ids) {
        const res = await request(app)
          .post(`/api/sessions/${sessionId}/board-command`)
          .send({ command: 'view-file', requestId: rid, waitForResult: true });
        expect(res.status).toBe(202);
      }

      expect(pendingCommands.size).toBe(3);

      // Resolve them in reverse order to prove independence
      for (const rid of [...ids].reverse()) {
        await request(app)
          .post(`/api/sessions/${sessionId}/board-command-result`)
          .send({ requestId: rid, result: { data: `result-for-${rid}` } });
      }

      // GET each one and verify correct data
      for (const rid of ids) {
        const res = await request(app)
          .get(`/api/sessions/${sessionId}/board-command-result/${rid}`);
        expect(res.status).toBe(200);
        expect(res.body.result).toEqual({ data: `result-for-${rid}` });
      }

      // All consumed
      expect(pendingCommands.size).toBe(0);
    });
  });

  // ─── T3: Result consumed only once ───────────────────────────

  describe('result consumed only once', () => {
    it('returns 404 on the second GET after result was consumed', async () => {
      const sessionId = 'sess-once';
      const requestId = 'req-once';

      await request(app)
        .post(`/api/sessions/${sessionId}/board-command`)
        .send({ command: 'view-diff', requestId, waitForResult: true });

      await request(app)
        .post(`/api/sessions/${sessionId}/board-command-result`)
        .send({ requestId, result: { diff: '+added line' } });

      // First GET — succeeds
      const first = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);
      expect(first.status).toBe(200);
      expect(first.body.result).toEqual({ diff: '+added line' });

      // Second GET — entry was deleted, should be 404
      const second = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);
      expect(second.status).toBe(404);
      expect(second.body.error).toBe('Unknown requestId');
    });
  });

  // ─── T4: POST result for expired/unknown requestId ──────────

  describe('POST result for expired/unknown requestId', () => {
    it('returns 200 ok gracefully even when requestId is unknown', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-ghost/board-command-result')
        .send({ requestId: 'req-never-existed', result: { something: true } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── T5: GET for pending command returns 202 ─────────────────

  describe('GET for pending command (no result yet)', () => {
    it('returns 202 with pending status when result has not arrived', async () => {
      const sessionId = 'sess-wait';
      const requestId = 'req-pending';

      await request(app)
        .post(`/api/sessions/${sessionId}/board-command`)
        .send({ command: 'view-file', requestId, waitForResult: true });

      // GET before any result has been posted
      const res = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);

      expect(res.status).toBe(202);
      expect(res.body.requestId).toBe(requestId);
      expect(res.body.status).toBe('pending');
    });
  });

  // ─── T6: Missing command field returns 400 ───────────────────

  describe('POST command with missing command field', () => {
    it('returns 400 with error message', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-bad/board-command')
        .send({ params: { path: 'src/main.ts' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing command');
    });

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-bad/board-command')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing command');
    });
  });

  // ─── T7: Error result handling ───────────────────────────────

  describe('error result handling', () => {
    it('wraps the error field when frontend posts an error result', async () => {
      const sessionId = 'sess-err';
      const requestId = 'req-err';

      await request(app)
        .post(`/api/sessions/${sessionId}/board-command`)
        .send({ command: 'view-file', requestId, waitForResult: true });

      // Frontend encountered an error and reports it
      await request(app)
        .post(`/api/sessions/${sessionId}/board-command-result`)
        .send({ requestId, error: 'File not found: src/missing.ts' });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);

      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({ error: 'File not found: src/missing.ts' });
    });

    it('prefers error field over result field when both are present', async () => {
      const sessionId = 'sess-err2';
      const requestId = 'req-err2';

      await request(app)
        .post(`/api/sessions/${sessionId}/board-command`)
        .send({ command: 'view-diff', requestId, waitForResult: true });

      // Frontend sends both error and result — error should take precedence
      await request(app)
        .post(`/api/sessions/${sessionId}/board-command-result`)
        .send({ requestId, result: { data: 'should be ignored' }, error: 'Something went wrong' });

      const res = await request(app)
        .get(`/api/sessions/${sessionId}/board-command-result/${requestId}`);

      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({ error: 'Something went wrong' });
    });
  });

  // ─── T8: POST board-command without waitForResult ────────────

  describe('POST command without waitForResult', () => {
    it('returns 200 immediately and does not create a pending entry', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-fire/board-command')
        .send({ command: 'focus-file', params: { path: 'src/index.ts' } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(pendingCommands.size).toBe(0);

      // WebSocket broadcast should still happen
      expect(wsBroadcasts).toHaveLength(1);
      expect(wsBroadcasts[0]).toMatchObject({ command: 'focus-file' });
    });
  });

  // ─── T9: POST board-command-result with missing requestId ────

  describe('POST board-command-result with missing requestId', () => {
    it('returns 400 when requestId is missing from the body', async () => {
      const res = await request(app)
        .post('/api/sessions/sess-bad/board-command-result')
        .send({ result: { data: 'orphan' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing requestId');
    });
  });
});
