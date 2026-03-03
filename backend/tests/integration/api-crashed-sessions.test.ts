import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';
import { SessionManager } from '../../src/services/session-manager.js';

function createMockPtySpawner(): PtySpawner {
  const spawner = new PtySpawner();
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
  return spawner;
}

describe('Crashed Sessions API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let ptySpawner: PtySpawner;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.c3-test-'));
    const db = createTestDb();
    repo = new Repository(db);
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 4);
    }
    ptySpawner = createMockPtySpawner();
    sessionManager = new SessionManager(repo, ptySpawner);
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(repo, sessionManager));
  });

  afterEach(() => {
    sessionManager.destroy();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/sessions — includes crashed sessions', () => {
    it('returns crashed sessions alongside active sessions', async () => {
      // Create two sessions
      const s1 = repo.createSession({ title: 'Session 1', workingDirectory: path.join(tmpDir, 'p1') });
      const s2 = repo.createSession({ title: 'Session 2', workingDirectory: path.join(tmpDir, 'p2') });

      // Mark one as crashed
      repo.crashSession(s2.id);

      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      const statuses = res.body.map((s: any) => s.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('crashed');
    });

    it('orders crashed sessions after active', async () => {
      const s1 = repo.createSession({ title: 'Active', workingDirectory: path.join(tmpDir, 'p1') });
      const s2 = repo.createSession({ title: 'Crashed', workingDirectory: path.join(tmpDir, 'p2') });
      repo.crashSession(s2.id);

      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);

      // Active should come before crashed
      expect(res.body[0].status).toBe('active');
      expect(res.body[1].status).toBe('crashed');
    });
  });

  describe('DELETE /api/sessions/:id — dismiss crashed session', () => {
    it('allows deleting/dismissing a crashed session', async () => {
      const session = repo.createSession({ title: 'Crashed Session', workingDirectory: path.join(tmpDir, 'p1') });
      repo.crashSession(session.id);

      const res = await request(app).delete(`/api/sessions/${session.id}`);
      expect(res.status).toBe(204);

      // Verify it's gone
      expect(repo.getSession(session.id)).toBeNull();
    });

    it('still prevents deleting active sessions', async () => {
      const session = repo.createSession({ title: 'Active', workingDirectory: path.join(tmpDir, 'p1') });

      const res = await request(app).delete(`/api/sessions/${session.id}`);
      expect(res.status).toBe(409);
    });
  });

  describe('Clean shutdown — no crashed sessions', () => {
    it('leaves no crashed sessions after clean shutdown simulation', () => {
      // Create active sessions
      repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });
      repo.createSession({ title: 'S2', workingDirectory: path.join(tmpDir, 'p2') });

      // Simulate clean shutdown: set hub_status=stopped, mark completed, delete non-active
      repo.setHubStatus('stopped');
      const active = repo.listSessions('active');
      for (const s of active) {
        repo.completeSession(s.id, null);
      }
      repo.deleteNonActiveSessions();

      // Verify no sessions remain
      const all = repo.listSessions();
      expect(all).toHaveLength(0);

      // Verify hub_status is stopped
      expect(repo.getHubStatus()).toBe('stopped');
    });

    it('crash recovery marks sessions as crashed, clean shutdown does not', () => {
      // Create active sessions
      repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });
      repo.createSession({ title: 'S2', workingDirectory: path.join(tmpDir, 'p2') });

      // Simulate crash: hub_status was 'running'
      repo.setHubStatus('running');
      expect(repo.getHubStatus()).toBe('running');

      // Mark as crashed
      repo.markSessionsCrashed();

      // Verify sessions are crashed
      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.every(s => s.status === 'crashed')).toBe(true);

      // deleteNonActiveSessions should NOT delete crashed sessions
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(0);
      expect(repo.listSessions()).toHaveLength(2);
    });
  });
});
