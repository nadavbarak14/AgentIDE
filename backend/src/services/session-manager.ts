import { EventEmitter } from 'node:events';
import type { Repository } from '../models/repository.js';
import type { Session, CreateSessionInput } from '../models/types.js';
import type { PtySpawner, PtyProcess } from '../worker/pty-spawner.js';
import type { QueueManager } from './queue-manager.js';
import { createSessionLogger, logger } from './logger.js';

export class SessionManager extends EventEmitter {
  private activePtys = new Map<string, PtyProcess>();
  private suspendingIds = new Set<string>();
  // Sessions that should start fresh (no --continue flag)
  private startFreshIds = new Set<string>();
  // Suspend guard: sessions that have NOT yet received user input since activation.
  // A session is only eligible for auto-suspend after the user has engaged with it
  // (sent input), which proves the session "did work" in response.
  // Set when a session is activated. Cleared when the user sends input.
  private suspendGuardIds = new Set<string>();

  constructor(
    private repo: Repository,
    private ptySpawner: PtySpawner,
    private queueManager: QueueManager,
  ) {
    super();
    this.setupPtyListeners();
    this.setupQueueListeners();
  }

  /**
   * Create a new session. Auto-activates if a slot is available.
   * When startFresh=true, session starts without --continue flag.
   * Otherwise, --continue is used so Claude resumes the latest conversation in that directory.
   */
  createSession(input: CreateSessionInput, startFresh = false): Session {
    const session = this.repo.createSession(input);
    const log = createSessionLogger(session.id);
    log.info({ title: session.title, dir: session.workingDirectory, startFresh }, 'session created');

    if (startFresh) {
      this.startFreshIds.add(session.id);
    }

    // Try to activate immediately if slot available
    if (this.queueManager.hasAvailableSlot()) {
      this.activateSession(session.id);
    }

    return this.repo.getSession(session.id)!;
  }

  /**
   * Activate a queued session — spawn the Claude process.
   */
  activateSession(sessionId: string): Session | null {
    const session = this.repo.getSession(sessionId);
    if (!session) return null;
    const log = createSessionLogger(sessionId);

    try {
      let ptyProc: PtyProcess;

      const isStartFresh = this.startFreshIds.has(sessionId);
      this.startFreshIds.delete(sessionId);

      if (session.continuationCount > 0 && session.claudeSessionId) {
        // Continue a previous session with claude -c <specific-id>
        log.info({ claudeSessionId: session.claudeSessionId }, 'continuing session with claude -c <id>');
        ptyProc = this.ptySpawner.spawnContinue(
          sessionId,
          session.workingDirectory,
          session.claudeSessionId,
        );
      } else if (isStartFresh) {
        // Start fresh — no --continue flag
        log.info('spawning new claude process (start fresh)');
        ptyProc = this.ptySpawner.spawn(sessionId, session.workingDirectory);
      } else {
        // Default: use --continue to resume most recent Claude session in this directory
        log.info({ dir: session.workingDirectory }, 'spawning claude with --continue');
        ptyProc = this.ptySpawner.spawn(sessionId, session.workingDirectory, ['--continue']);
      }

      this.activePtys.set(sessionId, ptyProc);
      // Guard: session cannot be auto-suspended until user sends input
      this.suspendGuardIds.add(sessionId);
      const activated = this.repo.activateSession(sessionId, ptyProc.pid);
      this.emit('session_activated', activated);

      // Deliver pending comments after a short delay to let Claude initialize
      this.deliverPendingComments(sessionId);

      return activated;
    } catch (err) {
      log.error({ err }, 'failed to activate session');
      this.repo.failSession(sessionId);
      return this.repo.getSession(sessionId);
    }
  }

  /**
   * Continue a completed/failed session.
   * - If claudeSessionId exists → uses `claude -c <id>`
   * - Otherwise → uses `claude --continue` (resumes most recent session in that directory)
   */
  continueSession(sessionId: string): { status: string; message: string } {
    const session = this.repo.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status === 'active') throw new Error('Session is already active');

    const log = createSessionLogger(sessionId);
    log.info(
      { claudeSessionId: session.claudeSessionId, dir: session.workingDirectory },
      'continue/restart requested',
    );

    // Queue for continuation
    this.repo.queueSessionForContinue(sessionId);

    // Try to activate immediately if slot available
    if (this.queueManager.hasAvailableSlot()) {
      this.activateSession(sessionId);
      return { status: 'active', message: 'Session resumed' };
    }

    return { status: 'queued', message: 'Session queued for continuation' };
  }

  /**
   * Kill an active session's process.
   */
  killSession(sessionId: string): boolean {
    const log = createSessionLogger(sessionId);
    const ptyProc = this.activePtys.get(sessionId);
    if (!ptyProc) return false;

    log.info('killing session');
    ptyProc.kill();
    return true;
  }

  /**
   * Send input to an active session.
   */
  sendInput(sessionId: string, data: string): boolean {
    const log = createSessionLogger(sessionId);
    log.info({ dataLen: data.length }, 'sending input to session');
    this.ptySpawner.write(sessionId, data);
    // Clear needs_input since user is responding
    this.repo.setNeedsInput(sessionId, false);
    this.emit('needs_input_changed', sessionId, false);
    return true;
  }

  /**
   * Resize an active session's terminal.
   */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    this.ptySpawner.resize(sessionId, cols, rows);
  }

  /**
   * Get the PtyProcess for a session (for WebSocket binary streaming).
   */
  getPtyProcess(sessionId: string): PtyProcess | undefined {
    return this.activePtys.get(sessionId);
  }

  private setupPtyListeners(): void {
    // Handle process exit
    this.ptySpawner.on('exit', (sessionId: string, exitCode: number, claudeSessionId: string | null) => {
      const log = createSessionLogger(sessionId);

      this.activePtys.delete(sessionId);
      const wasSuspended = this.suspendingIds.delete(sessionId);

      if (wasSuspended) {
        // Auto-suspended → re-queue for automatic continuation
        log.info({ claudeSessionId }, 'session auto-suspended → back to queue');
        if (claudeSessionId) {
          this.repo.setClaudeSessionId(sessionId, claudeSessionId);
        }
        this.repo.queueSessionForContinue(sessionId);
        this.emit('session_suspended', sessionId);
      } else if (exitCode === 0) {
        log.info({ claudeSessionId }, 'session completed');
        this.repo.completeSession(sessionId, claudeSessionId);
        this.emit('session_completed', sessionId, claudeSessionId);
      } else {
        log.warn({ exitCode }, 'session failed');
        this.repo.failSession(sessionId);
        this.emit('session_failed', sessionId);
      }

      // Trigger queue dispatch
      this.queueManager.onSessionCompleted();
    });

    // Clear needs_input when user sends input.
    // Also clear the suspend guard — the user has engaged with this session,
    // so it's eligible for auto-suspend after it finishes the new work.
    this.ptySpawner.on('input_sent', (sessionId: string) => {
      const log = createSessionLogger(sessionId);
      const session = this.repo.getSession(sessionId);
      if (session?.needsInput) {
        log.info('user sent input — clearing needs_input');
        this.repo.setNeedsInput(sessionId, false);
        this.emit('needs_input_changed', sessionId, false);
      }
      // User engaged → eligible for auto-suspend after doing work
      if (this.suspendGuardIds.delete(sessionId)) {
        log.info('user sent input — clearing suspend guard');
      }
    });

    // Idle detection: sustained silence (8s) = likely waiting for input.
    // needsInput is STICKY — once set, only cleared when user sends input to this session.
    this.ptySpawner.on('session_idle', (sessionId: string) => {
      const session = this.repo.getSession(sessionId);
      if (!session || session.status !== 'active') return;

      const log = createSessionLogger(sessionId);

      if (!session.needsInput) {
        log.info('session idle — marking needs_input');
        this.repo.setNeedsInput(sessionId, true);
        this.emit('needs_input_changed', sessionId, true);
      }

      // FR-030: Auto-suspend idle session IF:
      //   1. Queue has waiting sessions
      //   2. Session is not pinned/locked
      //   3. User has interacted with this session (guard cleared)
      //      → Ensures session actually did work before being re-queued
      if (
        !session.lock &&
        this.queueManager.hasQueuedSessions() &&
        !this.suspendGuardIds.has(sessionId)
      ) {
        log.info('auto-suspending idle session — queue has waiting items');
        this.autoSuspendSession(sessionId);
      }
    });
  }

  /**
   * Auto-suspend an idle session to free its slot for queued sessions.
   * Kills the Claude process, re-queues for continuation.
   * Guard is re-set on activation — session needs user input again before next suspend.
   */
  private autoSuspendSession(sessionId: string): void {
    const log = createSessionLogger(sessionId);
    const ptyProc = this.activePtys.get(sessionId);

    if (!ptyProc) {
      log.warn('no pty process found for auto-suspend');
      return;
    }

    // Mark as suspending so exit handler re-queues instead of completing
    this.suspendingIds.add(sessionId);

    log.info('killing process for auto-suspend');
    ptyProc.kill();
  }

  /**
   * Deliver any pending comments for a session that just activated.
   * Uses a delay to allow the Claude process to initialize first.
   * Sends all comments as a single batch message (one PTY write).
   */
  private deliverPendingComments(sessionId: string): void {
    const log = createSessionLogger(sessionId);
    setTimeout(() => {
      const pending = this.repo.getCommentsByStatus(sessionId, 'pending');
      if (pending.length === 0) return;

      log.info({ count: pending.length }, 'delivering pending comments as batch');

      // Compose single-line batch message
      const items = pending.map((c, i) => {
        const lineRange = c.startLine === c.endLine ? `line ${c.startLine}` : `lines ${c.startLine}-${c.endLine}`;
        const snippet = c.codeSnippet.replace(/\n/g, ' ').slice(0, 200);
        return pending.length === 1
          ? `File: ${c.filePath} (${lineRange}), Code: \`${snippet}\`, Feedback: ${c.commentText}`
          : `(${i + 1}) File: ${c.filePath} (${lineRange}), Code: \`${snippet}\`, Feedback: ${c.commentText}`;
      });

      const message = pending.length === 1
        ? `[Code Review] ${items[0]}. Please address this feedback.\n`
        : `[Code Review — ${pending.length} comments] ${items.join(' ')}. Please address all comments.\n`;

      try {
        this.ptySpawner.write(sessionId, message);
        for (const comment of pending) {
          this.repo.markCommentSent(comment.id);
        }
      } catch (err) {
        log.error({ err }, 'failed to deliver batch comments');
      }
    }, 3000); // Wait 3s for Claude to initialize
  }

  private setupQueueListeners(): void {
    this.queueManager.on('dispatch', (session: Session) => {
      this.activateSession(session.id);
    });
  }

  /**
   * Resume sessions that were active before a restart.
   */
  resumeSessions(_ptySpawner: PtySpawner): void {
    const activeSessions = this.repo.listSessions('active');
    if (activeSessions.length === 0) return;

    logger.info({ count: activeSessions.length }, 'checking active sessions for resume');

    for (const session of activeSessions) {
      this.repo.completeSession(session.id, session.claudeSessionId);
      logger.info(
        { sessionId: session.id, title: session.title, dir: session.workingDirectory, hadClaudeSessionId: !!session.claudeSessionId },
        'marked detached session as completed for restart',
      );
    }

    this.queueManager.onSessionCompleted();
  }

  destroy(): void {
    this.ptySpawner.destroy();
    this.queueManager.stopAutoDispatch();
  }
}
