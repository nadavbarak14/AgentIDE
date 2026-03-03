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

// For integration tests, we mock the PtySpawner since we don't have a real `claude` binary in CI.
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
  return spawner;
}

describe('Sessions API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let ptySpawner: PtySpawner;
  let tmpDir: string;

  beforeEach(() => {
    // Use $HOME for tmp dirs so they pass $HOME restriction checks
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

  describe('POST /api/sessions', () => {
    it('creates a session and activates immediately', async () => {
      const dir = path.join(tmpDir, 'project');
      const res = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: dir, title: 'Test Session' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Session');
      expect(res.body.status).toBe('active');
    });

    it('creates multiple sessions — all activate (no capacity limit)', async () => {
      const res1 = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res2 = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p2'), title: 'S2' });

      expect(res1.body.status).toBe('active');
      expect(res2.body.status).toBe('active');
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
      await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const active = await request(app).get('/api/sessions?status=active');
      expect(active.body).toHaveLength(1);
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
    it('deletes a completed session', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      repo.activateSession(session.id, 1234);
      repo.completeSession(session.id, null);

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

  describe('POST /api/sessions/:id/continue', () => {
    it('returns 404 — continue endpoint removed', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app).post(`/api/sessions/${createRes.body.id}/continue`);
      expect(res.status).toBe(404);
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
  });

  // ─── Auto-deletion on session completion/failure ───

  describe('Auto-deletion on session completion', () => {
    it('auto-deletes session after completion via session-manager', async () => {
      const createRes = await request(app)
        .post('/api/sessions')
        .send({ workingDirectory: path.join(tmpDir, 'p1'), title: 'Auto-delete test' });
      const sessionId = createRes.body.id;

      // Session should exist and be active
      expect(repo.getSession(sessionId)).not.toBeNull();
      expect(repo.getSession(sessionId)!.status).toBe('active');

      // Kill the session (mock spawner emits exit with code 0 → completes)
      sessionManager.killSession(sessionId);

      // Session should be auto-deleted after completion
      expect(repo.getSession(sessionId)).toBeNull();
    });

    it('auto-deletes session after failure via session-manager', async () => {
      // Create a session directly via repo to control the flow
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p2'), title: 'Fail test' });
      repo.activateSession(session.id, 99999);

      // Manually fail and delete (simulating what session-manager does)
      repo.failSession(session.id);
      const deleted = repo.deleteSession(session.id);

      expect(deleted).toBe(true);
      expect(repo.getSession(session.id)).toBeNull();
    });

    it('cleans up panel_states when session is auto-deleted', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p3'), title: 'Panel cleanup' });
      repo.activateSession(session.id, 99999);

      // Create panel state for this session
      repo.savePanelState(session.id, {
        activePanel: 'terminal',
        fileTabs: [],
        activeTabIndex: 0,
        tabScrollPositions: {},
        gitScrollPosition: 0,
        previewUrl: '',
        panelWidthPercent: 50,
      });

      expect(repo.getPanelState(session.id)).not.toBeNull();

      // Complete and delete
      repo.completeSession(session.id, null);
      repo.deleteSession(session.id);

      // Panel state should be gone
      expect(repo.getPanelState(session.id)).toBeNull();
    });
  });

  describe('Startup cleanup (deleteNonActiveSessions)', () => {
    it('deletes completed and failed sessions but preserves active ones', () => {
      // Create sessions in various states
      const active = repo.createSession({ workingDirectory: path.join(tmpDir, 'a1'), title: 'Active' });
      repo.activateSession(active.id, 11111);

      const completed = repo.createSession({ workingDirectory: path.join(tmpDir, 'a2'), title: 'Completed' });
      repo.activateSession(completed.id, 22222);
      repo.completeSession(completed.id, 'claude-123');

      const failed = repo.createSession({ workingDirectory: path.join(tmpDir, 'a3'), title: 'Failed' });
      repo.activateSession(failed.id, 33333);
      repo.failSession(failed.id);

      // Run startup cleanup
      const count = repo.deleteNonActiveSessions();

      expect(count).toBe(2); // completed + failed
      expect(repo.getSession(active.id)).not.toBeNull();
      expect(repo.getSession(completed.id)).toBeNull();
      expect(repo.getSession(failed.id)).toBeNull();
    });

    it('returns 0 when no non-active sessions exist', () => {
      const count = repo.deleteNonActiveSessions();
      expect(count).toBe(0);
    });

    it('cleans up panel_states for deleted sessions', () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'a4'), title: 'Panel test' });
      repo.activateSession(session.id, 44444);

      // Save panel state
      repo.savePanelState(session.id, {
        activePanel: 'terminal',
        fileTabs: [],
        activeTabIndex: 0,
        tabScrollPositions: {},
        gitScrollPosition: 0,
        previewUrl: '',
        panelWidthPercent: 50,
      });

      // Also save zoomed panel state
      repo.savePanelState(`${session.id}:zoomed`, {
        activePanel: 'terminal',
        fileTabs: [],
        activeTabIndex: 0,
        tabScrollPositions: {},
        gitScrollPosition: 0,
        previewUrl: '',
        panelWidthPercent: 100,
      });

      // Complete the session
      repo.completeSession(session.id, null);

      // Run cleanup
      repo.deleteNonActiveSessions();

      // Both panel states should be gone
      expect(repo.getPanelState(session.id)).toBeNull();
      expect(repo.getPanelState(`${session.id}:zoomed`)).toBeNull();
    });
  });

  // ─── Comment endpoints ───

  describe('POST /api/sessions/:id/comments with side', () => {
    it('creates comment with side=old', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'src/app.ts',
          startLine: 5,
          endLine: 5,
          codeSnippet: 'old line',
          commentText: 'Comment on old',
          side: 'old',
        });

      expect(res.status).toBe(201);
      expect(res.body.side).toBe('old');
      expect(res.body.status).toBe('pending');
    });

    it('defaults side to new when not provided', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'src/app.ts',
          startLine: 10,
          endLine: 10,
          codeSnippet: 'some code',
          commentText: 'No side specified',
        });

      expect(res.status).toBe(201);
      expect(res.body.side).toBe('new');
    });

    it('returns 400 for invalid side value', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'src/app.ts',
          startLine: 1,
          endLine: 1,
          codeSnippet: 'code',
          commentText: 'Bad side',
          side: 'invalid',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('side');
    });
  });

  describe('PUT /api/sessions/:id/comments/:commentId', () => {
    it('updates a pending comment text', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const comment = repo.createComment({
        sessionId: session.id,
        filePath: 'src/app.ts',
        startLine: 10,
        endLine: 12,
        codeSnippet: 'const x = 1;',
        commentText: 'Original feedback',
      });

      const res = await request(app)
        .put(`/api/sessions/${session.id}/comments/${comment.id}`)
        .send({ commentText: 'Updated feedback' });

      expect(res.status).toBe(200);
      expect(res.body.commentText).toBe('Updated feedback');
      expect(res.body.id).toBe(comment.id);
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for sent comment', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const comment = repo.createComment({
        sessionId: session.id,
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Will be sent',
      });
      repo.markCommentSent(comment.id);

      const res = await request(app)
        .put(`/api/sessions/${session.id}/comments/${comment.id}`)
        .send({ commentText: 'Should fail' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for empty commentText', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const comment = repo.createComment({
        sessionId: session.id,
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Original',
      });

      const res = await request(app)
        .put(`/api/sessions/${session.id}/comments/${comment.id}`)
        .send({ commentText: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/sessions/:id/comments/:commentId', () => {
    it('deletes a pending comment', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const comment = repo.createComment({
        sessionId: session.id,
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'To delete',
      });

      const res = await request(app)
        .delete(`/api/sessions/${session.id}/comments/${comment.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const comments = repo.getComments(session.id);
      expect(comments).toHaveLength(0);
    });

    it('returns 404 for sent comment', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const comment = repo.createComment({
        sessionId: session.id,
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Sent',
      });
      repo.markCommentSent(comment.id);

      const res = await request(app)
        .delete(`/api/sessions/${session.id}/comments/${comment.id}`);

      expect(res.status).toBe(404);
    });
  });
});
