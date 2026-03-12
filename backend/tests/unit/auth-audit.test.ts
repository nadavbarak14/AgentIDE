import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Auth Audit Log', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  describe('logAuthEvent', () => {
    it('inserts an audit log entry', () => {
      repo.logAuthEvent('login_success', '192.168.1.1');
      const entries = repo.getAuthAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe('login_success');
      expect(entries[0].sourceIp).toBe('192.168.1.1');
      expect(entries[0].details).toBeNull();
      expect(entries[0].createdAt).toBeDefined();
    });

    it('stores optional details', () => {
      repo.logAuthEvent('login_failure', '10.0.0.1', 'Invalid access key');
      const entries = repo.getAuthAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0].details).toBe('Invalid access key');
    });

    it('supports all event types', () => {
      repo.logAuthEvent('login_success', '1.1.1.1');
      repo.logAuthEvent('login_failure', '2.2.2.2');
      repo.logAuthEvent('rate_limited', '3.3.3.3');
      repo.logAuthEvent('logout', '4.4.4.4');
      const entries = repo.getAuthAuditLog();
      expect(entries).toHaveLength(4);
      const types = entries.map((e) => e.eventType);
      expect(types).toContain('login_success');
      expect(types).toContain('login_failure');
      expect(types).toContain('rate_limited');
      expect(types).toContain('logout');
    });
  });

  describe('getAuthAuditLog', () => {
    it('returns empty array when no entries', () => {
      const entries = repo.getAuthAuditLog();
      expect(entries).toEqual([]);
    });

    it('returns entries in reverse chronological order', () => {
      repo.logAuthEvent('login_failure', '1.1.1.1');
      repo.logAuthEvent('login_success', '2.2.2.2');
      repo.logAuthEvent('logout', '3.3.3.3');
      const entries = repo.getAuthAuditLog();
      expect(entries).toHaveLength(3);
      // Most recent first
      expect(entries[0].eventType).toBe('logout');
      expect(entries[1].eventType).toBe('login_success');
      expect(entries[2].eventType).toBe('login_failure');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repo.logAuthEvent('login_failure', `10.0.0.${i}`);
      }
      const entries = repo.getAuthAuditLog(3);
      expect(entries).toHaveLength(3);
    });

    it('uses default limit of 50', () => {
      for (let i = 0; i < 60; i++) {
        repo.logAuthEvent('login_failure', `10.0.0.${i}`);
      }
      const entries = repo.getAuthAuditLog();
      expect(entries).toHaveLength(50);
    });

    it('returns entries with auto-increment IDs', () => {
      repo.logAuthEvent('login_success', '1.1.1.1');
      repo.logAuthEvent('login_failure', '2.2.2.2');
      const entries = repo.getAuthAuditLog();
      expect(entries[0].id).toBeGreaterThan(entries[1].id);
    });
  });
});
