import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientChannel } from 'ssh2';
import { type TunnelManager, REVERSE_TUNNEL_PORT } from '../hub/tunnel.js';
import { createSessionLogger, logger } from '../services/logger.js';
import { PtySpawner, type PtyProcess } from './pty-spawner.js';
import { escapeShellArg, getTmuxSessionName } from './tmux-utils.js';

export class RemotePtyBridge extends EventEmitter {
  private channels = new Map<string, ClientChannel>();
  private channelDimensions = new Map<string, { cols: number; rows: number }>();
  private sessionWorkerIds = new Map<string, string>();
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
      permissions: {
        allow: PtySpawner.buildSkillPermissions(),
      },
      hooks: {}  // No hooks for remote workers yet
    };

    const settingsJson = JSON.stringify(settings, null, 2);
    const cmd = `mkdir -p ${settingsDir} && cat > ${settingsPath} << 'SETTINGS_EOF'\n${settingsJson}\nSETTINGS_EOF`;

    await this.tunnelManager.exec(workerId, cmd);
    logger.info({ workerId, settingsPath }, 'created settings file on remote server');
  }

  /**
   * Copy skills from the local .claude-skills/skills/ directory to the remote
   * session's working directory so Claude can discover them.
   */
  private async injectSkillsToRemote(workerId: string, workingDirectory: string, sessionId: string, enabledExtensions?: string[]): Promise<void> {
    const log = createSessionLogger(sessionId);
    const bundledSkillsDir = path.resolve(import.meta.dirname, '../../../.claude-skills/skills');
    const extensionsDir = path.resolve(import.meta.dirname, '../../../extensions');
    if (!fs.existsSync(bundledSkillsDir)) {
      log.warn('no bundled skills directory found, skipping remote skill injection');
      return;
    }

    const remoteSkillsDir = `${workingDirectory}/.claude/skills`;

    // Build set of extension skill names to include (same logic as pty-spawner)
    const extSkillNames = new Set<string>();
    if (enabledExtensions) {
      for (const extName of enabledExtensions) {
        const manifestPath = path.join(extensionsDir, extName, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.panel) {
            extSkillNames.add(`adyx.${extName}.open`);
            extSkillNames.add(`adyx.${extName}.comment`);
            extSkillNames.add(`adyx.${extName}.select-text`);
          }
          for (const s of manifest.skills || []) {
            extSkillNames.add(s.split('/').pop()!);
          }
        } catch { /* skip bad manifest */ }
      }
    }

    // Build a shell script that creates all skill dirs and files on the remote.
    // Use base64 encoding to avoid heredoc issues with special characters.
    const entries = fs.readdirSync(bundledSkillsDir, { withFileTypes: true });
    const commands: string[] = [`rm -rf ${escapeShellArg(remoteSkillsDir)}`, `mkdir -p ${escapeShellArg(remoteSkillsDir)}`];

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillName = entry.name;

      // Filter by enabled extensions (same logic as local pty-spawner)
      if (enabledExtensions) {
        const isExtSkill = this.isExtensionSkill(skillName, extensionsDir);
        if (isExtSkill && !extSkillNames.has(skillName)) continue;
      }

      const skillSrc = path.join(bundledSkillsDir, skillName);

      // Resolve symlinks — skip if target is missing (e.g. CI without registration)
      let realSrc: string;
      try {
        realSrc = fs.realpathSync(skillSrc);
        if (!fs.statSync(realSrc).isDirectory()) continue;
      } catch {
        continue;
      }

      const remoteSkillDir = `${remoteSkillsDir}/${skillName}`;
      commands.push(`mkdir -p ${escapeShellArg(remoteSkillDir)}/scripts`);

      // Read and transfer SKILL.md via base64
      const skillMdPath = path.join(realSrc, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const b64 = fs.readFileSync(skillMdPath).toString('base64');
        commands.push(`echo '${b64}' | base64 -d > ${escapeShellArg(remoteSkillDir)}/SKILL.md`);
      }

      // Read and transfer scripts via base64
      const scriptsDir = path.join(realSrc, 'scripts');
      if (fs.existsSync(scriptsDir)) {
        for (const script of fs.readdirSync(scriptsDir)) {
          const scriptPath = path.join(scriptsDir, script);
          const b64 = fs.readFileSync(scriptPath).toString('base64');
          const remoteScript = `${remoteSkillDir}/scripts/${script}`;
          commands.push(`echo '${b64}' | base64 -d > ${escapeShellArg(remoteScript)}`);
          commands.push(`chmod +x ${escapeShellArg(remoteScript)}`);
        }
      }
    }

    // Use ; instead of && so one failure doesn't stop the rest
    const fullCmd = commands.slice(0, 2).join(' && ') + '; ' + commands.slice(2).join('; ');
    try {
      await this.tunnelManager.exec(workerId, fullCmd);
      log.info({ remoteSkillsDir, skillCount: entries.filter(e => e.isDirectory() || e.isSymbolicLink()).length }, 'injected skills to remote session');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'failed to inject skills to remote session');
    }
  }

  /** Check if a skill name belongs to an extension (auto-skill or custom symlink) */
  private isExtensionSkill(skillName: string, extensionsDir: string): boolean {
    const autoSuffixes = ['.open', '.comment', '.select-text'];
    for (const suffix of autoSuffixes) {
      if (skillName.endsWith(suffix)) {
        // Auto-skills are named adyx.<extName>.<action> — strip prefix and suffix
        const extName = skillName.replace(/^adyx\./, '').slice(0, -suffix.length);
        if (fs.existsSync(path.join(extensionsDir, extName, 'manifest.json'))) return true;
      }
    }
    if (fs.existsSync(extensionsDir)) {
      for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(extensionsDir, entry.name, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          for (const s of manifest.skills || []) {
            if (s.split('/').pop() === skillName) return true;
          }
        } catch { /* skip */ }
      }
    }
    return false;
  }

  async spawn(sessionId: string, workerId: string, workingDirectory: string, args: string[] = [], enabledExtensions?: string[]): Promise<PtyProcess> {
    const log = createSessionLogger(sessionId);
    log.info({ workerId, workingDirectory, args, enabledExtensions }, 'spawning remote claude process via SSH');

    // Create settings file on remote server (without hooks for now)
    await this.ensureRemoteSettings(workerId);

    // Inject skills to remote working directory
    await this.injectSkillsToRemote(workerId, workingDirectory, sessionId, enabledExtensions);

    const stream = await this.tunnelManager.shell(workerId, { cols: 120, rows: 40 });
    this.channels.set(sessionId, stream);
    this.channelDimensions.set(sessionId, { cols: 120, rows: 40 });
    this.sessionWorkerIds.set(sessionId, workerId);
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

    // Build the claude command wrapped in tmux for crash resilience
    // tmux keeps the process alive even if the SSH connection drops
    const tmuxName = getTmuxSessionName(sessionId);
    const claudeArgs = ['claude', '--settings', `/tmp/.c3-hooks-${REVERSE_TUNNEL_PORT}/settings.json`];
    claudeArgs.push(...args);
    const envVars = `C3_SESSION_ID=${escapeShellArg(sessionId)} C3_HUB_PORT=${REVERSE_TUNNEL_PORT}`;
    const claudeCmd = `cd ${escapeShellArg(workingDirectory)} && ${envVars} ${claudeArgs.join(' ')}`;
    const cmd = `source ~/.bashrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; tmux new-session -d -s ${escapeShellArg(tmuxName)} ${escapeShellArg(claudeCmd)} && tmux attach -t ${escapeShellArg(tmuxName)}\n`;

    log.info({ cmd: cmd.trim(), tmuxSession: tmuxName }, 'sending tmux-wrapped claude command to remote shell');
    stream.write(cmd);

    return {
      pid: 0, // Remote processes don't have a local PID
      sessionId,
      write: (data: string) => this.write(sessionId, data),
      resize: (cols: number, rows: number) => this.resize(sessionId, cols, rows),
      kill: () => this.kill(sessionId),
    };
  }

  /**
   * Attempt to reattach to a tmux session that survived a hub crash.
   * Returns the PtyProcess if successful, null if tmux session is dead.
   */
  async reattachSession(sessionId: string, workerId: string): Promise<PtyProcess | null> {
    const log = createSessionLogger(sessionId);
    const tmuxName = getTmuxSessionName(sessionId);

    // Check if tmux session is still alive
    try {
      const checkCmd = `tmux has-session -t ${escapeShellArg(tmuxName)} 2>/dev/null && echo 'ALIVE' || echo 'DEAD'`;
      const result = await this.tunnelManager.exec(workerId, checkCmd);
      const status = result.trim();

      if (status !== 'ALIVE') {
        log.info({ tmuxSession: tmuxName }, 'tmux session is dead, cannot reattach');
        return null;
      }
    } catch (err) {
      log.warn({ err, tmuxSession: tmuxName }, 'failed to check tmux session status');
      return null;
    }

    // tmux session is alive — open new SSH shell and attach
    log.info({ tmuxSession: tmuxName, workerId }, 'reattaching to surviving tmux session');

    const stream = await this.tunnelManager.shell(workerId, { cols: 120, rows: 40 });
    this.channels.set(sessionId, stream);
    this.channelDimensions.set(sessionId, { cols: 120, rows: 40 });
    this.sessionWorkerIds.set(sessionId, workerId);
    this.outputBuffers.set(sessionId, '');
    this.lastOutputTime.set(sessionId, Date.now());

    // Handle output from remote shell
    stream.on('data', (data: Buffer) => {
      const str = data.toString();
      this.lastOutputTime.set(sessionId, Date.now());
      const buf = (this.outputBuffers.get(sessionId) || '') + str;
      this.outputBuffers.set(sessionId, buf.slice(-4096));
      this.emit('data', sessionId, str);
      this.scheduleScrollbackWrite(sessionId, str);
      this.idleNotified.set(sessionId, false);
    });

    stream.stderr.on('data', (data: Buffer) => {
      this.emit('data', sessionId, data.toString());
    });

    stream.on('close', () => {
      log.info('reattached remote shell stream closed');
      this.cleanup(sessionId);
      this.emit('exit', sessionId, 0, null);
    });

    stream.on('error', (err: Error) => {
      log.error({ err: err.message }, 'reattached remote shell stream error');
      this.cleanup(sessionId);
      this.emit('exit', sessionId, 1, null);
    });

    this.ensureIdlePoller();

    // Attach to the existing tmux session
    const attachCmd = `tmux attach -t ${escapeShellArg(tmuxName)}\n`;
    stream.write(attachCmd);

    log.info({ tmuxSession: tmuxName }, 'successfully reattached to tmux session');

    return {
      pid: 0,
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
      this.channelDimensions.set(sessionId, { cols, rows });
    }
  }

  getDimensions(sessionId: string): { cols: number; rows: number } | undefined {
    return this.channelDimensions.get(sessionId);
  }

  kill(sessionId: string): void {
    const log = createSessionLogger(sessionId);
    const stream = this.channels.get(sessionId);
    const tmuxName = getTmuxSessionName(sessionId);
    const workerId = this.sessionWorkerIds.get(sessionId);

    if (stream) {
      log.info({ tmuxSession: tmuxName }, 'killing remote session and tmux session');

      // Kill the tmux session via a separate exec channel (not through the attached stream)
      // This avoids the kill commands showing up in Claude's terminal
      if (workerId) {
        const killCmd = `tmux kill-session -t ${escapeShellArg(tmuxName)} 2>/dev/null`;
        this.tunnelManager.exec(workerId, killCmd).catch((err) => {
          log.warn({ err: (err as Error).message }, 'failed to kill tmux session via exec, closing stream');
        }).finally(() => {
          try { stream.close(); } catch { /* already closed */ }
        });
      } else {
        // No workerId — fallback to closing the stream directly
        try { stream.close(); } catch { /* already closed */ }
      }
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
    this.channelDimensions.delete(sessionId);
    this.sessionWorkerIds.delete(sessionId);
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
