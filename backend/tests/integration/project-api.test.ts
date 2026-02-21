import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { ProjectService } from '../../src/services/project-service.js';
import { createProjectsRouter } from '../../src/api/routes/projects.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { createDirectoriesRouter } from '../../src/api/routes/directories.js';
import { QueueManager } from '../../src/services/queue-manager.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';
import { SessionManager } from '../../src/services/session-manager.js';

function createMockPtySpawner(): PtySpawner {
  const spawner = new PtySpawner();
  spawner.spawn = function (sessionId: string) {
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

describe('Project API', () => {
  let app: express.Express;
  let repo: Repository;
  let projectService: ProjectService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
    const db = createTestDb();
    repo = new Repository(db);
    // Ensure a local worker exists (like hub-entry does at startup)
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 2);
    }
    projectService = new ProjectService(repo);

    app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectsRouter(repo, projectService));
    app.use('/api/directories', createDirectoriesRouter());
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getLocalWorkerId(): string {
    const worker = repo.getLocalWorker();
    if (!worker) throw new Error('Local worker not found');
    return worker.id;
  }

  describe('GET /api/projects', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.projects).toEqual([]);
    });

    it('returns projects enriched with worker info', async () => {
      const workerId = getLocalWorkerId();
      const homeDir = os.homedir();
      repo.createProject({
        workerId,
        directoryPath: path.join(homeDir, 'test-project'),
        displayName: 'Test',
      });

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.projects[0].workerName).toBeTruthy();
      expect(res.body.projects[0].workerType).toBe('local');
      expect(res.body.projects[0].workerStatus).toBe('connected');
    });

    it('filters by workerId', async () => {
      const workerId = getLocalWorkerId();
      const homeDir = os.homedir();
      repo.createProject({
        workerId,
        directoryPath: path.join(homeDir, 'test-project'),
        displayName: 'Test',
      });

      const res = await request(app).get(`/api/projects?workerId=${workerId}`);
      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(1);

      const res2 = await request(app).get('/api/projects?workerId=nonexistent');
      expect(res2.status).toBe(200);
      expect(res2.body.projects).toHaveLength(0);
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project', async () => {
      const workerId = getLocalWorkerId();
      const homeDir = os.homedir();
      const res = await request(app)
        .post('/api/projects')
        .send({
          workerId,
          directoryPath: path.join(homeDir, 'new-project'),
          displayName: 'New Project',
        });

      expect(res.status).toBe(201);
      expect(res.body.displayName).toBe('New Project');
      expect(res.body.workerId).toBe(workerId);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ displayName: 'Missing fields' });

      expect(res.status).toBe(400);
    });

    it('rejects non-existent worker', async () => {
      const homeDir = os.homedir();
      const res = await request(app)
        .post('/api/projects')
        .send({
          workerId: 'nonexistent-worker-id',
          directoryPath: path.join(homeDir, 'test'),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Worker not found');
    });

    it('rejects path outside $HOME for local worker', async () => {
      const workerId = getLocalWorkerId();
      const res = await request(app)
        .post('/api/projects')
        .send({
          workerId,
          directoryPath: '/tmp/outside-home',
          displayName: 'Rejected',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('home directory');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('updates project displayName', async () => {
      const workerId = getLocalWorkerId();
      const homeDir = os.homedir();
      const project = repo.createProject({
        workerId,
        directoryPath: path.join(homeDir, 'test'),
        displayName: 'Test',
      });

      const res = await request(app)
        .patch(`/api/projects/${project.id}`)
        .send({ displayName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Updated Name');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app)
        .patch('/api/projects/00000000-0000-0000-0000-000000000000')
        .send({ displayName: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('deletes a project', async () => {
      const workerId = getLocalWorkerId();
      const homeDir = os.homedir();
      const project = repo.createProject({
        workerId,
        directoryPath: path.join(homeDir, 'test'),
        displayName: 'Test',
      });

      const res = await request(app).delete(`/api/projects/${project.id}`);
      expect(res.status).toBe(204);

      // Verify it's gone
      const check = await request(app).get('/api/projects');
      expect(check.body.projects).toHaveLength(0);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app).delete('/api/projects/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });
});

describe('Session API — $HOME restriction', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionManager: SessionManager;
  let projectService: ProjectService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-test-'));
    const db = createTestDb();
    repo = new Repository(db);
    // Ensure a local worker exists (like hub-entry does at startup)
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 2);
    }
    const ptySpawner = createMockPtySpawner();
    const queueManager = new QueueManager(repo);
    sessionManager = new SessionManager(repo, ptySpawner, queueManager);
    projectService = new ProjectService(repo);

    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionsRouter(repo, sessionManager, projectService));
  });

  afterEach(() => {
    sessionManager.destroy();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects session creation with directory outside $HOME', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: '/tmp/evil-dir', title: 'Evil Session' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('home directory');
  });

  it('allows session creation with directory inside $HOME', async () => {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, `c3-test-session-${Date.now()}`);

    const res = await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Good Session' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Good Session');

    // Cleanup
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auto-tracks project after session creation', async () => {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, `c3-test-track-${Date.now()}`);

    await request(app)
      .post('/api/sessions')
      .send({ workingDirectory: dir, title: 'Tracked Session' });

    const projects = repo.listProjects();
    const found = projects.find((p) => p.directoryPath === path.resolve(dir));
    expect(found).toBeTruthy();

    // Cleanup
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Directories API — $HOME restriction', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/directories', createDirectoriesRouter());
  });

  it('rejects browsing outside $HOME', async () => {
    const res = await request(app).get('/api/directories?path=/tmp');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('home directory');
  });

  it('allows browsing within $HOME', async () => {
    const res = await request(app).get(`/api/directories?path=${os.homedir()}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
  });
});
