import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { SessionManager } from '../../src/services/session-manager.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';

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

describe('Crash Recovery System Tests', () => {
  let repo: Repository;
  let sessionManager: SessionManager;
  let ptySpawner: PtySpawner;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-crash-sys-'));
    const db = createTestDb();
    repo = new Repository(db);
    repo.createLocalWorker('Local', 5);
    ptySpawner = createMockPtySpawner();
    sessionManager = new SessionManager(repo, ptySpawner);
  });

  afterEach(() => {
    sessionManager.destroy();
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('full crash recovery lifecycle', () => {
    it('crash marks local sessions as crashed and preserves scrollback', () => {
      // Phase 1: Hub running, sessions active
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'Local Session 1', workingDirectory: path.join(tmpDir, 'p1') });
      const s2 = repo.createSession({ title: 'Local Session 2', workingDirectory: path.join(tmpDir, 'p2') });

      // Create scrollback files
      const sb1 = path.join(tmpDir, `${s1.id}.scrollback`);
      const sb2 = path.join(tmpDir, `${s2.id}.scrollback`);
      fs.writeFileSync(sb1, 'Session 1 output\r\nLine 2\r\n');
      fs.writeFileSync(sb2, 'Session 2 output\r\nAnother line\r\n');
      repo.setSessionScrollback(s1.id, sb1);
      repo.setSessionScrollback(s2.id, sb2);

      // Phase 2: Hub crashes (hub_status stays 'running')
      // ... process killed, nothing happens ...

      // Phase 3: Hub restarts, detects crash
      const previousStatus = repo.getHubStatus();
      expect(previousStatus).toBe('running'); // Crash detected
      const wasCrash = previousStatus === 'running';
      expect(wasCrash).toBe(true);

      // Phase 4: Recovery logic runs
      repo.setHubStatus('running'); // Set running for new session
      sessionManager.resumeSessions(ptySpawner, wasCrash);

      // Phase 5: Verify state
      const sessions = repo.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.every(s => s.status === 'crashed')).toBe(true);

      // Scrollback files still exist
      expect(fs.existsSync(sb1)).toBe(true);
      expect(fs.existsSync(sb2)).toBe(true);

      // Scrollback content preserved
      expect(fs.readFileSync(sb1, 'utf-8')).toContain('Session 1 output');
      expect(fs.readFileSync(sb2, 'utf-8')).toContain('Session 2 output');

      // deleteNonActiveSessions does NOT clean up crashed sessions
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(0);
      expect(repo.listSessions()).toHaveLength(2);
    });

    it('crashed sessions can be dismissed by user', () => {
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'Session', workingDirectory: path.join(tmpDir, 'p1') });

      // Crash
      sessionManager.resumeSessions(ptySpawner, true);
      expect(repo.getSession(s1.id)?.status).toBe('crashed');

      // User dismisses the crashed session
      repo.deleteSession(s1.id);
      expect(repo.getSession(s1.id)).toBeNull();
    });

    it('mixed active and completed sessions: only active become crashed on crash', () => {
      repo.setHubStatus('running');
      const active = repo.createSession({ title: 'Active', workingDirectory: path.join(tmpDir, 'p1') });
      const completed = repo.createSession({ title: 'Completed', workingDirectory: path.join(tmpDir, 'p2') });
      repo.completeSession(completed.id, null);

      // Crash recovery
      sessionManager.resumeSessions(ptySpawner, true);

      expect(repo.getSession(active.id)?.status).toBe('crashed');
      expect(repo.getSession(completed.id)?.status).toBe('completed');
    });
  });

  describe('clean shutdown lifecycle', () => {
    it('clean shutdown marks sessions crashed for tmux recovery, then completed after failed recovery', () => {
      // Phase 1: Hub running with active sessions
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });
      const s2 = repo.createSession({ title: 'S2', workingDirectory: path.join(tmpDir, 'p2') });

      // Phase 2: Clean shutdown — sessions marked crashed for tmux recovery attempt
      repo.setHubStatus('stopped');
      sessionManager.resumeSessions(ptySpawner, false); // Not a crash
      expect(repo.getSession(s1.id)?.status).toBe('crashed');
      expect(repo.getSession(s2.id)?.status).toBe('crashed');

      // Phase 3: Recovery attempt — no tmux available, sessions marked completed
      ptySpawner.reattachSession = () => null;
      sessionManager.recoverCrashedLocalSessions();
      expect(repo.getSession(s1.id)?.status).toBe('completed');
      expect(repo.getSession(s2.id)?.status).toBe('completed');

      // Phase 4: Delete non-active
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(2);

      // Phase 5: Verify empty dashboard
      expect(repo.listSessions()).toHaveLength(0);
      expect(repo.getHubStatus()).toBe('stopped');
    });

    it('restart after clean shutdown shows no sessions after recovery', () => {
      // Phase 1: Full lifecycle — run, shutdown cleanly, restart
      repo.setHubStatus('running');
      repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });

      // Clean shutdown — sessions marked crashed for recovery
      repo.setHubStatus('stopped');
      sessionManager.resumeSessions(ptySpawner, false);

      // Recovery attempt — no tmux, sessions completed
      ptySpawner.reattachSession = () => null;
      sessionManager.recoverCrashedLocalSessions();
      repo.deleteNonActiveSessions();

      // Phase 2: Restart detection
      const wasCrash = repo.getHubStatus() === 'running';
      expect(wasCrash).toBe(false);

      // Set running again
      repo.setHubStatus('running');

      // No sessions to recover
      expect(repo.listSessions()).toHaveLength(0);
      expect(repo.listSessions('crashed')).toHaveLength(0);
    });

    it('hub_status=stopped preserved across restart', () => {
      repo.setHubStatus('running');
      repo.setHubStatus('stopped');
      expect(repo.getHubStatus()).toBe('stopped');
    });
  });

  describe('local crash recovery via tmux', () => {
    it('recoverCrashedLocalSessions returns 0 when ptySpawner.reattachSession returns null', () => {
      // Crash: mark sessions as crashed
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'Local 1', workingDirectory: path.join(tmpDir, 'p1') });
      sessionManager.resumeSessions(ptySpawner, true);
      expect(repo.getSession(s1.id)?.status).toBe('crashed');

      // Mock reattachSession to return null (tmux dead)
      ptySpawner.reattachSession = () => null;

      const recovered = sessionManager.recoverCrashedLocalSessions();
      expect(recovered).toBe(0);

      // Session marked completed when tmux is dead (no longer left as crashed)
      expect(repo.getSession(s1.id)?.status).toBe('completed');
    });

    it('recoverCrashedLocalSessions re-activates session when reattach succeeds', () => {
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'Local 1', workingDirectory: path.join(tmpDir, 'p1') });
      sessionManager.resumeSessions(ptySpawner, true);
      expect(repo.getSession(s1.id)?.status).toBe('crashed');

      // Mock reattachSession to succeed
      ptySpawner.reattachSession = (sessionId: string) => ({
        pid: 12345,
        sessionId,
        write: () => {},
        resize: () => {},
        kill: () => {},
      });

      const recovered = sessionManager.recoverCrashedLocalSessions();
      expect(recovered).toBe(1);

      // Session is now active again
      const session = repo.getSession(s1.id)!;
      expect(session.status).toBe('active');
      expect(session.pid).toBe(12345);
    });

    it('does not attempt recovery for remote sessions', () => {
      // Create a remote worker
      const remoteWorker = repo.createWorker({
        name: 'Remote',
        sshHost: '10.0.0.1',
        sshUser: 'ubuntu',
        sshKeyPath: '/home/user/.ssh/id_rsa',
      });

      repo.setHubStatus('running');
      const remoteSession = repo.createSession({ title: 'Remote', workingDirectory: path.join(tmpDir, 'p1'), targetWorker: remoteWorker.id });
      sessionManager.resumeSessions(ptySpawner, true);

      // Mock reattachSession — should NOT be called for remote sessions
      let reattachCalled = false;
      ptySpawner.reattachSession = () => { reattachCalled = true; return null; };

      sessionManager.recoverCrashedLocalSessions();
      expect(reattachCalled).toBe(false);
      expect(repo.getSession(remoteSession.id)?.status).toBe('crashed');
    });
  });

  describe('crash then clean restart cycle', () => {
    it('crash → view crashed sessions → dismiss → clean shutdown', () => {
      // Crash
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });
      sessionManager.resumeSessions(ptySpawner, true);
      expect(repo.getSession(s1.id)?.status).toBe('crashed');

      // User views crashed session, then dismisses it
      repo.deleteSession(s1.id);

      // Clean shutdown
      repo.setHubStatus('stopped');
      repo.deleteNonActiveSessions();

      // Restart: no sessions, no crash
      expect(repo.getHubStatus()).toBe('stopped');
      expect(repo.listSessions()).toHaveLength(0);
    });

    it('crash → restart → new sessions work normally alongside crashed ones', () => {
      // Crash
      repo.setHubStatus('running');
      const crashed = repo.createSession({ title: 'Crashed', workingDirectory: path.join(tmpDir, 'p1') });
      sessionManager.resumeSessions(ptySpawner, true);
      expect(repo.getSession(crashed.id)?.status).toBe('crashed');

      // Restart (crash detected)
      repo.setHubStatus('running');

      // Create new session
      const newSession = repo.createSession({ title: 'New', workingDirectory: path.join(tmpDir, 'p2') });
      expect(newSession.status).toBe('active');

      // Both visible
      const all = repo.listSessions();
      expect(all).toHaveLength(2);
      expect(all.find(s => s.id === crashed.id)?.status).toBe('crashed');
      expect(all.find(s => s.id === newSession.id)?.status).toBe('active');
    });
  });
});
