import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientChannel } from 'ssh2';
import { type TunnelManager, REVERSE_TUNNEL_PORT } from '../hub/tunnel.js';
import { createSessionLogger, logger } from '../services/logger.js';
import type { PtyProcess } from './pty-spawner.js';

export class RemotePtyBridge extends EventEmitter {
  private channels = new Map<string, ClientChannel>();
  private outputBuffers = new Map<string, string>();
  private lastOutputTime = new Map<string, number>();
  private scrollbackDir: string;
  private scrollbackWriters = new Map<string, ReturnType<typeof setTimeout>>();
  private scrollbackPending = new Map<string, string>();
  private idleNotified = new Map<string, boolean>();
  private idlePoller: ReturnType<typeof setInterval> | null = null;
  private hubPort: number;
  private static IDLE_THRESHOLD_MS = 8000;

  constructor(
    private tunnelManager: TunnelManager,
    options: { scrollbackDir?: string; hubPort?: number } = {},
  ) {
    super();
    this.scrollbackDir = options.scrollbackDir || path.join(process.cwd(), 'scrollback');
    this.hubPort = options.hubPort || parseInt(process.env.PORT || '3000', 10);

    if (!fs.existsSync(this.scrollbackDir)) {
      fs.mkdirSync(this.scrollbackDir, { recursive: true });
    }
  }

  /**
   * Ensure settings file exists on remote server.
   * Creates a minimal settings.json without hooks (remote hooks not supported yet).
   */
  private async ensureRemoteSettings(workerId: string): Promise<void> {
    const settingsDir = `/tmp/.c3-hooks-${REVERSE_TUNNEL_PORT}`;
    const settingsPath = `${settingsDir}/settings.json`;

    // Create directory and settings file on remote server
    const settings = {
      hooks: {}  // No hooks for remote workers yet
    };

    const settingsJson = JSON.stringify(settings, null, 2);
    const cmd = `mkdir -p ${settingsDir} && cat > ${settingsPath} << 'SETTINGS_EOF'\n${settingsJson}\nSETTINGS_EOF`;

    await this.tunnelManager.exec(workerId, cmd);
    logger.info({ workerId, settingsPath }, 'created settings file on remote server');
  }

  async spawn(sessionId: string, workerId: string, workingDirectory: string, args: string[] = []): Promise<PtyProcess> {
    const log = createSessionLogger(sessionId);
    log.info({ workerId, workingDirectory, args }, 'spawning remote claude process via SSH');

    // Create settings file on remote server (without hooks for now)
    await this.ensureRemoteSettings(workerId);

    const stream = await this.tunnelManager.shell(workerId, { cols: 120, rows: 40 });
    this.channels.set(sessionId, stream);
    this.outputBuffers.set(sessionId, '');
    this.lastOutputTime.set(sessionId, Date.now());

    // Handle output from remote shell
    stream.on('data', (data: Buffer) => {
      const str = data.toString();
      this.lastOutputTime.set(sessionId, Date.now());

      // Append to rolling buffer (keep last 4KB)
      const buf = (this.outputBuffers.get(sessionId) || '') + str;
      this.outputBuffers.set(sessionId, buf.slice(-4096));

      this.emit('data', sessionId, str);
      this.scheduleScrollbackWrite(sessionId, str);
      this.idleNotified.set(sessionId, false);
    });

    stream.stderr.on('data', (data: Buffer) => {
      const str = data.toString();
      this.emit('data', sessionId, str);
    });

    stream.on('close', () => {
      log.info('remote shell stream closed');
      this.cleanup(sessionId);
      this.emit('exit', sessionId, 0, null);
    });

    stream.on('error', (err: Error) => {
      log.error({ err: err.message }, 'remote shell stream error');
      this.cleanup(sessionId);
      this.emit('exit', sessionId, 1, null);
    });

    // Start the idle poller
    this.ensureIdlePoller();

    // Build the claude command to send to the remote shell
    // Source shell profile to load PATH where claude is installed
    const claudeArgs = ['claude', '--settings', `/tmp/.c3-hooks-${REVERSE_TUNNEL_PORT}/settings.json`];
    claudeArgs.push(...args);
    const envVars = `C3_SESSION_ID=${escapeShellArg(sessionId)} C3_HUB_PORT=${REVERSE_TUNNEL_PORT}`;
    const cmd = `source ~/.bashrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; cd ${escapeShellArg(workingDirectory)} && ${envVars} ${claudeArgs.join(' ')}\n`;

    log.info({ cmd: cmd.trim() }, 'sending claude command to remote shell');
    stream.write(cmd);

    return {
      pid: 0, // Remote processes don't have a local PID
      sessionId,
      write: (data: string) => this.write(sessionId, data),
      resize: (cols: number, rows: number) => this.resize(sessionId, cols, rows),
      kill: () => this.kill(sessionId),
    };
  }

  write(sessionId: string, data: string): void {
    const stream = this.channels.get(sessionId);
    if (stream) {
      stream.write(data);
      this.emit('input_sent', sessionId);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const stream = this.channels.get(sessionId);
    if (stream) {
      stream.setWindow(rows, cols, rows * 16, cols * 8);
    }
  }

  kill(sessionId: string): void {
    const log = createSessionLogger(sessionId);
    const stream = this.channels.get(sessionId);
    if (stream) {
      log.info('killing remote session');
      // Send Ctrl+C then exit to terminate the remote process
      stream.write('\x03');
      setTimeout(() => {
        try {
          stream.write('exit\n');
          stream.close();
        } catch {
          // Stream may already be closed
        }
      }, 500);
    }
  }

  hasProcess(sessionId: string): boolean {
    return this.channels.has(sessionId);
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

  private ensureIdlePoller(): void {
    if (this.idlePoller) return;

    this.idlePoller = setInterval(() => {
      const now = Date.now();
      for (const [sessionId] of this.channels) {
        const lastOutput = this.lastOutputTime.get(sessionId) || 0;
        const silenceMs = now - lastOutput;

        if (silenceMs >= RemotePtyBridge.IDLE_THRESHOLD_MS && !this.idleNotified.get(sessionId)) {
          this.idleNotified.set(sessionId, true);
          this.emit('session_idle', sessionId);
        }
      }

      if (this.channels.size === 0 && this.idlePoller) {
        clearInterval(this.idlePoller);
        this.idlePoller = null;
      }
    }, 2000);
  }

  private cleanup(sessionId: string): void {
    this.flushScrollback(sessionId);
    this.channels.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.lastOutputTime.delete(sessionId);
    this.idleNotified.delete(sessionId);
  }

  private scheduleScrollbackWrite(sessionId: string, data: string): void {
    const pending = this.scrollbackPending.get(sessionId) || '';
    this.scrollbackPending.set(sessionId, pending + data);

    if (this.scrollbackWriters.has(sessionId)) return;

    const timer = setTimeout(() => {
      this.scrollbackWriters.delete(sessionId);
      const buffered = this.scrollbackPending.get(sessionId) || '';
      this.scrollbackPending.delete(sessionId);
      if (!buffered) return;
      const filePath = this.getScrollbackPath(sessionId);
      try {
        fs.appendFileSync(filePath, buffered);
      } catch {
        // Ignore write errors
      }
    }, 2000);

    this.scrollbackWriters.set(sessionId, timer);
  }

  private flushScrollback(sessionId: string): void {
    const buffered = this.scrollbackPending.get(sessionId) || '';
    this.scrollbackPending.delete(sessionId);
    const timer = this.scrollbackWriters.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.scrollbackWriters.delete(sessionId);
    }
    if (!buffered) return;
    const filePath = this.getScrollbackPath(sessionId);
    try {
      fs.appendFileSync(filePath, buffered);
    } catch {
      // Ignore write errors
    }
  }

  destroy(): void {
    logger.info({ count: this.channels.size }, 'destroying all remote pty bridges');
    if (this.idlePoller) {
      clearInterval(this.idlePoller);
      this.idlePoller = null;
    }
    for (const [sessionId, stream] of this.channels) {
      try {
        stream.write('\x03');
        stream.close();
      } catch {
        // Already closed
      }
      this.cleanup(sessionId);
    }
  }
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
