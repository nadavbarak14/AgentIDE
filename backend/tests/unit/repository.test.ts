import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Repository', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  describe('Sessions', () => {
    it('creates a session in active state', () => {
      const session = repo.createSession({
        workingDirectory: '/home/user/project',
        title: 'Test Session',
      });
      expect(session.status).toBe('active');
      expect(session.title).toBe('Test Session');
      expect(session.workingDirectory).toBe('/home/user/project');
      expect(session.needsInput).toBe(false);
      expect(session.lock).toBe(false);
      expect(session.pid).toBeNull();
    });

    it('creates multiple sessions all in active state', () => {
      const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });
      const s3 = repo.createSession({ workingDirectory: '/p3', title: 'S3' });
      expect(s1.status).toBe('active');
      expect(s2.status).toBe('active');
      expect(s3.status).toBe('active');
    });

    it('lists sessions', () => {
      repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.createSession({ workingDirectory: '/p2', title: 'S2' });

      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('filters sessions by status', () => {
      const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.createSession({ workingDirectory: '/p2', title: 'S2' });
      repo.activateSession(s1.id, 1234);
      repo.completeSession(s1.id, null);

      const active = repo.listSessions('active');
      expect(active).toHaveLength(1);
      const completed = repo.listSessions('completed');
      expect(completed).toHaveLength(1);
    });

    it('activates a session', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      const activated = repo.activateSession(session.id, 5678);
      expect(activated!.status).toBe('active');
      expect(activated!.pid).toBe(5678);
      expect(activated!.startedAt).not.toBeNull();
    });

    it('completes a session and stores claude session id', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(session.id, 5678);
      const completed = repo.completeSession(session.id, 'claude-abc-123');
      expect(completed!.status).toBe('completed');
      expect(completed!.claudeSessionId).toBe('claude-abc-123');
      expect(completed!.pid).toBeNull();
      expect(completed!.completedAt).not.toBeNull();
    });

    it('fails a session', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(session.id, 5678);
      const failed = repo.failSession(session.id);
      expect(failed!.status).toBe('failed');
      expect(failed!.pid).toBeNull();
    });

    it('sets and clears needs_input flag', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(session.id, 5678);

      repo.setNeedsInput(session.id, true);
      const updated = repo.getSession(session.id);
      expect(updated!.needsInput).toBe(true);

      repo.setNeedsInput(session.id, false);
      const cleared = repo.getSession(session.id);
      expect(cleared!.needsInput).toBe(false);
    });

    it('counts active sessions correctly', () => {
      const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });
      repo.activateSession(s1.id, 1234);
      repo.activateSession(s2.id, 5678);
      expect(repo.countActiveSessions()).toBe(2);

      repo.completeSession(s1.id, null);
      expect(repo.countActiveSessions()).toBe(1);
    });

    it('deletes a non-active session', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(session.id, 5678);
      repo.completeSession(session.id, null);
      const deleted = repo.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(repo.getSession(session.id)).toBeNull();
    });

    it('does not delete an active session', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(session.id, 5678);
      const deleted = repo.deleteSession(session.id);
      expect(deleted).toBe(false);
      expect(repo.getSession(session.id)).not.toBeNull();
    });

    it('updates session title and lock', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      const updated = repo.updateSession(session.id, { title: 'Updated', lock: true });
      expect(updated!.title).toBe('Updated');
      expect(updated!.lock).toBe(true);
    });
  });

  describe('Workers', () => {
    it('creates a local worker', () => {
      const worker = repo.createLocalWorker('Laptop', 4);
      expect(worker.type).toBe('local');
      expect(worker.status).toBe('connected');
      expect(worker.maxSessions).toBe(4);
    });

    it('creates a remote worker', () => {
      const worker = repo.createWorker({
        name: 'VPS-01',
        sshHost: '192.168.1.100',
        sshUser: 'ubuntu',
        sshKeyPath: '/home/user/.ssh/id_rsa',
        maxSessions: 4,
      });
      expect(worker.type).toBe('remote');
      expect(worker.status).toBe('disconnected');
      expect(worker.sshHost).toBe('192.168.1.100');
    });

    it('lists all workers', () => {
      repo.createLocalWorker('Laptop', 2);
      repo.createWorker({
        name: 'VPS',
        sshHost: '10.0.0.1',
        sshUser: 'root',
        sshKeyPath: '/key',
      });
      const list = repo.listWorkers();
      expect(list).toHaveLength(2);
    });

    it('deletes a worker', () => {
      const worker = repo.createWorker({
        name: 'VPS',
        sshHost: '10.0.0.1',
        sshUser: 'root',
        sshKeyPath: '/key',
      });
      expect(repo.deleteWorker(worker.id)).toBe(true);
      expect(repo.getWorker(worker.id)).toBeNull();
    });

    it('updates worker status', () => {
      const worker = repo.createWorker({
        name: 'VPS',
        sshHost: '10.0.0.1',
        sshUser: 'root',
        sshKeyPath: '/key',
      });
      repo.updateWorkerStatus(worker.id, 'connected');
      const updated = repo.getWorker(worker.id);
      expect(updated!.status).toBe('connected');
      expect(updated!.lastHeartbeat).not.toBeNull();
    });
  });

  describe('Artifacts', () => {
    it('creates and lists artifacts for a session', () => {
      const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      const art = repo.createArtifact(session.id, 'image', '/tmp/output.png');
      expect(art.type).toBe('image');
      expect(art.path).toBe('/tmp/output.png');

      const artifacts = repo.listArtifacts(session.id);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].id).toBe(art.id);
    });
  });

  describe('Settings', () => {
    it('returns default settings', () => {
      const settings = repo.getSettings();
      expect(settings.maxVisibleSessions).toBe(4);
      expect(settings.autoApprove).toBe(false);
      expect(settings.gridLayout).toBe('auto');
      expect(settings.theme).toBe('dark');
    });

    it('updates settings partially', () => {
      const updated = repo.updateSettings({ theme: 'light' });
      expect(updated.theme).toBe('light');
      expect(updated.maxVisibleSessions).toBe(4); // unchanged
    });

    it('updates max_visible_sessions', () => {
      const updated = repo.updateSettings({ maxVisibleSessions: 3 });
      expect(updated.maxVisibleSessions).toBe(3);
    });
  });
});
