import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/services/session-manager.js';
import { Repository } from '../../src/models/repository.js';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';
import type { Worker, CreateSessionInput } from '../../src/models/types.js';

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

describe('SessionManager - Worker Lookup', () => {
  let repo: Repository;
  let sessionManager: SessionManager;
  let localWorker: Worker;
  let remoteWorker: Worker;

  beforeEach(() => {
    // Initialize fresh repository
    const db = createTestDb();
    repo = new Repository(db);

    // Create local worker
    localWorker = repo.createLocalWorker('Local Worker', 5);

    // Create remote worker
    remoteWorker = repo.createWorker({
      name: 'Remote Worker',
      sshHost: '192.168.1.100',
      sshUser: 'ubuntu',
      sshKeyPath: '/home/user/.ssh/id_rsa',
      maxSessions: 5,
    });

    // Mock PtySpawner
    const ptySpawner = createMockPtySpawner();

    sessionManager = new SessionManager(repo, ptySpawner);
  });

  afterEach(() => {
    closeDb();
  });

  describe('targetWorker defaulting', () => {
    it('defaults to local worker when targetWorker not specified', () => {
      const input: CreateSessionInput = {
        title: 'Test Session',
        workingDirectory: '/home/user/project',
        // targetWorker omitted
      };

      const session = sessionManager.createSession(input);

      expect(session.workerId).toBe(localWorker.id);
    });

    it('uses specified targetWorker when provided', () => {
      const input: CreateSessionInput = {
        title: 'Test Session',
        workingDirectory: '/opt/project',
        targetWorker: remoteWorker.id,
      };

      const session = sessionManager.createSession(input);

      expect(session.workerId).toBe(remoteWorker.id);
    });

    it('preserves explicit local worker selection', () => {
      const input: CreateSessionInput = {
        title: 'Test Session',
        workingDirectory: '/home/user/project',
        targetWorker: localWorker.id,
      };

      const session = sessionManager.createSession(input);

      expect(session.workerId).toBe(localWorker.id);
    });

    it('preserves explicit remote worker selection', () => {
      const input: CreateSessionInput = {
        title: 'Test Session',
        workingDirectory: '/opt/remote-project',
        targetWorker: remoteWorker.id,
      };

      const session = sessionManager.createSession(input);

      expect(session.workerId).toBe(remoteWorker.id);
    });
  });

  describe('worker type lookup', () => {
    it('creates session with local worker type', () => {
      const input: CreateSessionInput = {
        title: 'Local Session',
        workingDirectory: '/home/user/project',
        targetWorker: localWorker.id,
      };

      const session = sessionManager.createSession(input);
      const worker = repo.getWorker(session.workerId!);

      expect(worker).toBeDefined();
      expect(worker?.type).toBe('local');
    });

    it('creates session with remote worker type', () => {
      const input: CreateSessionInput = {
        title: 'Remote Session',
        workingDirectory: '/opt/project',
        targetWorker: remoteWorker.id,
      };

      const session = sessionManager.createSession(input);
      const worker = repo.getWorker(session.workerId!);

      expect(worker).toBeDefined();
      expect(worker?.type).toBe('remote');
      expect(worker?.sshHost).toBe('192.168.1.100');
    });
  });

  describe('session creation with worker context', () => {
    it('creates session with all worker metadata', () => {
      const input: CreateSessionInput = {
        title: 'Remote Session',
        workingDirectory: '/opt/webapp',
        targetWorker: remoteWorker.id,
      };

      const session = sessionManager.createSession(input);

      expect(session.id).toBeDefined();
      expect(session.title).toBe('Remote Session');
      expect(session.workingDirectory).toBe('/opt/webapp');
      expect(session.workerId).toBe(remoteWorker.id);
    });
  });
});
