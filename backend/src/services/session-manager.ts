import { EventEmitter } from 'node:events';
import type { Repository } from '../models/repository.js';
import type { Session, CreateSessionInput, ShellInfo } from '../models/types.js';
import type { PtySpawner, PtyProcess } from '../worker/pty-spawner.js';
import type { RemotePtyBridge } from '../worker/remote-pty-bridge.js';
import type { ShellSpawner } from '../worker/shell-spawner.js';
import type { TunnelManager } from '../hub/tunnel.js';
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
  // Track which sessions are remote (for input routing)
  private remoteSessions = new Set<string>();

  private _shellSpawner: ShellSpawner | null = null;
  private _remotePtyBridge: RemotePtyBridge | null = null;
  private _tunnelManager: TunnelManager | null = null;

  constructor(
    private repo: Repository,
    private ptySpawner: PtySpawner,
    private queueManager: QueueManager,
    shellSpawner?: ShellSpawner,
    remotePtyBridge?: RemotePtyBridge,
    tunnelManager?: TunnelManager,
  ) {
    super();
    this._shellSpawner = shellSpawner || null;
    this._remotePtyBridge = remotePtyBridge || null;
    this._tunnelManager = tunnelManager || null;
    this.setupPtyListeners();
    if (this._remotePtyBridge) {
      this.setupRemotePtyListeners();
    }
    this.setupQueueListeners();
  }

  get shellSpawner(): ShellSpawner | null {
    return this._shellSpawner;
  }

  /**
   * Create a new session. Auto-activates if a slot is available.
   * When startFresh=true, session starts without --continue flag.
   * Otherwise, --continue is used so Claude resumes the latest conversation in that directory.
   */
  createSession(input: CreateSessionInput, startFresh = false): Session {
    // Default targetWorker to local worker if not specified
    if (!input.targetWorker) {
      const localWorker = this.repo.getLocalWorker();
      if (localWorker) {
        input = { ...input, targetWorker: localWorker.id };
      }
    }

    const session = this.repo.createSession(input);
    const log = createSessionLogger(session.id);
    log.info({ title: session.title, dir: session.workingDirectory, startFresh }, 'session created');

    if (startFresh) {
      this.startFreshIds.add(session.id);
    }

    // Try to activate immediately if slot available
    if (this.queueManager.hasAvailableSlot()) {
      this.activateSession(session.id).catch((err) => {
        createSessionLogger(session.id).error({ err }, 'failed to auto-activate session');
      });
    }

    return this.repo.getSession(session.id)!;
  }

  get remotePtyBridge(): RemotePtyBridge | null {
    return this._remotePtyBridge;
  }

  isRemoteSession(sessionId: string): boolean {
    return this.remoteSessions.has(sessionId);
  }

  /**
   * Activate a queued session — spawn the Claude process.
   * Routes to local PtySpawner or RemotePtyBridge based on worker type.
   */
  async activateSession(sessionId: string): Promise<Session | null> {
    const session = this.repo.getSession(sessionId);
    if (!session) return null;
    const log = createSessionLogger(sessionId);

    // Determine if this is a remote session
    const worker = session.workerId ? this.repo.getWorker(session.workerId) : null;
    const isRemote = worker?.type === 'remote';

    if (isRemote && !this._remotePtyBridge) {
      log.error('remote PTY bridge not available');
      this.repo.failSession(sessionId);
      return this.repo.getSession(sessionId);
    }

    try {
      let ptyProc: PtyProcess;

      const isStartFresh = this.startFreshIds.has(sessionId);
      this.startFreshIds.delete(sessionId);

      if (isRemote && this._remotePtyBridge && worker) {
        ptyProc = await this.activateRemoteSession(session, worker.id, isStartFresh, log);
        this.remoteSessions.add(sessionId);
      } else {
        ptyProc = this.activateLocalSession(session, isStartFresh, log);
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

  private activateLocalSession(
    session: Session,
    isStartFresh: boolean,
    log: ReturnType<typeof createSessionLogger>,
  ): PtyProcess {
    if (session.continuationCount > 0 && session.claudeSessionId) {
      log.info({ claudeSessionId: session.claudeSessionId }, 'resuming specific conversation with claude --resume');
      return this.ptySpawner.spawnResume(
        session.id,
        session.workingDirectory,
        session.claudeSessionId,
      );
    } else if (session.continuationCount > 0) {
      log.info('continuing session with claude -c (no claudeSessionId available)');
      return this.ptySpawner.spawnContinue(
        session.id,
        session.workingDirectory,
      );
    } else if (isStartFresh || session.worktree) {
      const args = session.worktree ? ['--worktree'] : [];
      log.info({ worktree: session.worktree, startFresh: isStartFresh }, 'spawning new claude process');
      return this.ptySpawner.spawn(session.id, session.workingDirectory, args);
    } else {
      log.info({ dir: session.workingDirectory }, 'spawning claude with --continue');
      return this.ptySpawner.spawn(session.id, session.workingDirectory, ['--continue']);
    }
  }

  private async activateRemoteSession(
    session: Session,
    workerId: string,
    isStartFresh: boolean,
    log: ReturnType<typeof createSessionLogger>,
  ): Promise<PtyProcess> {
    const bridge = this._remotePtyBridge!;

    // Git auto-init for worktree sessions on remote
    if (session.worktree && this._tunnelManager) {
      try {
        const checkGit = await this._tunnelManager.exec(workerId, `test -d ${escapeShellArg(session.workingDirectory)}/.git && echo exists || echo missing`);
        if (checkGit.trim() === 'missing') {
          log.info({ dir: session.workingDirectory }, 'auto-initializing git repo on remote worker');
          await this._tunnelManager.exec(workerId, `cd ${escapeShellArg(session.workingDirectory)} && git init`);
        }
      } catch (err) {
        log.warn({ err }, 'failed to auto-init git on remote — proceeding without');
      }
    }

    if (session.continuationCount > 0 && session.claudeSessionId) {
      log.info({ claudeSessionId: session.claudeSessionId, workerId }, 'resuming remote conversation with --resume');
      return bridge.spawnResume(session.id, workerId, session.workingDirectory, session.claudeSessionId);
    } else if (session.continuationCount > 0) {
      log.info({ workerId }, 'continuing remote session with -c');
      return bridge.spawnContinue(session.id, workerId, session.workingDirectory);
    } else if (isStartFresh || session.worktree) {
      const args = session.worktree ? ['--worktree'] : [];
      log.info({ worktree: session.worktree, startFresh: isStartFresh, workerId }, 'spawning new remote claude process');
      return bridge.spawn(session.id, workerId, session.workingDirectory, args);
    } else {
      log.info({ dir: session.workingDirectory, workerId }, 'spawning remote claude with --continue');
      return bridge.spawn(session.id, workerId, session.workingDirectory, ['--continue']);
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
      this.activateSession(sessionId).catch((err) => {
        createSessionLogger(sessionId).error({ err }, 'failed to activate continued session');
      });
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

    // Kill shell terminal if running
    if (this._shellSpawner?.hasShell(sessionId)) {
      log.info('killing shell terminal for session');
      this._shellSpawner.kill(sessionId);
    }

    if (this.remoteSessions.has(sessionId) && this._remotePtyBridge) {
      log.info('killing remote session');
      this._remotePtyBridge.kill(sessionId);
    } else {
      log.info('killing session');
      ptyProc.kill();
    }
    return true;
  }

  /**
   * Send input to an active session.
   */
  sendInput(sessionId: string, data: string): boolean {
    const log = createSessionLogger(sessionId);
    log.info({ dataLen: data.length }, 'sending input to session');
    if (this.remoteSessions.has(sessionId) && this._remotePtyBridge) {
      this._remotePtyBridge.write(sessionId, data);
    } else {
      this.ptySpawner.write(sessionId, data);
    }
    // Clear needs_input since user is responding
    this.repo.setNeedsInput(sessionId, false);
    this.emit('needs_input_changed', sessionId, false);
    return true;
  }

  /**
   * Resize an active session's terminal.
   */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    if (this.remoteSessions.has(sessionId) && this._remotePtyBridge) {
      this._remotePtyBridge.resize(sessionId, cols, rows);
    } else {
      this.ptySpawner.resize(sessionId, cols, rows);
    }
  }

  /**
   * Get the PtyProcess for a session (for WebSocket binary streaming).
   */
  getPtyProcess(sessionId: string): PtyProcess | undefined {
    return this.activePtys.get(sessionId);
  }

  // ─── Shell Terminal Methods ───

  /**
   * Open a shell terminal for a session. Session must be active.
   */
  openShell(sessionId: string, cols?: number, rows?: number): ShellInfo {
    if (!this._shellSpawner) throw new Error('Shell support not available');
    const session = this.repo.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') throw new Error('Session is not active');
    if (this._shellSpawner.hasShell(sessionId)) throw new Error('Shell already running');

    const proc = this._shellSpawner.spawn(sessionId, session.workingDirectory, cols, rows);
    return {
      sessionId,
      status: 'running',
      pid: proc.pid,
      shell: proc.shell,
    };
  }

  /**
   * Close (kill) the shell terminal for a session.
   */
  closeShell(sessionId: string): ShellInfo {
    if (!this._shellSpawner) throw new Error('Shell support not available');
    if (!this._shellSpawner.hasShell(sessionId)) throw new Error('No shell running');
    this._shellSpawner.kill(sessionId);
    return { sessionId, status: 'killed', pid: null, shell: null };
  }

  /**
   * Get shell terminal status for a session.
   */
  getShellStatus(sessionId: string): ShellInfo {
    if (!this._shellSpawner || !this._shellSpawner.hasShell(sessionId)) {
      return { sessionId, status: 'none', pid: null, shell: null };
    }
    const info = this._shellSpawner.getShellInfo(sessionId);
    const proc = this._shellSpawner.getProcess(sessionId);
    return {
      sessionId,
      status: 'running',
      pid: proc?.pid ?? null,
      shell: info?.shell ?? null,
    };
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

    // Kill shell terminal if running
    if (this._shellSpawner?.hasShell(sessionId)) {
      log.info('killing shell terminal during auto-suspend');
      this._shellSpawner.kill(sessionId);
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
        if (this.remoteSessions.has(sessionId) && this._remotePtyBridge) {
          this._remotePtyBridge.write(sessionId, message);
        } else {
          this.ptySpawner.write(sessionId, message);
        }
        for (const comment of pending) {
          this.repo.markCommentSent(comment.id);
        }
      } catch (err) {
        log.error({ err }, 'failed to deliver batch comments');
      }
    }, 3000); // Wait 3s for Claude to initialize
  }

  private setupRemotePtyListeners(): void {
    const bridge = this._remotePtyBridge!;

    bridge.on('exit', (sessionId: string, exitCode: number, claudeSessionId: string | null) => {
      const log = createSessionLogger(sessionId);

      this.activePtys.delete(sessionId);
      this.remoteSessions.delete(sessionId);
      const wasSuspended = this.suspendingIds.delete(sessionId);

      if (wasSuspended) {
        log.info({ claudeSessionId }, 'remote session auto-suspended → back to queue');
        if (claudeSessionId) {
          this.repo.setClaudeSessionId(sessionId, claudeSessionId);
        }
        this.repo.queueSessionForContinue(sessionId);
        this.emit('session_suspended', sessionId);
      } else if (exitCode === 0) {
        log.info({ claudeSessionId }, 'remote session completed');
        this.repo.completeSession(sessionId, claudeSessionId);
        this.emit('session_completed', sessionId, claudeSessionId);
      } else {
        log.warn({ exitCode }, 'remote session failed');
        this.repo.failSession(sessionId);
        this.emit('session_failed', sessionId);
      }

      this.queueManager.onSessionCompleted();
    });

    bridge.on('input_sent', (sessionId: string) => {
      const log = createSessionLogger(sessionId);
      const session = this.repo.getSession(sessionId);
      if (session?.needsInput) {
        log.info('user sent input to remote session — clearing needs_input');
        this.repo.setNeedsInput(sessionId, false);
        this.emit('needs_input_changed', sessionId, false);
      }
      if (this.suspendGuardIds.delete(sessionId)) {
        log.info('user sent input to remote session — clearing suspend guard');
      }
    });

    bridge.on('session_idle', (sessionId: string) => {
      const session = this.repo.getSession(sessionId);
      if (!session || session.status !== 'active') return;

      const log = createSessionLogger(sessionId);

      if (!session.needsInput) {
        log.info('remote session idle — marking needs_input');
        this.repo.setNeedsInput(sessionId, true);
        this.emit('needs_input_changed', sessionId, true);
      }

      if (
        !session.lock &&
        this.queueManager.hasQueuedSessions() &&
        !this.suspendGuardIds.has(sessionId)
      ) {
        log.info('auto-suspending idle remote session — queue has waiting items');
        this.autoSuspendSession(sessionId);
      }
    });
  }

  private setupQueueListeners(): void {
    this.queueManager.on('dispatch', (session: Session) => {
      this.activateSession(session.id).catch((err) => {
        createSessionLogger(session.id).error({ err }, 'failed to activate dispatched session');
      });
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
    this._shellSpawner?.destroy();
    this._remotePtyBridge?.destroy();
    this.ptySpawner.destroy();
    this.queueManager.stopAutoDispatch();
  }
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
