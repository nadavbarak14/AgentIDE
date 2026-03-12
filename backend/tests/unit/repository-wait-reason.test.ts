import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Repository setNeedsInput with waitReason', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    // Create a local worker so sessions have a valid worker context
    repo.createLocalWorker('test-worker', 2);
  });

  afterEach(() => {
    closeDb();
  });

  it('stores wait_reason="permission" when setNeedsInput(id, true, "permission")', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    repo.setNeedsInput(session.id, true, 'permission');

    const updated = repo.getSession(session.id);
    expect(updated!.needsInput).toBe(true);
    expect(updated!.waitReason).toBe('permission');
  });

  it('stores wait_reason="question" when setNeedsInput(id, true, "question")', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    repo.setNeedsInput(session.id, true, 'question');

    const updated = repo.getSession(session.id);
    expect(updated!.needsInput).toBe(true);
    expect(updated!.waitReason).toBe('question');
  });

  it('stores wait_reason="stopped" when setNeedsInput(id, true, "stopped")', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    repo.setNeedsInput(session.id, true, 'stopped');

    const updated = repo.getSession(session.id);
    expect(updated!.needsInput).toBe(true);
    expect(updated!.waitReason).toBe('stopped');
  });

  it('clears wait_reason to null when setNeedsInput(id, false)', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    // First set a wait reason
    repo.setNeedsInput(session.id, true, 'permission');
    const withReason = repo.getSession(session.id);
    expect(withReason!.waitReason).toBe('permission');

    // Now clear it
    repo.setNeedsInput(session.id, false);

    const cleared = repo.getSession(session.id);
    expect(cleared!.needsInput).toBe(false);
    expect(cleared!.waitReason).toBeNull();
  });

  it('clears wait_reason to null even when a reason is passed with needsInput=false', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    // First set a wait reason
    repo.setNeedsInput(session.id, true, 'permission');
    const withReason = repo.getSession(session.id);
    expect(withReason!.waitReason).toBe('permission');

    // Clear with a reason argument — should still clear
    repo.setNeedsInput(session.id, false, 'permission');

    const cleared = repo.getSession(session.id);
    expect(cleared!.needsInput).toBe(false);
    expect(cleared!.waitReason).toBeNull();
  });

  it('getSession returns waitReason field correctly after setting it', () => {
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'test' });

    // Initially null
    expect(session.waitReason).toBeNull();

    // Set to permission
    repo.setNeedsInput(session.id, true, 'permission');
    const s1 = repo.getSession(session.id);
    expect(s1!.waitReason).toBe('permission');

    // Change to question
    repo.setNeedsInput(session.id, true, 'question');
    const s2 = repo.getSession(session.id);
    expect(s2!.waitReason).toBe('question');

    // Clear
    repo.setNeedsInput(session.id, false);
    const s3 = repo.getSession(session.id);
    expect(s3!.waitReason).toBeNull();
  });
});
