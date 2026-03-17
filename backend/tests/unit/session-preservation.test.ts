import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Repository } from '../../src/models/repository.js';
import { createTestDb, closeDb } from '../../src/models/db.js';
import type { Worker } from '../../src/models/types.js';

describe('Session Preservation', () => {
  let repo: Repository;
  let localWorker: Worker;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    localWorker = repo.createLocalWorker('Local', 5);
  });

  afterEach(() => {
    closeDb();
  });

  describe('cleanupStaleSessions', () => {
    it('preserves sessions younger than maxAgeDays', () => {
      const s1 = repo.createSession({ title: 'Recent completed', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.completeSession(s1.id, null);

      const s2 = repo.createSession({ title: 'Recent failed', workingDirectory: '/tmp/b', targetWorker: localWorker.id });
      repo.failSession(s2.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(0);

      // Both sessions still exist
      expect(repo.getSession(s1.id)).toBeTruthy();
      expect(repo.getSession(s2.id)).toBeTruthy();
    });

    it('deletes completed sessions older than maxAgeDays', () => {
      const s1 = repo.createSession({ title: 'Old completed', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.completeSession(s1.id, null);

      // Manually backdate completed_at to 10 days ago
      (repo as any).db
        .prepare("UPDATE sessions SET completed_at = datetime('now', '-10 days') WHERE id = ?")
        .run(s1.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(1);
      expect(repo.getSession(s1.id)).toBeNull();
    });

    it('deletes failed sessions older than maxAgeDays', () => {
      const s1 = repo.createSession({ title: 'Old failed', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.failSession(s1.id);

      // Backdate completed_at
      (repo as any).db
        .prepare("UPDATE sessions SET completed_at = datetime('now', '-10 days') WHERE id = ?")
        .run(s1.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(1);
      expect(repo.getSession(s1.id)).toBeNull();
    });

    it('never deletes active sessions regardless of age', () => {
      const s1 = repo.createSession({ title: 'Active', workingDirectory: '/tmp/a', targetWorker: localWorker.id });

      // Backdate created_at to 30 days ago
      (repo as any).db
        .prepare("UPDATE sessions SET created_at = datetime('now', '-30 days') WHERE id = ?")
        .run(s1.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(0);
      expect(repo.getSession(s1.id)?.status).toBe('active');
    });

    it('never deletes crashed sessions regardless of age', () => {
      const s1 = repo.createSession({ title: 'Crashed', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.crashSession(s1.id);

      // Backdate to 30 days ago
      (repo as any).db
        .prepare("UPDATE sessions SET created_at = datetime('now', '-30 days'), updated_at = datetime('now', '-30 days') WHERE id = ?")
        .run(s1.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(0);
      expect(repo.getSession(s1.id)?.status).toBe('crashed');
    });

    it('returns 0 when no sessions exist', () => {
      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(0);
    });

    it('cascade-deletes panel_states for cleaned up sessions', () => {
      const s1 = repo.createSession({ title: 'Old', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.completeSession(s1.id, null);

      // Save a panel state for this session
      repo.savePanelState(s1.id, {
        activePanel: 'none',
        fileTabs: [],
        activeTabIndex: 0,
        tabScrollPositions: {},
        gitScrollPosition: 0,
        previewUrl: '',
        panelWidthPercent: 35,
      });

      // Backdate
      (repo as any).db
        .prepare("UPDATE sessions SET completed_at = datetime('now', '-10 days') WHERE id = ?")
        .run(s1.id);

      repo.cleanupStaleSessions(7);

      // Panel state should be gone too
      expect(repo.getPanelState(s1.id)).toBeNull();
    });

    it('handles mixed old and new sessions correctly', () => {
      const s1 = repo.createSession({ title: 'Old completed', workingDirectory: '/tmp/a', targetWorker: localWorker.id });
      repo.completeSession(s1.id, null);
      (repo as any).db.prepare("UPDATE sessions SET completed_at = datetime('now', '-10 days') WHERE id = ?").run(s1.id);

      const s2 = repo.createSession({ title: 'Recent completed', workingDirectory: '/tmp/b', targetWorker: localWorker.id });
      repo.completeSession(s2.id, null);

      const s3 = repo.createSession({ title: 'Active', workingDirectory: '/tmp/c', targetWorker: localWorker.id });

      const s4 = repo.createSession({ title: 'Old failed', workingDirectory: '/tmp/d', targetWorker: localWorker.id });
      repo.failSession(s4.id);
      (repo as any).db.prepare("UPDATE sessions SET completed_at = datetime('now', '-15 days') WHERE id = ?").run(s4.id);

      const deleted = repo.cleanupStaleSessions(7);
      expect(deleted).toBe(2); // s1 and s4 deleted

      expect(repo.getSession(s1.id)).toBeNull();
      expect(repo.getSession(s2.id)?.status).toBe('completed');
      expect(repo.getSession(s3.id)?.status).toBe('active');
      expect(repo.getSession(s4.id)).toBeNull();
    });
  });
});
