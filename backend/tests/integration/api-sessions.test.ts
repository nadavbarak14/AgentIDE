import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { QueueManager } from '../../src/services/queue-manager.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';
import { SessionManager } from '../../src/services/session-manager.js';

// For integration tests, we mock the PtySpawner since we don't have a real `claude` binary in CI.
// Constitution Principle I permits this — claude CLI is a genuine external dependency.
function createMockPtySpawner(): PtySpawner {
  const spawner = new PtySpawner();
  // Override spawn to avoid actually calling `claude`
  spawner.spawn = function (sessionId: string, _workingDirectory: string, _args?: string[]) {
    const fakePid = Math.floor(Math.random() * 90000) + 10000;
    return {
      pid: fakePid,
      sessionId,
      write: () => {},
      resize: () => {},
      kill: () => {
        spawner.emit('exit', sessionId, 0, 'mock-claude-session-id');
      },
    };
  };
  spawner.spawnContinue = spawner.spawn;
  return spawner;
}

describe('Sessions API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let ptySpawner: PtySpawner;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
    const db = createTestDb();
    repo = new Repository(db);
    ptySpawner = createMockPtySpawner();
    const queueManager = new QueueManager(repo);
    sessionManager = new SessionManager(repo, ptySpawner, queueManager);
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(repo, sessionManager));
  });

  afterEach(() => {
    sessionManager.destroy();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /api/sessions', () => {
    it('creates a session and auto-activates if slot available', async () => {
      const dir = path.join(tmpDir, 'project');
      const res = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: dir, title: 'Test Session' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Session');
      // Should auto-activate since max_sessions=2 and no active sessions
      expect(res.body.status).toBe('active');
    });

    it('queues session when max slots reached', async () => {
      repo.updateSettings({ maxConcurrentSessions: 1 });

      // First session auto-activates
      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      // Second should queue
      const res = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p2'), title: 'S2' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('queued');
    });

    it('rejects missing required fields', async () => {
      const res = await request(app).post('/api/sessions').send({ title: 'No Dir' });
      expect(res.status).toBe(400);
    });

    it('creates directory if it does not exist', async () => {
      const dir = path.join(tmpDir, 'new-project');
      const res = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: dir, title: 'New' });

      expect(res.status).toBe(201);
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('GET /api/sessions', () => {
    it('lists all sessions', async () => {
      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p2'), title: 'S2' });

      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters by status', async () => {
      repo.updateSettings({ maxConcurrentSessions: 1 });

      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p2'), title: 'S2' });

      const active = await request(app).get('/api/sessions?status=active');
      expect(active.body).toHaveLength(1);

      const queued = await request(app).get('/api/sessions?status=queued');
      expect(queued.body).toHaveLength(1);
    });
  });

  describe('PATCH /api/sessions/:id', () => {
    it('updates session title and lock', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'Original' });

      const res = await request(app)
        .patch(`/api/sessions/${createRes.body.id}`)
        .send({ title: 'Updated', lock: true });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.lock).toBe(true);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('deletes a queued session', async () => {
      repo.updateSettings({ maxConcurrentSessions: 0 });
      // Create session that will be queued (0 max sessions means nothing activates via auto)
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app).delete(`/api/sessions/${session.id}`);
      expect(res.status).toBe(204);
    });

    it('rejects deleting active session', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app).delete(`/api/sessions/${createRes.body.id}`);
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/sessions/:id/kill', () => {
    it('kills an active session', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app).post(`/api/sessions/${createRes.body.id}/kill`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/sessions/:id/input', () => {
    it('sends input to an active session', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${createRes.body.id}/input`)
        .send({ text: 'yes\n' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('rejects input for non-active session', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/input`)
        .send({ text: 'hello' });

      expect(res.status).toBe(409);
    });
  });
});
