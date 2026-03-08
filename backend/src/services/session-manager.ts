import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { Repository } from '../models/repository.js';
import type { Session, CreateSessionInput, ShellInfo } from '../models/types.js';
import type { PtySpawner, PtyProcess } from '../worker/pty-spawner.js';
import type { RemotePtyBridge } from '../worker/remote-pty-bridge.js';
import type { ShellSpawner } from '../worker/shell-spawner.js';
import type { TunnelManager } from '../hub/tunnel.js';
import { createSessionLogger, logger } from './logger.js';

export class SessionManager extends EventEmitter {
  private activePtys = new Map<string, PtyProcess>();
  // Track which sessions are remote (for input routing)
  private remoteSessions = new Set<string>();
  // Track sessions spawned with --continue and their start time (for retry without -c on failure)
  private continueSessions = new Map<string, number>();

  private _shellSpawner: ShellSpawner | null = null;
  private _remotePtyBridge: RemotePtyBridge | null = null;
  private _tunnelManager: TunnelManager | null = null;

  constructor(
    private repo: Repository,
    private ptySpawner: PtySpawner,
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
  }

  get shellSpawner(): ShellSpawner | null {
    return this._shellSpawner;
  }

  /**
   * Create a new session. Always activates immediately.
   */
  createSession(input: CreateSessionInput): Session {
    // Default targetWorker to local worker if not specified
    if (!input.targetWorker) {
      const localWorker = this.repo.getLocalWorker();
      if (localWorker) {
        input = { ...input, targetWorker: localWorker.id };
      }
    }

    const session = this.repo.createSession(input);
    const log = createSessionLogger(session.id);
    log.info({ title: session.title, dir: session.workingDirectory }, 'session created');

    // Activate immediately
    this.activateSession(session.id, input.continueLatest, input.resume).catch((err) => {
      createSessionLogger(session.id).error({ err }, 'failed to activate session');
    });

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
  async activateSession(sessionId: string, continueLatest?: boolean, resume?: boolean): Promise<Session | null> {
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

      if (isRemote && this._remotePtyBridge && worker) {
        ptyProc = await this.activateRemoteSession(session, worker.id, log, continueLatest, resume);
        this.remoteSessions.add(sessionId);
      } else {
        ptyProc = this.activateLocalSession(session, log, continueLatest, resume);
      }

      this.activePtys.set(sessionId, ptyProc);
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
    log: ReturnType<typeof createSessionLogger>,
    continueLatest?: boolean,
    resume?: boolean,
  ): PtyProcess {
    // Get per-session enabled extensions for skill filtering
    const enabledExtensions = this.repo.getSessionExtensions(session.id);
    log.info({ enabledExtensions }, 'session enabled extensions');

    // Parse user-provided flags
    const userFlags = parseFlags(session.flags);

    // Priority: worktree > resume > continueLatest > fresh (default)
    let args: string[];
    if (session.worktree) {
      args = ['--worktree', ...userFlags];
      log.info({ worktree: true, flags: session.flags }, 'spawning claude with --worktree');
    } else if (resume) {
      args = ['--resume', ...userFlags];
      log.info({ dir: session.workingDirectory, flags: session.flags }, 'spawning claude with --resume');
    } else if (continueLatest) {
      args = ['--continue', ...userFlags];
      log.info({ dir: session.workingDirectory, flags: session.flags }, 'spawning claude with --continue');
      this.continueSessions.set(session.id, Date.now());
    } else {
      args = [...userFlags];
      log.info({ dir: session.workingDirectory, flags: session.flags }, 'spawning new claude process');
    }

    return this.ptySpawner.spawn(session.id, session.workingDirectory, args, enabledExtensions);
  }

  private async activateRemoteSession(
    session: Session,
    workerId: string,
    log: ReturnType<typeof createSessionLogger>,
    continueLatest?: boolean,
    resume?: boolean,
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

    const userFlags = parseFlags(session.flags);
    let args: string[];
    if (session.worktree) {
      args = ['--worktree', ...userFlags];
    } else if (resume) {
      args = ['--resume', ...userFlags];
    } else if (continueLatest) {
      args = ['--continue', ...userFlags];
    } else {
      args = [...userFlags];
    }
    log.info({ worktree: session.worktree, workerId, continueLatest, resume, flags: session.flags }, 'spawning remote claude process');
    return bridge.spawn(session.id, workerId, session.workingDirectory, args);
  }

  /**
   * Kill an active session's process.
   */
  killSession(sessionId: string): boolean {
    const log = createSessionLogger(sessionId);
    const ptyProc = this.activePtys.get(sessionId);
    if (!ptyProc) return false;

    // Clear continue tracking so the exit handler doesn't retry
    this.continueSessions.delete(sessionId);

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
   * For remote workers, opens an SSH shell on the remote server.
   */
  async openShell(sessionId: string, cols?: number, rows?: number): Promise<ShellInfo> {
    const session = this.repo.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') throw new Error('Session is not active');

    // Check if shell is already running (for both local and remote)
    if (this._shellSpawner && this._shellSpawner.hasShell(sessionId)) {
      throw new Error('Shell already running');
    }

    // Check if session has a remote worker
    if (session.workerId) {
      const worker = this.repo.getWorker(session.workerId);
      if (worker && worker.type === 'remote') {
        // Open remote shell via SSH
        if (!this._tunnelManager) throw new Error('Tunnel manager not available');
        return await this.openRemoteShell(sessionId, session.workerId, session.workingDirectory, cols, rows);
      }
    }

    // Local shell
    if (!this._shellSpawner) throw new Error('Shell support not available');

    const proc = this._shellSpawner.spawn(sessionId, session.workingDirectory, cols, rows);
    return {
      sessionId,
      status: 'running',
      pid: proc.pid,
      shell: proc.shell,
    };
  }

  /**
   * Open a remote shell via SSH for a session on a remote worker.
   */
  private async openRemoteShell(
    sessionId: string,
    workerId: string,
    workingDirectory: string,
    cols?: number,
    rows?: number
  ): Promise<ShellInfo> {
    if (!this._remotePtyBridge) throw new Error('Remote PTY bridge not available');

    const log = createSessionLogger(sessionId);
    log.info({ workerId, workingDirectory }, 'opening remote shell via SSH');

    // Use RemotePtyBridge's tunnel to open a shell, but don't run claude
    const stream = await this._tunnelManager!.shell(workerId, { cols: cols || 120, rows: rows || 40 });

    // Send commands to cd into the working directory and source shell profile
    const cmd = `source ~/.bashrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; cd ${this.escapeShellArg(workingDirectory)}\n`;
    stream.write(cmd);

    // Register the shell stream with shell spawner for I/O handling
    // Note: We're treating the remote SSH shell similar to a local shell
    this._shellSpawner?.registerRemoteShell(sessionId, stream);

    return {
      sessionId,
      status: 'running',
      pid: 0, // Remote shells don't have local PIDs
      shell: 'bash', // Assuming bash on remote server
    };
  }

  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
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

      if (exitCode === 0) {
        this.continueSessions.delete(sessionId);
        log.info({ claudeSessionId }, 'session completed');
        this.repo.completeSession(sessionId, claudeSessionId);
        this.emit('session_completed', sessionId, claudeSessionId);
      } else {
        // If this was a --continue session that failed quickly, retry without --continue
        const continueStartTime = this.continueSessions.get(sessionId);
        this.continueSessions.delete(sessionId);
        if (continueStartTime && (Date.now() - continueStartTime) < 30_000) {
          log.warn({ exitCode }, '--continue failed, retrying without --continue flag');
          try {
            const session = this.repo.getSession(sessionId);
            if (session) {
              const enabledExtensions = this.repo.getSessionExtensions(sessionId);
              const ptyProc = this.ptySpawner.spawn(sessionId, session.workingDirectory, [], enabledExtensions);
              this.activePtys.set(sessionId, ptyProc);
              this.repo.activateSession(sessionId, ptyProc.pid);
              return; // Don't mark as failed — we're retrying
            }
          } catch (retryErr) {
            log.error({ err: retryErr }, 'retry without --continue also failed');
          }
        }
        log.warn({ exitCode }, 'session failed');
        this.repo.failSession(sessionId);
        this.emit('session_failed', sessionId);
      }
    });

    this.ptySpawner.on('input_sent', (sessionId: string) => {
      const log = createSessionLogger(sessionId);
      const session = this.repo.getSession(sessionId);
      if (session?.needsInput) {
        log.info('user sent input — clearing needs_input');
        this.repo.setNeedsInput(sessionId, false);
        this.emit('needs_input_changed', sessionId, false);
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
    });
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

      if (exitCode === 0) {
        log.info({ claudeSessionId }, 'remote session completed');
        this.repo.completeSession(sessionId, claudeSessionId);
        this.emit('session_completed', sessionId, claudeSessionId);
      } else {
        log.warn({ exitCode }, 'remote session failed');
        this.repo.failSession(sessionId);
        this.emit('session_failed', sessionId);
      }
    });

    bridge.on('input_sent', (sessionId: string) => {
      const log = createSessionLogger(sessionId);
      const session = this.repo.getSession(sessionId);
      if (session?.needsInput) {
        log.info('user sent input to remote session — clearing needs_input');
        this.repo.setNeedsInput(sessionId, false);
        this.emit('needs_input_changed', sessionId, false);
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
    });
  }

  /**
   * Attempt to recover crashed remote sessions by reattaching to tmux.
   * Returns the number of successfully recovered sessions.
   */
  async recoverCrashedRemoteSessions(): Promise<number> {
    if (!this._remotePtyBridge) return 0;

    const crashedSessions = this.repo.listSessions('crashed');
    const remoteCrashed = crashedSessions.filter(s => {
      if (!s.workerId) return false;
      const worker = this.repo.getWorker(s.workerId);
      return worker?.type === 'remote';
    });

    if (remoteCrashed.length === 0) return 0;

    logger.info({ count: remoteCrashed.length }, 'attempting recovery of crashed remote sessions');
    let recoveredCount = 0;

    for (const session of remoteCrashed) {
      const log = createSessionLogger(session.id);

      // Broadcast recovery attempt to connected clients
      this.emit('session_recovering', session.id, session.workerId);

      try {
        const ptyProc = await this._remotePtyBridge.reattachSession(session.id, session.workerId!);

        if (ptyProc) {
          // Successfully reattached
          this.activePtys.set(session.id, ptyProc);
          this.remoteSessions.add(session.id);
          this.repo.activateSession(session.id, 0);
          this.repo.setCrashRecoveredAt(session.id);
          this.emit('session_activated', this.repo.getSession(session.id));
          log.info('successfully reattached to remote tmux session');
          recoveredCount++;
        } else {
          // tmux session is dead — mark as completed
          this.repo.completeSession(session.id, session.claudeSessionId);
          log.info('remote tmux session is dead, marked as completed');
        }
      } catch (err) {
        // Worker unreachable or other error — mark as completed
        log.warn({ err }, 'failed to recover remote session, marking as completed');
        this.repo.completeSession(session.id, session.claudeSessionId);
      }
    }

    logger.info({ recovered: recoveredCount, total: remoteCrashed.length }, 'remote session recovery complete');
    return recoveredCount;
  }

  /**
   * Attempt to recover crashed local sessions by reattaching to tmux.
   * Returns the number of successfully recovered sessions.
   */
  recoverCrashedLocalSessions(): number {
    const crashedSessions = this.repo.listSessions('crashed');
    const localCrashed = crashedSessions.filter(s => {
      if (!s.workerId) return true; // No worker = local
      const worker = this.repo.getWorker(s.workerId);
      return worker?.type === 'local';
    });

    if (localCrashed.length === 0) return 0;

    logger.info({ count: localCrashed.length }, 'attempting recovery of crashed local sessions');
    let recoveredCount = 0;

    for (const session of localCrashed) {
      const log = createSessionLogger(session.id);

      try {
        const ptyProc = this.ptySpawner.reattachSession(session.id);

        if (ptyProc) {
          // Successfully reattached
          this.activePtys.set(session.id, ptyProc);
          this.repo.activateSession(session.id, ptyProc.pid);
          this.repo.setCrashRecoveredAt(session.id);
          this.emit('session_activated', this.repo.getSession(session.id));
          log.info('successfully reattached to local tmux session');
          recoveredCount++;
        } else {
          // tmux session is dead — mark as completed
          this.repo.completeSession(session.id, session.claudeSessionId);
          log.info('local tmux session is dead, marked as completed');
        }
      } catch (err) {
        log.warn({ err }, 'failed to recover local session');
        this.repo.completeSession(session.id, session.claudeSessionId);
      }
    }

    logger.info({ recovered: recoveredCount, total: localCrashed.length }, 'local session recovery complete');
    return recoveredCount;
  }

  /**
   * Resume sessions that were active before a restart.
   * Always marks sessions as 'crashed' so recovery methods can attempt tmux reattachment.
   * Sessions that can't be recovered will be completed by the recovery methods.
   */
  resumeSessions(_ptySpawner: PtySpawner, wasCrash: boolean = false): void {
    const activeSessions = this.repo.listSessions('active');
    if (activeSessions.length === 0) return;

    // Always mark as crashed so recovery can attempt tmux reattachment
    // tmux sessions survive both clean restarts and crashes
    const crashedCount = this.repo.markSessionsCrashed();
    if (wasCrash) {
      logger.warn({ count: crashedCount }, 'crash detected: marked active sessions as crashed for recovery');
    } else {
      logger.info({ count: crashedCount }, 'clean restart: marked active sessions as crashed for tmux recovery');
    }
  }

  /**
   * Clean up scrollback files for a session after deletion.
   * Wrapped in try/catch so failures don't block session removal.
   */
  private cleanupScrollback(sessionId: string, log: ReturnType<typeof createSessionLogger>): void {
    try {
      this._shellSpawner?.deleteScrollback(sessionId);
    } catch (err) {
      log.warn({ err }, 'failed to delete shell scrollback');
    }
    try {
      const scrollbackPath = this.ptySpawner.getScrollbackPath(sessionId);
      fs.unlinkSync(scrollbackPath);
    } catch {
      // File doesn't exist or already cleaned up — fine
    }
  }

  destroy(): void {
    this._shellSpawner?.destroy();
    this._remotePtyBridge?.destroy();
    this.ptySpawner.destroy();
  }
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Parse a flags string into an array of tokens, respecting quoted values.
 * Deduplicates by flag name (keeps last occurrence).
 * Example: '--dangerously-skip-permissions --allowedTools "Read,Grep"'
 *   → ['--dangerously-skip-permissions', '--allowedTools', 'Read,Grep']
 */
export function parseFlags(flagString: string): string[] {
  const trimmed = flagString.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);

  // Deduplicate by flag name (keep last occurrence)
  const seen = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      const flagName = token.split('=')[0];
      seen.set(flagName, i);
    }
  }

  const result: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      const flagName = token.split('=')[0];
      if (seen.get(flagName) === i) {
        result.push(token);
      }
    } else {
      result.push(token);
    }
  }

  return result;
}
