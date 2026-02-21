import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { QueueManager } from '../../src/services/queue-manager.js';

describe('QueueManager', () => {
  let repo: Repository;
  let queueManager: QueueManager;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    // Ensure a local worker exists (hasAvailableSlot checks per-worker capacity)
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 4);
    }
    queueManager = new QueueManager(repo);
  });

  afterEach(() => {
    queueManager.stopAutoDispatch();
    closeDb();
  });

  it('dispatches a queued session when slots are available', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const dispatchHandler = vi.fn();
    queueManager.on('dispatch', dispatchHandler);

    const dispatched = queueManager.tryDispatch();
    expect(dispatched).not.toBeNull();
    expect(dispatched!.id).toBe(session.id);
    expect(dispatchHandler).toHaveBeenCalledOnce();
  });

  it('returns null when no queued sessions exist', () => {
    const dispatched = queueManager.tryDispatch();
    expect(dispatched).toBeNull();
  });

  it('enforces max_sessions limit', () => {
    // Default max is 4, set to 1
    repo.updateSettings({ maxConcurrentSessions: 1 });

    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.createSession({ workingDirectory: '/p2', title: 'S2' });

    // Simulate first session being active
    repo.activateSession(s1.id, 1234);

    const dispatched = queueManager.tryDispatch();
    expect(dispatched).toBeNull(); // No slots available
  });

  it('dispatches next session when a slot frees up', () => {
    repo.updateSettings({ maxConcurrentSessions: 1 });

    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });

    // Activate and complete first session
    repo.activateSession(s1.id, 1234);
    repo.completeSession(s1.id, null);

    // Now there should be a slot
    const dispatchHandler = vi.fn();
    queueManager.on('dispatch', dispatchHandler);
    queueManager.onSessionCompleted();

    expect(dispatchHandler).toHaveBeenCalledOnce();
    expect(dispatchHandler.mock.calls[0][0].id).toBe(s2.id);
  });

  it('hasAvailableSlot correctly checks capacity', () => {
    repo.updateSettings({ maxConcurrentSessions: 1 });
    expect(queueManager.hasAvailableSlot()).toBe(true);

    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.activateSession(s1.id, 1234);
    expect(queueManager.hasAvailableSlot()).toBe(false);
  });

  describe('per-worker capacity', () => {
    it('hasAvailableSlot returns true when any worker has capacity', () => {
      const local = repo.getLocalWorker()!;
      // Local worker has maxSessions=4, no active sessions
      expect(queueManager.hasAvailableSlot()).toBe(true);
      expect(queueManager.hasAvailableSlot(local.id)).toBe(true);
    });

    it('hasAvailableSlot returns false when all workers are full', () => {
      // Create a fresh QueueManager with a 1-slot local worker
      closeDb();
      const db2 = createTestDb();
      const repo2 = new Repository(db2);
      repo2.createLocalWorker('Local', 1); // maxSessions=1
      repo2.updateSettings({ maxConcurrentSessions: 10 }); // global ceiling high
      const qm2 = new QueueManager(repo2);

      const local = repo2.getLocalWorker()!;
      // Create session targeting the local worker
      const s1 = repo2.createSession({ workingDirectory: '/p1', title: 'S1', targetWorker: local.id });
      repo2.activateSession(s1.id, 1234);

      // Worker is full (1/1)
      expect(qm2.hasAvailableSlot(local.id)).toBe(false);
      // No worker has capacity → overall false
      expect(qm2.hasAvailableSlot()).toBe(false);

      qm2.stopAutoDispatch();
      // Reassign for afterEach cleanup
      repo = repo2;
      queueManager = qm2;
    });

    it('global ceiling still enforced even if workers have capacity', () => {
      repo.updateSettings({ maxConcurrentSessions: 1 });

      const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
      repo.activateSession(s1.id, 1234);

      // Worker has capacity (local maxSessions=4) but global max=1 is reached
      expect(queueManager.hasAvailableSlot()).toBe(false);
    });

    it('tryDispatch checks target worker capacity', () => {
      // Create a fresh QueueManager with a 1-slot local worker
      closeDb();
      const db2 = createTestDb();
      const repo2 = new Repository(db2);
      repo2.createLocalWorker('Local', 1); // maxSessions=1
      repo2.updateSettings({ maxConcurrentSessions: 10 });
      const qm2 = new QueueManager(repo2);

      const local = repo2.getLocalWorker()!;
      const s1 = repo2.createSession({ workingDirectory: '/p1', title: 'S1', targetWorker: local.id });
      repo2.activateSession(s1.id, 1234);

      // Create a queued session targeting this full worker
      repo2.createSession({ workingDirectory: '/p2', title: 'S2', targetWorker: local.id });

      // Should not dispatch because target worker is at capacity
      const dispatched = qm2.tryDispatch();
      expect(dispatched).toBeNull();

      qm2.stopAutoDispatch();
      repo = repo2;
      queueManager = qm2;
    });
  });

  it('dispatches queued continues in order', () => {
    repo.updateSettings({ maxConcurrentSessions: 2 });

    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = repo.createSession({ workingDirectory: '/p3', title: 'S3' });

    // All activate and complete
    repo.activateSession(s1.id, 1);
    repo.activateSession(s2.id, 2);
    repo.completeSession(s1.id, 'claude-1');
    repo.completeSession(s2.id, 'claude-2');

    // S3 still queued, s1 queued for continue
    repo.queueSessionForContinue(s1.id);

    // S3 should dispatch first (lower position)
    const dispatchHandler = vi.fn();
    queueManager.on('dispatch', dispatchHandler);
    queueManager.tryDispatch();
    expect(dispatchHandler).toHaveBeenCalledOnce();
    expect(dispatchHandler.mock.calls[0][0].id).toBe(s3.id);
  });
});
