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
    it('clean shutdown marks sessions completed and deletes them', () => {
      // Phase 1: Hub running with active sessions
      repo.setHubStatus('running');
      const s1 = repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });
      const s2 = repo.createSession({ title: 'S2', workingDirectory: path.join(tmpDir, 'p2') });

      // Phase 2: Clean shutdown
      repo.setHubStatus('stopped');
      sessionManager.resumeSessions(ptySpawner, false); // Not a crash

      // Sessions marked completed
      expect(repo.getSession(s1.id)?.status).toBe('completed');
      expect(repo.getSession(s2.id)?.status).toBe('completed');

      // Phase 3: Delete non-active
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(2);

      // Phase 4: Verify empty dashboard
      expect(repo.listSessions()).toHaveLength(0);
      expect(repo.getHubStatus()).toBe('stopped');
    });

    it('restart after clean shutdown shows no crashed sessions', () => {
      // Phase 1: Full lifecycle — run, shutdown cleanly, restart
      repo.setHubStatus('running');
      repo.createSession({ title: 'S1', workingDirectory: path.join(tmpDir, 'p1') });

      // Clean shutdown
      repo.setHubStatus('stopped');
      sessionManager.resumeSessions(ptySpawner, false);
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
