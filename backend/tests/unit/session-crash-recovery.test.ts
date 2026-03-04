import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Repository } from '../../src/models/repository.js';
import { createTestDb, closeDb } from '../../src/models/db.js';
import type { Worker } from '../../src/models/types.js';

describe('Session Crash Recovery', () => {
  let repo: Repository;
  let localWorker: Worker;
  let remoteWorker: Worker;

  beforeEach(() => {
    createTestDb();
    repo = new Repository(require('better-sqlite3')(':memory:'));
    // Re-create with proper test DB
    const db = createTestDb();
    repo = new Repository(db);

    localWorker = repo.createLocalWorker('Local', 5);
    remoteWorker = repo.createWorker({
      name: 'Remote',
      sshHost: '10.0.0.1',
      sshUser: 'ubuntu',
      sshKeyPath: '/home/user/.ssh/id_rsa',
    });
  });

  afterEach(() => {
    closeDb();
  });

  describe('hub status flag', () => {
    it('defaults to stopped', () => {
      expect(repo.getHubStatus()).toBe('stopped');
    });

    it('can be set to running', () => {
      repo.setHubStatus('running');
      expect(repo.getHubStatus()).toBe('running');
    });

    it('can be set back to stopped', () => {
      repo.setHubStatus('running');
      repo.setHubStatus('stopped');
      expect(repo.getHubStatus()).toBe('stopped');
    });
  });

  describe('markSessionsCrashed', () => {
    it('marks all active sessions as crashed', () => {
      repo.createSession({ title: 'Session 1', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.createSession({ title: 'Session 2', workingDirectory: '/tmp/b', targetWorker: remoteWorker.id });

      const crashedCount = repo.markSessionsCrashed();
      expect(crashedCount).toBe(2);

      const sessions = repo.listSessions();
      expect(sessions.every(s => s.status === 'crashed')).toBe(true);
    });

    it('does not affect completed/failed sessions', () => {
      const s1 = repo.createSession({ title: 'Active', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const s2 = repo.createSession({ title: 'Completed', workingDirectory: '/tmp/b', targetWorker: localWorker.id });
      repo.completeSession(s2.id, null);

      const crashedCount = repo.markSessionsCrashed();
      expect(crashedCount).toBe(1);

      const active = repo.getSession(s1.id)!;
      expect(active.status).toBe('crashed');

      const completed = repo.getSession(s2.id)!;
      expect(completed.status).toBe('completed');
    });

    it('clears PID for crashed sessions', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.activateSession(session.id, 12345);

      repo.markSessionsCrashed();

      const crashed = repo.getSession(session.id)!;
      expect(crashed.status).toBe('crashed');
      expect(crashed.pid).toBeNull();
    });

    it('returns 0 when no active sessions exist', () => {
      expect(repo.markSessionsCrashed()).toBe(0);
    });
  });

  describe('crashSession', () => {
    it('marks a specific session as crashed', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.activateSession(session.id, 12345);

      const crashed = repo.crashSession(session.id);
      expect(crashed?.status).toBe('crashed');
      expect(crashed?.pid).toBeNull();
    });
  });

  describe('setCrashRecoveredAt', () => {
    it('sets crash_recovered_at timestamp', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.markSessionsCrashed();

      repo.setCrashRecoveredAt(session.id);

      // Verify the column was set (access raw DB to check)
      const row = (repo as any).db.prepare('SELECT crash_recovered_at FROM sessions WHERE id = ?').get(session.id) as { crash_recovered_at: string | null };
      expect(row.crash_recovered_at).toBeTruthy();
    });
  });

  describe('deleteNonActiveSessions excludes crashed', () => {
    it('does not delete crashed sessions', () => {
      const s1 = repo.createSession({ title: 'Active', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const s2 = repo.createSession({ title: 'Completed', workingDirectory: '/tmp/b', targetWorker: localWorker.id });
      const s3 = repo.createSession({ title: 'Crashed', workingDirectory: '/tmp/c', targetWorker: localWorker.id });

      repo.completeSession(s2.id, null);
      repo.crashSession(s3.id);

      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(1); // Only completed session deleted

      expect(repo.getSession(s1.id)?.status).toBe('active');
      expect(repo.getSession(s2.id)).toBeNull(); // Deleted
      expect(repo.getSession(s3.id)?.status).toBe('crashed'); // Preserved
    });
  });

  describe('deleteSession allows crashed deletion', () => {
    it('allows deleting crashed sessions', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      const deleted = repo.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(repo.getSession(session.id)).toBeNull();
    });

    it('still prevents deleting active sessions', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });

      const deleted = repo.deleteSession(session.id);
      expect(deleted).toBe(false);
      expect(repo.getSession(session.id)).toBeTruthy();
    });
  });

  describe('listSessions ordering', () => {
    it('orders crashed sessions after active but before completed', () => {
      const s1 = repo.createSession({ title: 'Active', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const s2 = repo.createSession({ title: 'Completed', workingDirectory: '/tmp/b', targetWorker: localWorker.id });
      const s3 = repo.createSession({ title: 'Crashed', workingDirectory: '/tmp/c', targetWorker: localWorker.id });

      repo.completeSession(s2.id, null);
      repo.crashSession(s3.id);

      const sessions = repo.listSessions();
      const statuses = sessions.map(s => s.status);

      // Active should come before crashed, crashed before completed
      const activeIdx = statuses.indexOf('active');
      const crashedIdx = statuses.indexOf('crashed');
      const completedIdx = statuses.indexOf('completed');

      expect(activeIdx).toBeLessThan(crashedIdx);
      expect(crashedIdx).toBeLessThan(completedIdx);
    });
  });

  describe('resumeSessions with crash detection', () => {
    it('marks active sessions as crashed when crash is detected', () => {
      // Simulate: create active sessions, then call markSessionsCrashed (what resumeSessions does on crash)
      repo.createSession({ title: 'Session 1', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.createSession({ title: 'Session 2', workingDirectory: '/tmp/b', targetWorker: remoteWorker.id });

      // Simulate crash detection
      repo.setHubStatus('running'); // Hub was running when it crashed
      const hubStatus = repo.getHubStatus();
      expect(hubStatus).toBe('running');

      // Mark sessions as crashed
      repo.markSessionsCrashed();

      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].status).toBe('crashed');
      expect(sessions[1].status).toBe('crashed');
    });

    it('marks active sessions as completed when clean shutdown detected', () => {
      const s1 = repo.createSession({ title: 'Session 1', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const s2 = repo.createSession({ title: 'Session 2', workingDirectory: '/tmp/b', targetWorker: localWorker.id });

      // Simulate clean shutdown detection
      repo.setHubStatus('stopped');
      const hubStatus = repo.getHubStatus();
      expect(hubStatus).toBe('stopped');

      // Normal resume behavior — mark as completed
      repo.completeSession(s1.id, null);
      repo.completeSession(s2.id, null);

      const sessions = repo.listSessions();
      expect(sessions.every(s => s.status === 'completed')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('session with no PID (mid-creation crash)', () => {
      // Session created but process never started (PID never set)
      const session = repo.createSession({ title: 'No PID', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      expect(session.pid).toBeNull();

      repo.markSessionsCrashed();

      const crashed = repo.getSession(session.id)!;
      expect(crashed.status).toBe('crashed');
      expect(crashed.pid).toBeNull();
    });

    it('rapid consecutive restarts: double crash detection', () => {
      // First crash
      repo.setHubStatus('running');
      repo.createSession({ title: 'S1', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.markSessionsCrashed();

      // Second crash (hub restarted but crashed again before cleanup)
      // No new active sessions, just crashed ones from before
      const crashedAgain = repo.markSessionsCrashed();
      expect(crashedAgain).toBe(0); // No active sessions to crash

      // The already-crashed session is still there
      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('crashed');
    });

    it('hub_status missing from settings on first run defaults to stopped', () => {
      // getHubStatus should return 'stopped' on fresh database
      // (already verified above, but this is the explicit first-run scenario)
      const db = createTestDb();
      const freshRepo = new Repository(db);
      expect(freshRepo.getHubStatus()).toBe('stopped');
    });

    it('markSessionsCrashed is idempotent for already-crashed sessions', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      // markSessionsCrashed only affects 'active' status
      const count = repo.markSessionsCrashed();
      expect(count).toBe(0);
      expect(repo.getSession(session.id)?.status).toBe('crashed');
    });

    it('deleteSession for crashed session with no scrollback path', () => {
      const session = repo.createSession({ title: 'No scrollback', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      // Should delete without errors even when no scrollback path is set
      const deleted = repo.deleteSession(session.id);
      expect(deleted).toBe(true);
    });

    it('multiple workers: crashed sessions maintain correct worker assignment', () => {
      const s1 = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const s2 = repo.createSession({ title: 'Remote', workingDirectory: '/tmp/b', targetWorker: remoteWorker.id });

      repo.markSessionsCrashed();

      const crashed1 = repo.getSession(s1.id)!;
      const crashed2 = repo.getSession(s2.id)!;
      expect(crashed1.workerId).toBe(localWorker.id);
      expect(crashed2.workerId).toBe(remoteWorker.id);
    });
  });

  describe('recoverCrashedLocalSessions', () => {
    it('crashed local sessions can be identified for recovery', () => {
      const session = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      // Verify the session is local
      const crashed = repo.getSession(session.id)!;
      const worker = repo.getWorker(crashed.workerId!);
      expect(worker?.type).toBe('local');
      expect(crashed.status).toBe('crashed');
    });

    it('filters local sessions from remote in crashed list', () => {
      const localSession = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      const remoteSession = repo.createSession({ title: 'Remote', workingDirectory: '/tmp/b', targetWorker: remoteWorker.id });

      repo.markSessionsCrashed();

      const crashedSessions = repo.listSessions('crashed');
      expect(crashedSessions).toHaveLength(2);

      // Can filter by worker type
      const localCrashed = crashedSessions.filter(s => {
        const w = repo.getWorker(s.workerId!);
        return w?.type === 'local';
      });
      const remoteCrashed = crashedSessions.filter(s => {
        const w = repo.getWorker(s.workerId!);
        return w?.type === 'remote';
      });

      expect(localCrashed).toHaveLength(1);
      expect(localCrashed[0].id).toBe(localSession.id);
      expect(remoteCrashed).toHaveLength(1);
      expect(remoteCrashed[0].id).toBe(remoteSession.id);
    });

    it('setCrashRecoveredAt works for local sessions', () => {
      const session = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);
      repo.setCrashRecoveredAt(session.id);

      const row = (repo as any).db.prepare('SELECT crash_recovered_at FROM sessions WHERE id = ?').get(session.id) as { crash_recovered_at: string | null };
      expect(row.crash_recovered_at).toBeTruthy();
    });

    it('recovered local session can be re-activated', () => {
      const session = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      // Simulate recovery: re-activate the session
      repo.activateSession(session.id, 99999);
      repo.setCrashRecoveredAt(session.id);

      const recovered = repo.getSession(session.id)!;
      expect(recovered.status).toBe('active');
      expect(recovered.pid).toBe(99999);
    });
  });

  describe('remote vs local session identification', () => {
    it('crashed remote sessions have workerId set', () => {
      const session = repo.createSession({ title: 'Remote', workingDirectory: '/tmp/a', targetWorker: remoteWorker.id });
      repo.crashSession(session.id);

      const crashed = repo.getSession(session.id)!;
      expect(crashed.workerId).toBe(remoteWorker.id);
      expect(crashed.status).toBe('crashed');

      // Can look up the worker to determine it's remote
      const worker = repo.getWorker(crashed.workerId!);
      expect(worker?.type).toBe('remote');
    });

    it('crashed local sessions have local workerId', () => {
      const session = repo.createSession({ title: 'Local', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(session.id);

      const crashed = repo.getSession(session.id)!;
      expect(crashed.workerId).toBe(localWorker.id);

      const worker = repo.getWorker(crashed.workerId!);
      expect(worker?.type).toBe('local');
    });
  });
});
