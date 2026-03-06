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

// Mock PtySpawner — claude binary not available in CI
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

describe('Session Flags API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let ptySpawner: PtySpawner;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.c3-test-flags-'));
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

  it('creates a session with flags and returns them in the response', async () => {
    const dir = path.join(tmpDir, 'project1');
    const res = await request(app)
      .post('/api/sessions')
      .send({
        workingDirectory: dir,
        title: 'Flagged Session',
        flags: '--dangerously-skip-permissions',
      });

    expect(res.status).toBe(201);
    expect(res.body.flags).toBe('--dangerously-skip-permissions');
    expect(res.body.title).toBe('Flagged Session');
  });

  it('returns empty flags string when no flags provided', async () => {
    const dir = path.join(tmpDir, 'project2');
    const res = await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'No Flags' });

    expect(res.status).toBe(201);
    expect(res.body.flags).toBe('');
  });

  it('GET /api/sessions/:id includes flags', async () => {
    const dir = path.join(tmpDir, 'project3');
    const createRes = await request(app)
      .post('/api/sessions')
      .send({
        workingDirectory: dir,
        title: 'Get Test',
        flags: '--verbose --model opus',
      });

    await request(app).get(`/api/sessions/${createRes.body.id}`);
    // The sessions list endpoint returns an array, so use list
    const listRes = await request(app).get('/api/sessions');

    expect(listRes.status).toBe(200);
    const session = listRes.body.find((s: { id: string }) => s.id === createRes.body.id);
    expect(session).toBeDefined();
    expect(session.flags).toBe('--verbose --model opus');
  });

  it('treats non-string flags as empty string', async () => {
    const dir = path.join(tmpDir, 'project4');
    const res = await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Bad Flags', flags: 123 });

    expect(res.status).toBe(201);
    expect(res.body.flags).toBe('');
  });

  it('default session (no flags) spawns fresh — no --continue in args', async () => {
    let capturedArgs: string[] | undefined;
    const origSpawn = ptySpawner.spawn.bind(ptySpawner);
    ptySpawner.spawn = function (sessionId: string, workingDirectory: string, args?: string[], enabledExtensions?: string[]) {
      capturedArgs = args;
      return origSpawn(sessionId, workingDirectory, args, enabledExtensions);
    };

    const dir = path.join(tmpDir, 'default-session');
    await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Default' });

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs).not.toContain('--continue');
    expect(capturedArgs).not.toContain('--resume');
  });

  it('continueLatest=true passes --continue to spawn', async () => {
    let capturedArgs: string[] | undefined;
    const origSpawn = ptySpawner.spawn.bind(ptySpawner);
    ptySpawner.spawn = function (sessionId: string, workingDirectory: string, args?: string[], enabledExtensions?: string[]) {
      capturedArgs = args;
      return origSpawn(sessionId, workingDirectory, args, enabledExtensions);
    };

    const dir = path.join(tmpDir, 'continue-session');
    await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Continue', continueLatest: true });

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs![0]).toBe('--continue');
  });

  it('resume=true passes --resume to spawn', async () => {
    let capturedArgs: string[] | undefined;
    const origSpawn = ptySpawner.spawn.bind(ptySpawner);
    ptySpawner.spawn = function (sessionId: string, workingDirectory: string, args?: string[], enabledExtensions?: string[]) {
      capturedArgs = args;
      return origSpawn(sessionId, workingDirectory, args, enabledExtensions);
    };

    const dir = path.join(tmpDir, 'resume-session');
    await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Resume', resume: true });

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs![0]).toBe('--resume');
  });
});
