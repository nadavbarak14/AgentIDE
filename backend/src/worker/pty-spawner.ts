import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createSessionLogger, logger } from '../services/logger.js';
import { TerminalParser } from '../services/terminal-parser.js';

export interface PtyProcess {
  pid: number;
  sessionId: string;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export interface PtySpawnerOptions {
  scrollbackDir?: string;
  hubPort?: number;
}

export class PtySpawner extends EventEmitter {
  private processes = new Map<string, pty.IPty>();
  private outputBuffers = new Map<string, string>();
  private lastOutputTime = new Map<string, number>();
  private scrollbackDir: string;
  private scrollbackWriters = new Map<string, ReturnType<typeof setTimeout>>();
  private idleNotified = new Map<string, boolean>();
  private terminalParsers = new Map<string, TerminalParser>();
  private idlePoller: ReturnType<typeof setInterval> | null = null;
  private hookSettingsPath: string;
  private hubPort: number;
  // Sustained silence threshold: must have no output for this long
  private static IDLE_THRESHOLD_MS = 8000;

  constructor(options: PtySpawnerOptions = {}) {
    super();
    this.scrollbackDir = options.scrollbackDir || path.join(process.cwd(), 'scrollback');
    this.hubPort = options.hubPort || parseInt(process.env.PORT || '3000', 10);

    if (!fs.existsSync(this.scrollbackDir)) {
      fs.mkdirSync(this.scrollbackDir, { recursive: true });
    }

    // Generate hook settings file for spawned claude processes
    this.hookSettingsPath = this.generateHookSettings();
  }

  /**
   * Generate a Claude Code settings file with hooks that callback to the C3 Hub.
   */
  private generateHookSettings(): string {
    const hookScript = path.resolve(import.meta.dirname, '../../hooks/c3-hook.sh');
    const settingsDir = path.join(process.cwd(), '.c3-hooks');

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    const settingsPath = path.join(settingsDir, 'settings.json');
    const settings = {
      hooks: {
        SessionEnd: [
          {
            hooks: [
              {
                type: 'command',
                command: hookScript,
                timeout: 10,
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: hookScript,
                timeout: 10,
              },
            ],
          },
        ],
      },
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logger.info({ settingsPath, hookScript }, 'generated hook settings for claude processes');
    return settingsPath;
  }

  spawn(sessionId: string, workingDirectory: string, args: string[] = []): PtyProcess {
    const log = createSessionLogger(sessionId);
    log.info({ workingDirectory, args }, 'spawning claude process');

    // Build a clean environment for the child process.
    // Remove Claude Code env vars to avoid "nested session" detection.
    // Add C3-specific env vars for hook callbacks.
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      TERM: 'xterm-256color',
      C3_SESSION_ID: sessionId,
      C3_HUB_PORT: String(this.hubPort),
    };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;

    // Inject --settings flag for hooks (before any user args)
    const fullArgs = ['--settings', this.hookSettingsPath, ...args];

    log.info({ fullArgs: fullArgs.join(' ') }, 'claude command args');

    const proc = pty.spawn('claude', fullArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workingDirectory,
      env: childEnv,
    });

    this.processes.set(sessionId, proc);
    this.outputBuffers.set(sessionId, '');
    this.lastOutputTime.set(sessionId, Date.now());
    this.terminalParsers.set(sessionId, new TerminalParser());

    log.info({ pid: proc.pid }, 'claude process spawned');

    // Handle output
    proc.onData((data) => {
      this.lastOutputTime.set(sessionId, Date.now());

      // Append to rolling buffer (keep last 4KB for logging)
      const buf = (this.outputBuffers.get(sessionId) || '') + data;
      this.outputBuffers.set(sessionId, buf.slice(-4096));

      // Emit binary data for WebSocket forwarding
      this.emit('data', sessionId, data);

      // Parse for board commands (OSC escape sequences)
      const parser = this.terminalParsers.get(sessionId);
      if (parser) {
        const commands = parser.parse(data);
        for (const cmd of commands) {
          this.emit('board_command', sessionId, cmd);
        }
      }

      // Schedule scrollback write (throttled)
      this.scheduleScrollbackWrite(sessionId, data);

      // Reset idle flag so poller can re-detect silence
      this.idleNotified.set(sessionId, false);
    });

    // Start the idle poller if not already running
    this.ensureIdlePoller();

    // Handle exit
    proc.onExit(({ exitCode }) => {
      log.info({ exitCode }, 'claude process exited');
      this.cleanup(sessionId);
      // SessionEnd hook will POST the claudeSessionId via /api/hooks/event.
      // We emit exit with null — the hook callback will set the claudeSessionId separately.
      this.emit('exit', sessionId, exitCode, null);
    });

    return {
      pid: proc.pid,
      sessionId,
      write: (data: string) => proc.write(data),
      resize: (cols: number, rows: number) => proc.resize(cols, rows),
      kill: () => {
        log.info('killing claude process');
        proc.kill();
      },
    };
  }

  spawnContinue(sessionId: string, workingDirectory: string, claudeSessionId: string): PtyProcess {
    const log = createSessionLogger(sessionId);
    log.info({ claudeSessionId }, 'spawning claude -c (continue) process');
    return this.spawn(sessionId, workingDirectory, ['-c', claudeSessionId]);
  }

  getProcess(sessionId: string): pty.IPty | undefined {
    return this.processes.get(sessionId);
  }

  write(sessionId: string, data: string): void {
    const proc = this.processes.get(sessionId);
    if (proc) {
      proc.write(data);
      // Clear needs_input when user sends input
      this.emit('input_sent', sessionId);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const proc = this.processes.get(sessionId);
    if (proc) {
      proc.resize(cols, rows);
    }
  }

  kill(sessionId: string): void {
    const proc = this.processes.get(sessionId);
    if (proc) {
      try {
        // Kill process group to catch claude subprocesses
        if (proc.pid) {
          process.kill(-proc.pid, 'SIGTERM');
        } else {
          proc.kill();
        }
      } catch {
        try { proc.kill(); } catch { /* already dead */ }
      }
    }
  }

  getScrollbackPath(sessionId: string): string {
    return path.join(this.scrollbackDir, `${sessionId}.scrollback`);
  }

  loadScrollback(sessionId: string): string | null {
    const filePath = this.getScrollbackPath(sessionId);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Start a single global poller that checks ALL sessions for sustained silence.
   * Runs every 2 seconds. Much more reliable than per-session timers which race
   * with periodic TUI updates from Claude Code's ink-based UI.
   */
  private ensureIdlePoller(): void {
    if (this.idlePoller) return;

    this.idlePoller = setInterval(() => {
      const now = Date.now();
      for (const [sessionId] of this.processes) {
        const lastOutput = this.lastOutputTime.get(sessionId) || 0;
        const silenceMs = now - lastOutput;

        if (silenceMs >= PtySpawner.IDLE_THRESHOLD_MS && !this.idleNotified.get(sessionId)) {
          this.idleNotified.set(sessionId, true);
          const log = createSessionLogger(sessionId);
          log.info({ silenceMs }, 'sustained silence detected — emitting session_idle');
          this.emit('session_idle', sessionId);
        }
      }

      // Stop poller if no processes left
      if (this.processes.size === 0 && this.idlePoller) {
        clearInterval(this.idlePoller);
        this.idlePoller = null;
      }
    }, 2000);
  }

  private cleanup(sessionId: string): void {
    this.processes.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.lastOutputTime.delete(sessionId);
    this.idleNotified.delete(sessionId);
    this.terminalParsers.delete(sessionId);

    const scrollbackTimer = this.scrollbackWriters.get(sessionId);
    if (scrollbackTimer) {
      clearTimeout(scrollbackTimer);
      this.scrollbackWriters.delete(sessionId);
    }
  }

  private scheduleScrollbackWrite(sessionId: string, data: string): void {
    // Throttle scrollback writes to every 5 seconds
    if (this.scrollbackWriters.has(sessionId)) return;

    const timer = setTimeout(() => {
      this.scrollbackWriters.delete(sessionId);
      const filePath = this.getScrollbackPath(sessionId);
      try {
        fs.appendFileSync(filePath, data);
      } catch {
        // Ignore write errors
      }
    }, 5000);

    this.scrollbackWriters.set(sessionId, timer);
  }

  destroy(): void {
    logger.info({ count: this.processes.size }, 'destroying all pty processes');
    if (this.idlePoller) {
      clearInterval(this.idlePoller);
      this.idlePoller = null;
    }
    for (const [sessionId, proc] of this.processes) {
      try {
        // Kill the process group to catch child processes (claude spawns subprocesses)
        if (proc.pid) {
          try {
            process.kill(-proc.pid, 'SIGTERM');
          } catch {
            // Process group kill may fail; fall back to direct kill
            proc.kill();
          }
        } else {
          proc.kill();
        }
      } catch {
        // Already dead
      }
      this.cleanup(sessionId);
    }
  }
}
