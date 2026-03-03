import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repository } from '../../src/models/repository.js';
import { createTestDb, closeDb } from '../../src/models/db.js';

describe('Crash Detection', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    repo.createLocalWorker('Local', 5);
  });

  afterEach(() => {
    closeDb();
  });

  describe('hub_status flag', () => {
    it('defaults to stopped on fresh database', () => {
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

    it('detects crash when hub_status is running on startup', () => {
      // Simulate: hub was running, then crashed (hub_status stays 'running')
      repo.setHubStatus('running');

      // On next startup, check hub_status
      const status = repo.getHubStatus();
      const wasCrash = status === 'running';
      expect(wasCrash).toBe(true);
    });

    it('detects clean shutdown when hub_status is stopped', () => {
      // Simulate: hub was running, then cleanly shut down
      repo.setHubStatus('running');
      repo.setHubStatus('stopped');

      // On next startup, check hub_status
      const status = repo.getHubStatus();
      const wasCrash = status === 'running';
      expect(wasCrash).toBe(false);
    });
  });

  describe('scrollback preservation on crash', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-crash-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('scrollback file is preserved when session is crashed', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/test' });

      // Create a scrollback file
      const scrollbackPath = path.join(tmpDir, `${session.id}.scrollback`);
      fs.writeFileSync(scrollbackPath, 'terminal output data');
      repo.setSessionScrollback(session.id, scrollbackPath);

      // Mark session as crashed
      repo.crashSession(session.id);

      // Verify scrollback file still exists
      expect(fs.existsSync(scrollbackPath)).toBe(true);

      // Verify session is crashed and scrollback path is preserved
      const crashedSession = repo.getSession(session.id);
      expect(crashedSession?.status).toBe('crashed');
      expect(crashedSession?.terminalScrollback).toBe(scrollbackPath);
    });

    it('deleteNonActiveSessions does not remove crashed session scrollback', () => {
      const session = repo.createSession({ title: 'Crashed', workingDirectory: '/tmp/test' });

      // Create scrollback file
      const scrollbackPath = path.join(tmpDir, `${session.id}.scrollback`);
      fs.writeFileSync(scrollbackPath, 'terminal output');
      repo.setSessionScrollback(session.id, scrollbackPath);

      // Mark as crashed
      repo.crashSession(session.id);

      // Run deleteNonActiveSessions — should NOT delete crashed sessions
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(0);

      // Scrollback file should still exist
      expect(fs.existsSync(scrollbackPath)).toBe(true);

      // Session should still be in database
      expect(repo.getSession(session.id)?.status).toBe('crashed');
    });

    it('scrollback file can be read after crash', () => {
      const session = repo.createSession({ title: 'Session', workingDirectory: '/tmp/test' });

      const scrollbackPath = path.join(tmpDir, `${session.id}.scrollback`);
      const content = 'Line 1\r\nLine 2\r\nSome ANSI \x1b[32mgreen\x1b[0m text\r\n';
      fs.writeFileSync(scrollbackPath, content);
      repo.setSessionScrollback(session.id, scrollbackPath);
      repo.crashSession(session.id);

      // Read scrollback back
      const readContent = fs.readFileSync(scrollbackPath, 'utf-8');
      expect(readContent).toBe(content);
    });
  });

  describe('clean shutdown flag', () => {
    it('hub_status is set to stopped during graceful shutdown', () => {
      // Simulate hub running
      repo.setHubStatus('running');
      expect(repo.getHubStatus()).toBe('running');

      // Simulate clean shutdown — set stopped FIRST
      repo.setHubStatus('stopped');
      expect(repo.getHubStatus()).toBe('stopped');
    });

    it('sessions are marked completed on clean shutdown, not crashed', () => {
      const s1 = repo.createSession({ title: 'S1', workingDirectory: '/tmp/a' });
      const s2 = repo.createSession({ title: 'S2', workingDirectory: '/tmp/b' });

      // Simulate clean shutdown
      repo.setHubStatus('stopped');

      // Clean shutdown behavior: mark as completed
      repo.completeSession(s1.id, null);
      repo.completeSession(s2.id, null);

      expect(repo.getSession(s1.id)?.status).toBe('completed');
      expect(repo.getSession(s2.id)?.status).toBe('completed');

      // deleteNonActiveSessions removes completed
      const deleted = repo.deleteNonActiveSessions();
      expect(deleted).toBe(2);
    });

    it('no crashed sessions exist after clean shutdown + deleteNonActive', () => {
      // Create sessions, simulate full clean shutdown lifecycle
      repo.createSession({ title: 'S1', workingDirectory: '/tmp/a' });
      repo.createSession({ title: 'S2', workingDirectory: '/tmp/b' });

      // Hub was running
      repo.setHubStatus('running');

      // Clean shutdown: set stopped, complete sessions, delete non-active
      repo.setHubStatus('stopped');
      const active = repo.listSessions('active');
      for (const s of active) {
        repo.completeSession(s.id, null);
      }
      repo.deleteNonActiveSessions();

      // On next startup: hub_status is stopped, no sessions remain
      expect(repo.getHubStatus()).toBe('stopped');
      expect(repo.listSessions()).toHaveLength(0);
      expect(repo.listSessions('crashed')).toHaveLength(0);
    });

    it('crash then clean restart: crashed sessions persist until dismissed', () => {
      const s1 = repo.createSession({ title: 'S1', workingDirectory: '/tmp/a' });

      // Simulate crash
      repo.setHubStatus('running');
      repo.markSessionsCrashed();
      expect(repo.getSession(s1.id)?.status).toBe('crashed');

      // Simulate restart after crash — hub_status was 'running'
      // On clean shutdown later, crashed sessions are still preserved
      repo.setHubStatus('stopped');
      repo.deleteNonActiveSessions();

      // Crashed sessions are NOT deleted by deleteNonActiveSessions
      expect(repo.getSession(s1.id)?.status).toBe('crashed');
    });
  });
});
