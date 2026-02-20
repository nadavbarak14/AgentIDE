import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSessionLogger, logger } from '../services/logger.js';

export interface ShellProcess {
  pid: number;
  sessionId: string;
  shell: string;
  cwd: string;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export class ShellSpawner extends EventEmitter {
  private processes = new Map<string, pty.IPty>();
  private shellInfo = new Map<string, { shell: string; cwd: string }>();
  private scrollbackDir: string;
  private scrollbackBuffers = new Map<string, string>();
  private scrollbackWriters = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(scrollbackDir?: string) {
    super();
    this.scrollbackDir = scrollbackDir || path.join(process.cwd(), 'scrollback');

    if (!fs.existsSync(this.scrollbackDir)) {
      fs.mkdirSync(this.scrollbackDir, { recursive: true });
    }
  }

  /**
   * Detect the user's default shell from $SHELL, falling back to /bin/bash.
   */
  getDefaultShell(): string {
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Spawn a shell process for a session.
   */
  spawn(sessionId: string, workingDirectory: string, cols = 120, rows = 40): ShellProcess {
    const log = createSessionLogger(sessionId);
    const shellPath = this.getDefaultShell();

    // Validate working directory — fall back to home dir if missing
    let cwd = workingDirectory;
    if (!fs.existsSync(cwd)) {
      const home = os.homedir();
      log.warn({ requestedCwd: cwd, fallback: home }, 'working directory does not exist, falling back to home');
      cwd = home;
    }

    log.info({ shell: shellPath, cwd, cols, rows }, 'spawning shell process');

    const proc = pty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.processes.set(sessionId, proc);
    this.shellInfo.set(sessionId, { shell: shellPath, cwd });
    this.scrollbackBuffers.set(sessionId, '');

    log.info({ pid: proc.pid, shell: shellPath }, 'shell process spawned');

    // Handle output
    proc.onData((data) => {
      this.emit('data', sessionId, data);
      this.appendScrollback(sessionId, data);
    });

    // Handle exit
    proc.onExit(({ exitCode }) => {
      log.info({ exitCode }, 'shell process exited');
      this.flushScrollback(sessionId);
      this.cleanup(sessionId);
      this.emit('exit', sessionId, exitCode);
    });

    return {
      pid: proc.pid,
      sessionId,
      shell: shellPath,
      cwd,
      write: (data: string) => proc.write(data),
      resize: (c: number, r: number) => proc.resize(c, r),
      kill: () => {
        log.info('killing shell process');
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGTERM');
          } else {
            proc.kill();
          }
        } catch {
          try { proc.kill(); } catch { /* already dead */ }
        }
      },
    };
  }

  hasShell(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  getShellInfo(sessionId: string): { shell: string; cwd: string } | undefined {
    return this.shellInfo.get(sessionId);
  }

  getProcess(sessionId: string): pty.IPty | undefined {
    return this.processes.get(sessionId);
  }

  write(sessionId: string, data: string): void {
    const proc = this.processes.get(sessionId);
    if (proc) {
      proc.write(data);
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
    if (!proc) return;

    const log = createSessionLogger(sessionId);
    log.info('killing shell process');

    try {
      if (proc.pid) {
        process.kill(-proc.pid, 'SIGTERM');
      } else {
        proc.kill();
      }
    } catch {
      try { proc.kill(); } catch { /* already dead */ }
    }
  }

  // ─── Scrollback Persistence ───

  getScrollbackPath(sessionId: string): string {
    return path.join(this.scrollbackDir, `shell-${sessionId}.scrollback`);
  }

  loadScrollback(sessionId: string): string | null {
    const filePath = this.getScrollbackPath(sessionId);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  deleteScrollback(sessionId: string): void {
    const filePath = this.getScrollbackPath(sessionId);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File doesn't exist — fine
    }
  }

  private appendScrollback(sessionId: string, data: string): void {
    const buf = (this.scrollbackBuffers.get(sessionId) || '') + data;
    this.scrollbackBuffers.set(sessionId, buf);

    // Throttled write — every 5 seconds
    if (this.scrollbackWriters.has(sessionId)) return;

    const timer = setTimeout(() => {
      this.scrollbackWriters.delete(sessionId);
      this.flushScrollback(sessionId);
    }, 5000);

    this.scrollbackWriters.set(sessionId, timer);
  }

  private flushScrollback(sessionId: string): void {
    const buf = this.scrollbackBuffers.get(sessionId);
    if (!buf) return;

    const filePath = this.getScrollbackPath(sessionId);
    try {
      fs.appendFileSync(filePath, buf);
    } catch {
      // Ignore write errors
    }
    this.scrollbackBuffers.set(sessionId, '');
  }

  private cleanup(sessionId: string): void {
    this.processes.delete(sessionId);
    this.shellInfo.delete(sessionId);

    const scrollbackTimer = this.scrollbackWriters.get(sessionId);
    if (scrollbackTimer) {
      clearTimeout(scrollbackTimer);
      this.scrollbackWriters.delete(sessionId);
    }
    this.scrollbackBuffers.delete(sessionId);
  }

  destroy(): void {
    logger.info({ count: this.processes.size }, 'destroying all shell processes');
    for (const [sessionId, proc] of this.processes) {
      try {
        if (proc.pid) {
          try {
            process.kill(-proc.pid, 'SIGTERM');
          } catch {
            proc.kill();
          }
        } else {
          proc.kill();
        }
      } catch {
        // Already dead
      }
      this.flushScrollback(sessionId);
      this.cleanup(sessionId);
    }
  }
}
