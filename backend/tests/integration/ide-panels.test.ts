import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { createFilesRouter } from '../../src/api/routes/files.js';
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

describe('IDE Panels API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
    const db = createTestDb();
    repo = new Repository(db);
    const ptySpawner = createMockPtySpawner();
    sessionManager = new SessionManager(repo, ptySpawner);
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(repo, sessionManager));
    app.use('/api/sessions', createFilesRouter(repo));
  });

  afterEach(() => {
    sessionManager.destroy();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Panel State', () => {
    it('returns 404 for session with no saved panel state', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const res = await request(app).get(`/api/sessions/${session.id}/panel-state`);
      expect(res.status).toBe(404);
    });

    it('saves and retrieves panel state', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const putRes = await request(app)
        .put(`/api/sessions/${session.id}/panel-state`)
        .send({
          activePanel: 'files',
          fileTabs: ['src/index.ts'],
          activeTabIndex: 0,
          tabScrollPositions: { 'src/index.ts': { line: 42, column: 0 } },
          gitScrollPosition: 0,
          previewUrl: '',
          panelWidthPercent: 40,
        });
      expect(putRes.status).toBe(200);
      expect(putRes.body.success).toBe(true);

      const getRes = await request(app).get(`/api/sessions/${session.id}/panel-state`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.activePanel).toBe('files');
      expect(getRes.body.fileTabs).toEqual(['src/index.ts']);
    });

    it('rejects invalid activePanel', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const res = await request(app)
        .put(`/api/sessions/${session.id}/panel-state`)
        .send({
          activePanel: 'invalid',
          fileTabs: [],
          activeTabIndex: 0,
          tabScrollPositions: {},
          gitScrollPosition: 0,
          previewUrl: '',
          panelWidthPercent: 40,
        });
      expect(res.status).toBe(400);
    });

    it('rejects panelWidthPercent outside 20-80', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const res = await request(app)
        .put(`/api/sessions/${session.id}/panel-state`)
        .send({
          activePanel: 'files',
          fileTabs: [],
          activeTabIndex: 0,
          tabScrollPositions: {},
          gitScrollPosition: 0,
          previewUrl: '',
          panelWidthPercent: 90,
        });
      expect(res.status).toBe(400);
    });

    it('cascades panel state delete when session is deleted', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      await request(app)
        .put(`/api/sessions/${session.id}/panel-state`)
        .send({
          activePanel: 'files',
          fileTabs: [],
          activeTabIndex: 0,
          tabScrollPositions: {},
          gitScrollPosition: 0,
          previewUrl: '',
          panelWidthPercent: 40,
        });

      repo.completeSession(session.id, null);
      await request(app).delete(`/api/sessions/${session.id}`);

      // Session deleted, panel state should be gone
      expect(repo.getPanelState(session.id)).toBeNull();
    });
  });

  describe('Comments', () => {
    it('creates a comment and returns 201', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      const sessionId = session.id;

      const res = await request(app)
        .post(`/api/sessions/${sessionId}/comments`)
        .send({
          filePath: 'src/App.tsx',
          startLine: 42,
          endLine: 45,
          codeSnippet: 'const count = users.length;',
          commentText: 'Rename this variable',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.filePath).toBe('src/App.tsx');
      expect(res.body.commentText).toBe('Rename this variable');
      // Comments are always created as 'pending' — use deliver endpoint to send
      expect(res.body.status).toBe('pending');
    });

    it('lists comments ordered by createdAt', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      repo.createComment({
        sessionId: session.id,
        filePath: 'a.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'First',
      });
      repo.createComment({
        sessionId: session.id,
        filePath: 'b.ts',
        startLine: 5,
        endLine: 5,
        codeSnippet: 'code',
        commentText: 'Second',
      });

      const res = await request(app).get(`/api/sessions/${session.id}/comments`);
      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(2);
      expect(res.body.comments[0].commentText).toBe('First');
    });

    it('creates pending comment for inactive session', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });
      // Session is queued (inactive)

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'src/utils.ts',
          startLine: 10,
          endLine: 10,
          codeSnippet: 'export function foo() {',
          commentText: 'Rename this function',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });

    it('rejects filePath with path traversal', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: '../../../etc/passwd',
          startLine: 1,
          endLine: 1,
          codeSnippet: 'code',
          commentText: 'comment',
        });

      expect(res.status).toBe(400);
    });

    it('rejects empty commentText', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'a.ts',
          startLine: 1,
          endLine: 1,
          codeSnippet: 'code',
          commentText: '',
        });

      expect(res.status).toBe(400);
    });

    it('rejects endLine < startLine', async () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const res = await request(app)
        .post(`/api/sessions/${session.id}/comments`)
        .send({
          filePath: 'a.ts',
          startLine: 10,
          endLine: 5,
          codeSnippet: 'code',
          commentText: 'comment',
        });

      expect(res.status).toBe(400);
    });

    it('delivers pending comments', async () => {
      const dir = path.join(tmpDir, 'p1');
      fs.mkdirSync(dir, { recursive: true });
      const created = sessionManager.createSession({ workingDirectory: dir, title: 'S1' });
      await sessionManager.activateSession(created.id);
      const sessionId = created.id;

      // Create comments directly in repo as pending
      repo.createComment({
        sessionId,
        filePath: 'a.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Pending 1',
      });
      repo.createComment({
        sessionId,
        filePath: 'b.ts',
        startLine: 5,
        endLine: 5,
        codeSnippet: 'code',
        commentText: 'Pending 2',
      });

      const res = await request(app).post(`/api/sessions/${sessionId}/comments/deliver`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.delivered).toHaveLength(2);
    });

    it('deletes comments from DB after successful delivery (ephemeral)', async () => {
      const dir = path.join(tmpDir, 'p1');
      fs.mkdirSync(dir, { recursive: true });
      const created = sessionManager.createSession({ workingDirectory: dir, title: 'S1' });
      await sessionManager.activateSession(created.id);
      const sessionId = created.id;

      repo.createComment({
        sessionId,
        filePath: 'a.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Ephemeral comment',
      });

      // Verify comment exists before delivery
      const before = repo.getComments(sessionId);
      expect(before).toHaveLength(1);

      await request(app).post(`/api/sessions/${sessionId}/comments/deliver`);

      // After delivery, comments should be deleted from DB
      const after = repo.getComments(sessionId);
      expect(after).toHaveLength(0);
    });

    it('deleteCommentsByIds removes specific comments', () => {
      const session = repo.createSession({ workingDirectory: path.join(tmpDir, 'p1'), title: 'S1' });

      const c1 = repo.createComment({
        sessionId: session.id,
        filePath: 'a.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'code',
        commentText: 'Comment 1',
      });
      const c2 = repo.createComment({
        sessionId: session.id,
        filePath: 'b.ts',
        startLine: 2,
        endLine: 2,
        codeSnippet: 'code',
        commentText: 'Comment 2',
      });
      repo.createComment({
        sessionId: session.id,
        filePath: 'c.ts',
        startLine: 3,
        endLine: 3,
        codeSnippet: 'code',
        commentText: 'Comment 3',
      });

      // Delete only first two
      const deleted = repo.deleteCommentsByIds([c1.id, c2.id]);
      expect(deleted).toBe(2);

      // Third comment should remain
      const remaining = repo.getComments(session.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].commentText).toBe('Comment 3');
    });

    it('deleteCommentsByIds returns 0 for empty array', () => {
      const deleted = repo.deleteCommentsByIds([]);
      expect(deleted).toBe(0);
    });
  });

  describe('File Save', () => {
    it('saves file content via PUT', async () => {
      const dir = path.join(tmpDir, 'save-test');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'hello.txt'), 'original', 'utf-8');

      const session = repo.createSession({ workingDirectory: dir, title: 'Save Test' });

      const res = await request(app)
        .put(`/api/sessions/${session.id}/files/content`)
        .send({ path: 'hello.txt', content: 'modified content' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const written = fs.readFileSync(path.join(dir, 'hello.txt'), 'utf-8');
      expect(written).toBe('modified content');
    });

    it('rejects path traversal in file save', async () => {
      const dir = path.join(tmpDir, 'save-traverse');
      fs.mkdirSync(dir, { recursive: true });

      const session = repo.createSession({ workingDirectory: dir, title: 'Traverse Test' });

      const res = await request(app)
        .put(`/api/sessions/${session.id}/files/content`)
        .send({ path: '../../../etc/passwd', content: 'hacked' });

      expect(res.status).toBe(400);
    });

    it('rejects missing path or content', async () => {
      const dir = path.join(tmpDir, 'save-missing');
      fs.mkdirSync(dir, { recursive: true });

      const session = repo.createSession({ workingDirectory: dir, title: 'Missing Test' });

      const res = await request(app)
        .put(`/api/sessions/${session.id}/files/content`)
        .send({ path: 'hello.txt' });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .put('/api/sessions/00000000-0000-0000-0000-000000000000/files/content')
        .send({ path: 'hello.txt', content: 'test' });

      expect(res.status).toBe(404);
    });
  });
});
