import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
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

describe('Session Lifecycle — No queue, immediate activation', () => {
  let repo: Repository;
  let sessionManager: SessionManager;
  let fakeSpawner: FakePtySpawner;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 4);
    }
    fakeSpawner = new FakePtySpawner();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionManager = new SessionManager(repo, fakeSpawner as any);
  });

  afterEach(async () => {
    fakeSpawner.clearPendingTimers();
    await new Promise((r) => setTimeout(r, 20));
    closeDb();
  });

  // ── Immediate activation ─────────────────────────────────────────

  it('creates a session and activates it immediately', () => {
    const session = sessionManager.createSession({
      workingDirectory: '/project-a',
      title: 'Session A',
    });
    expect(session.status).toBe('active');
    expect(session.pid).not.toBeNull();
    expect(fakeSpawner.spawnCount).toBe(1);
  });

  it('creates multiple sessions — all activate immediately (no capacity limit)', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });
    const s3 = sessionManager.createSession({ workingDirectory: '/p3', title: 'S3' });

    expect(s1.status).toBe('active');
    expect(s2.status).toBe('active');
    expect(s3.status).toBe('active');
    expect(fakeSpawner.spawnCount).toBe(3);
  });

  // ── Session completion ──────────────────────────────────────────

  it('marks session as completed on normal exit', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    fakeSpawner.simulateExit(s1.id, 0, 'claude-1');

    expect(repo.getSession(s1.id)!.status).toBe('completed');
    expect(repo.getSession(s1.id)!.claudeSessionId).toBe('claude-1');
  });

  it('marks session as failed on non-zero exit', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    fakeSpawner.simulateExit(s1.id, 1, null);

    expect(repo.getSession(s1.id)!.status).toBe('failed');
  });

  // ── needsInput detection (preserved) ────────────────────────────

  it('sets needsInput when session goes idle', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    fakeSpawner.simulateIdle(s1.id);

    expect(repo.getSession(s1.id)!.needsInput).toBe(true);
    expect(repo.getSession(s1.id)!.status).toBe('active');
  });

  it('clears needsInput when user sends input', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    fakeSpawner.simulateIdle(s1.id);
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);

    sessionManager.sendInput(s1.id, 'hello\n');
    expect(repo.getSession(s1.id)!.needsInput).toBe(false);
  });

  // ── No auto-suspend (regression test) ──────────────────────────

  it('does NOT auto-suspend sessions when they go idle', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });

    // S1 goes idle — in old code this would trigger auto-suspend
    fakeSpawner.simulateIdle(s1.id);

    // Session stays active — only needsInput flag is set
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(repo.getSession(s1.id)!.needsInput).toBe(true);
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  it('sessions stay active indefinitely regardless of idle time', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });

    // Simulate multiple idle events
    fakeSpawner.simulateIdle(s1.id);
    fakeSpawner.simulateIdle(s1.id);
    fakeSpawner.simulateIdle(s1.id);

    // Still active, never killed
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  it('sessions are never auto-suspended even after user sends input', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    sessionManager.createSession({ workingDirectory: '/p2', title: 'S2' });

    // User sends input, then session goes idle — old code would suspend
    sessionManager.sendInput(s1.id, 'fix the bug\n');
    fakeSpawner.simulateIdle(s1.id);

    // Session stays active
    expect(repo.getSession(s1.id)!.status).toBe('active');
    expect(fakeSpawner.killedIds).toHaveLength(0);
  });

  // ── No continueSession method ──────────────────────────────────

  it('continueSession method does not exist', () => {
    expect((sessionManager as Record<string, unknown>).continueSession).toBeUndefined();
  });

  // ── Kill session ───────────────────────────────────────────────

  it('kills an active session', () => {
    const s1 = sessionManager.createSession({ workingDirectory: '/p1', title: 'S1' });
    const killed = sessionManager.killSession(s1.id);
    expect(killed).toBe(true);
  });
});
