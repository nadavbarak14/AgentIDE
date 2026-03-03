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

describe('Scrollback API', () => {
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

  describe('GET /api/sessions/:id/scrollback', () => {
    it('returns scrollback content for a crashed session with scrollback', async () => {
      // Create session and set scrollback path
      const session = repo.createSession({ title: 'Crashed Session', workingDirectory: path.join(tmpDir, 'p1') });

      // Create a scrollback file
      const scrollbackPath = path.join(tmpDir, `${session.id}.scrollback`);
      const scrollbackContent = 'Hello from the terminal\r\nLine 2\r\nLine 3\r\n';
      fs.writeFileSync(scrollbackPath, scrollbackContent);

      // Set scrollback path and mark as crashed
      repo.setSessionScrollback(session.id, scrollbackPath);
      repo.crashSession(session.id);

      const res = await request(app).get(`/api/sessions/${session.id}/scrollback`);
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(session.id);
      expect(res.body.scrollback).toBe(scrollbackContent);
      expect(res.body.truncated).toBe(false);
    });

    it('returns 404 when session has no scrollback', async () => {
      const session = repo.createSession({ title: 'No Scrollback', workingDirectory: path.join(tmpDir, 'p1') });
      repo.crashSession(session.id);

      const res = await request(app).get(`/api/sessions/${session.id}/scrollback`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No scrollback');
    });

    it('returns 404 when session does not exist', async () => {
      const res = await request(app).get('/api/sessions/00000000-0000-0000-0000-000000000000/scrollback');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('returns 404 when scrollback file is missing on disk', async () => {
      const session = repo.createSession({ title: 'Missing File', workingDirectory: path.join(tmpDir, 'p1') });
      repo.setSessionScrollback(session.id, '/nonexistent/scrollback.txt');
      repo.crashSession(session.id);

      const res = await request(app).get(`/api/sessions/${session.id}/scrollback`);
      expect(res.status).toBe(404);
    });
  });
});
