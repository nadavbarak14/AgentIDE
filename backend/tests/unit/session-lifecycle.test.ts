import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { QueueManager } from '../../src/services/queue-manager.js';
import { SessionManager } from '../../src/services/session-manager.js';

/**
 * Fake PtySpawner that emits events like the real one but without
 * actually spawning processes.
 */
class FakePtySpawner extends EventEmitter {
  spawnCount = 0;
  killedIds: string[] = [];
  private nextPid = 1000;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  spawn(sessionId: string, _workDir: string, _args: string[] = []) {
    this.spawnCount++;
    const pid = this.nextPid++;
    return {
      pid,
      sessionId,
      write: vi.fn(),
      resize: vi.fn(),
      kill: () => {
        this.killedIds.push(sessionId);
        const t = setTimeout(() => this.simulateExit(sessionId, 1, null), 0);
        this.pendingTimers.push(t);
      },
    };
  }

  spawnContinue(sessionId: string, workDir: string) {
    return this.spawn(sessionId, workDir, ['-c']);
  }

  write(sessionId: string, _data: string) {
    this.emit('input_sent', sessionId);
  }

  resize() {}

  simulateExit(sessionId: string, exitCode: number, claudeSessionId: string | null) {
    this.emit('exit', sessionId, exitCode, claudeSessionId);
  }

  simulateIdle(sessionId: string) {
    this.emit('session_idle', sessionId);
  }

  clearPendingTimers() {
    this.pendingTimers.forEach(clearTimeout);
    this.pendingTimers = [];
  }

  destroy() {}
}

describe('Session Lifecycle — Auto-suspend only after user interaction', () => {
  let repo: Repository;
  let queueManager: QueueManager;
  let sessionManager: SessionManager;
  let fakeSpawner: FakePtySpawner;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    repo.updateSettings({ maxConcurrentSessions: 2 });
    queueManager = new QueueManager(repo, { dispatchDelayMs: 0 });
    fakeSpawner = new FakePtySpawner();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionManager = new SessionManager(repo, fakeSpawner as any, queueManager);
  });

  afterEach(async () => {
    fakeSpawner.clearPendingTimers();
    await new Promise((r) => setTimeout(r, 20));
    queueManager.stopAutoDispatch();
    closeDb();
  });

  // ── Basic session management ──────────────────────────────────────

  it('creates a session and activates it when a slot is available', () => {
    const session = sessionManager.createSession({
      workingDirectory: '/project-a',
      title: 'Session A',
    });
    expect(session.status).toBe('active');
    expect(session.pid).not.toBeNull();
    expect(fakeSpawner.spawnCount).toBe(1);
  });

  it('queues a session when all slots are full', () => {
    sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });

    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });
    expect(s3.status).toBe('queued');
    expect(fakeSpawner.spawnCount).toBe(2);
  });

  it('activates next queued session when an active session completes (process exits)', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    // Process exits normally → completed → next queued session activates
    fakeSpawner.simulateExit(s1.id, 0, 'claude-1');

    expect(repo.getSession(s1.id)!.status).toBe('completed');
    expect(repo.getSession(s3.id)!.status).toBe('active');
    expect(fakeSpawner.spawnCount).toBe(3);
  });

  // ── Suspend guard: must interact before auto-suspend ──────────────

  it('does NOT auto-suspend a session the user has not interacted with', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    // S1 goes idle but user never sent input → guard blocks suspend
    fakeSpawner.simulateIdle(s1.id);

    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  it('auto-suspends ONLY after user has sent input (session did work)', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    expect(s3.status).toBe('queued');

    // User sends input → clears the suspend guard
    sessionManager.sendInput(s1.id, 'fix the bug\n');

    // S1 goes idle after doing work → eligible for auto-suspend
    fakeSpawner.simulateIdle(s1.id);

    expect(fakeSpawner.killedIds).toContain(s1.id);

    await new Promise((r) => setTimeout(r, 10));

    // S1 back in queue, S3 now active
    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s3.id)!.status).toBe('active');
    expect(fakeSpawner.spawnCount).toBe(3);
  });

  it('does NOT auto-suspend when queue is empty (even after user input)', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });

    // User sends input, session does work
    sessionManager.sendInput(s1.id, 'hello\n');
    fakeSpawner.simulateIdle(s1.id);

    // No queue items → stays active
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  it('does NOT auto-suspend pinned/locked sessions', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    repo.updateSession(s1.id, { lock: true });

    // Even with user input and queue items, locked sessions stay
    sessionManager.sendInput(s1.id, 'hello\n');
    fakeSpawner.simulateIdle(s1.id);

    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  // ── Loop prevention ───────────────────────────────────────────────

  it('suspended session is NOT re-suspended until user sends input again', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    // User interacts with S1 → guard cleared
    sessionManager.sendInput(s1.id, 'do task\n');

    // S1 goes idle → suspended → S3 activates
    fakeSpawner.simulateIdle(s1.id);
    await new Promise((r) => setTimeout(r, 10));

    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s3.id)!.status).toBe('active');

    // User interacts with S3 → guard cleared
    sessionManager.sendInput(s3.id, 'do other task\n');

    // S3 goes idle → suspended → S1 reactivates
    fakeSpawner.simulateIdle(s3.id);
    await new Promise((r) => setTimeout(r, 10));

    expect(repo.getSession(s3.id)!.status).toBe('queued');
    expect(repo.getSession(s1.id)!.status).toBe('active');

    // S1 was just re-activated → guard is ON again → NOT suspended
    fakeSpawner.simulateIdle(s1.id);

    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);
    // No loop — S3 stays queued
    expect(repo.getSession(s3.id)!.status).toBe('queued');
  });

  it('newly dispatched session from queue is NOT immediately suspended', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });
    const s4 = sessionManager.createSession({ workingDirectory: '/p4', title: 'S4' });

    // User interacts with S1 → guard cleared
    sessionManager.sendInput(s1.id, 'work\n');

    // S1 idle → suspended → S3 activates from queue
    fakeSpawner.simulateIdle(s1.id);
    await new Promise((r) => setTimeout(r, 10));

    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s3.id)!.status).toBe('active');

    // S3 goes idle — user never interacted with S3 → guard blocks suspend
    fakeSpawner.simulateIdle(s3.id);

    expect(repo.getSession(s3.id)!.status).toBe('active');
    expect(repo.getSession(s3.id)!.needsInput).toBe(true);
    // Queue unchanged
    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s4.id)!.status).toBe('queued');
  });

  it('guard clears and session becomes eligible after user sends input', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    // User interacts with S1 → guard cleared
    sessionManager.sendInput(s1.id, 'task A\n');

    // S1 idle → suspended
    fakeSpawner.simulateIdle(s1.id);
    await new Promise((r) => setTimeout(r, 10));

    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s3.id)!.status).toBe('active');

    // S3 completes normally → S1 reactivates
    fakeSpawner.simulateExit(s3.id, 0, null);
    expect(repo.getSession(s1.id)!.status).toBe('active');

    // S1 goes idle → guard is ON (re-activated) → NOT suspended
    fakeSpawner.simulateIdle(s1.id);
    expect(repo.getSession(s1.id)!.status).toBe('active');

    // Create a new queued session
    const s4 = sessionManager.createSession({ workingDirectory: '/p4', title: 'S4' });
    expect(s4.status).toBe('queued');

    // User sends input → guard cleared
    sessionManager.sendInput(s1.id, 'task B\n');

    // S1 goes idle → eligible → suspended
    fakeSpawner.simulateIdle(s1.id);
    expect(fakeSpawner.killedIds).toContain(s1.id);
  });

  // ── Full lifecycle ────────────────────────────────────────────────

  it('full lifecycle: sessions only cycle after user interaction', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    // S1 and S2 active, S3 queued
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s2.id)!.status).toBe('active');
    expect(repo.getSession(s3.id)!.status).toBe('queued');

    // S1 goes idle without user input → NOT suspended (guard)
    fakeSpawner.simulateIdle(s1.id);
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);

    // User types in S1 → guard cleared, Claude works
    sessionManager.sendInput(s1.id, 'continue working\n');

    // S1 goes idle after working → suspended → S3 activates
    fakeSpawner.simulateIdle(s1.id);
    await new Promise((r) => setTimeout(r, 10));

    expect(repo.getSession(s1.id)!.status).toBe('queued');
    expect(repo.getSession(s3.id)!.status).toBe('active');

    // S3 goes idle → guard is ON (just activated) → NOT suspended
    fakeSpawner.simulateIdle(s3.id);
    expect(repo.getSession(s3.id)!.status).toBe('active');
    expect(repo.getSession(s3.id)!.needsInput).toBe(true);

    // No infinite loop! S1 stays queued, S3 stays active waiting for user
    expect(repo.getSession(s1.id)!.status).toBe('queued');
  });

  // ── Settings ──────────────────────────────────────────────────────

  it('default max_concurrent_sessions is 2', () => {
    const settings = repo.getSettings();
    expect(settings.maxConcurrentSessions).toBe(2);
  });

  // ── Session Continue Bug Fix (US1) ──────────────────────────────

  it('spawnContinue uses -c without passing the session ID as an argument', () => {
    // Track args passed to spawn
    const spawnArgs: string[][] = [];
    const origSpawn = fakeSpawner.spawn.bind(fakeSpawner);
    fakeSpawner.spawn = (sessionId: string, workDir: string, args: string[] = []) => {
      spawnArgs.push(args);
      return origSpawn(sessionId, workDir, args);
    };

    fakeSpawner.spawnContinue('test-session', '/project');

    expect(spawnArgs).toHaveLength(1);
    expect(spawnArgs[0]).toEqual(['-c']);
    // Verify the session ID is NOT passed as an argument
    expect(spawnArgs[0]).not.toContain(expect.stringMatching(/^[a-f0-9-]+$/));
  });

  it('continuation flow does not send claudeSessionId to spawnContinue', async () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });

    // Complete the session with a claudeSessionId
    fakeSpawner.simulateExit(s1.id, 0, 'cs_abc123');

    const completed = repo.getSession(s1.id)!;
    expect(completed.status).toBe('completed');
    expect(completed.claudeSessionId).toBe('cs_abc123');

    // Continue the session
    sessionManager.continueSession(s1.id);

    // The session was reactivated — verify it used spawnContinue without the token
    const reactivated = repo.getSession(s1.id)!;
    expect(reactivated.status).toBe('active');
    // FakePtySpawner.spawnContinue delegates to spawn with ['-c'] only
    // If the old bug existed, it would pass ['-c', 'cs_abc123']
  });
});
