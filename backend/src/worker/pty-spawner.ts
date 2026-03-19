import * as pty from 'node-pty';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createSessionLogger, logger } from '../services/logger.js';
import { TerminalParser } from '../services/terminal-parser.js';
import {
  escapeShellArg,
  getTmuxSessionName,
  isTmuxSessionAlive,
  killTmuxSession,
  cleanupOrphanedTmuxSessions,
} from './tmux-utils.js';

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
  private processDimensions = new Map<string, { cols: number; rows: number }>();
  private outputBuffers = new Map<string, string>();
  private scrollbackDir: string;
  private scrollbackWriters = new Map<string, ReturnType<typeof setTimeout>>();
  private scrollbackPending = new Map<string, string>();
  private terminalParsers = new Map<string, TerminalParser>();
  private hookSettingsPath: string;
  private hubPort: number;

  /**
   * Resolve a usable shell binary path for PTY spawning.
   * Tries shells in order, validates existence with fs.existsSync().
   * Returns the first existing shell path.
   * Throws with descriptive error if no shell is found.
   */
  static resolveShell(): string {
    const candidates: Array<{ path: string; source: string }> = [
      { path: '/bin/bash', source: 'default' },
    ];

    const envShell = process.env.SHELL;
    if (envShell && envShell !== '/bin/bash') {
      candidates.push({ path: envShell, source: '$SHELL' });
    }

    candidates.push(
      { path: '/bin/zsh', source: 'macOS default' },
      { path: '/bin/sh', source: 'POSIX fallback' },
    );

    for (const candidate of candidates) {
      if (fs.existsSync(candidate.path)) {
        logger.info({ shell: candidate.path, source: candidate.source }, 'resolved shell for PTY');
        return candidate.path;
      }
    }

    const tried = candidates.map(c => `${c.path} (${c.source})`).join(', ');
    const platform = process.platform === 'darwin'
      ? '\n  On macOS, ensure Xcode command-line tools are installed: xcode-select --install'
      : '\n  On Linux, ensure bash or sh is installed: sudo apt-get install bash';
    throw new Error(`No usable shell found. Tried: ${tried}.${platform}`);
  }

  constructor(options: PtySpawnerOptions = {}) {
    super();
    this.scrollbackDir = options.scrollbackDir || path.join(process.cwd(), 'scrollback');
    this.hubPort = options.hubPort || parseInt(process.env.PORT || '3000', 10);

    if (!fs.existsSync(this.scrollbackDir)) {
      fs.mkdirSync(this.scrollbackDir, { recursive: true });
    }

    // Ensure node-pty spawn-helper is executable (npm pack strips +x)
    PtySpawner.fixSpawnHelperPermissions();

    // Generate hook settings file for spawned claude processes
    this.hookSettingsPath = this.generateHookSettings();
  }

  /**
   * Fix node-pty spawn-helper permissions if needed.
   * npm pack/install strips execute bits from prebuilt binaries,
   * causing posix_spawnp to fail on macOS/Linux.
   */
  private static fixSpawnHelperPermissions(): void {
    try {
      const nodePtyDir = path.resolve(import.meta.dirname, '../../../node_modules/node-pty');
      const candidates = [
        path.join(nodePtyDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
        path.join(nodePtyDir, 'build', 'Release', 'spawn-helper'),
      ];
      for (const helperPath of candidates) {
        if (fs.existsSync(helperPath)) {
          const mode = fs.statSync(helperPath).mode;
          if (!(mode & 0o111)) {
            fs.chmodSync(helperPath, 0o755);
            logger.info({ helperPath }, 'fixed node-pty spawn-helper permissions');
          }
          break;
        }
      }
    } catch (err) {
      logger.warn({ err }, 'could not fix spawn-helper permissions');
    }
  }

  /**
   * Build permission allow-list for all bundled adyx skill scripts.
   * Returns entries like "Bash(.claude/skills/adyx.view-navigate/scripts/adyx.view-navigate.sh:*)"
   */
  static buildSkillPermissions(): string[] {
    const bundledSkillsDir = path.resolve(import.meta.dirname, '../../../.claude-skills/skills');
    const allow: string[] = [];
    if (!fs.existsSync(bundledSkillsDir)) return allow;

    for (const skillEntry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
      if (!skillEntry.isDirectory() && !skillEntry.isSymbolicLink()) continue;
      const skillName = skillEntry.name;
      let scriptsDir: string;
      try {
        const realPath = fs.realpathSync(path.join(bundledSkillsDir, skillName));
        scriptsDir = path.join(realPath, 'scripts');
      } catch { continue; }
      if (!fs.existsSync(scriptsDir)) continue;

      for (const script of fs.readdirSync(scriptsDir)) {
        // Allow both relative path formats Claude Code might use
        allow.push(`Bash(.claude/skills/${skillName}/scripts/${script}:*)`);
      }
    }
    return allow;
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

    // Ensure hook script is executable (Git on Windows may strip execute bit)
    try { fs.chmodSync(hookScript, 0o755); } catch { /* ignore */ }

    const settingsPath = path.join(settingsDir, 'settings.json');
    const settings = {
      permissions: {
        allow: PtySpawner.buildSkillPermissions(),
      },
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
        Notification: [
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
    logger.info({ settingsPath, hookScript, skillPermissions: settings.permissions.allow.length }, 'generated hook settings for claude processes');
    return settingsPath;
  }

  spawn(sessionId: string, workingDirectory: string, args: string[] = [], enabledExtensions?: string[]): PtyProcess {
    const log = createSessionLogger(sessionId);
    log.info({ workingDirectory, args, enabledExtensions }, 'spawning claude process');

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
    const fullArgs = ['--settings', this.hookSettingsPath];
    fullArgs.push(...args);

    // Copy skills into session's working directory for local access
    // If enabledExtensions is set, only copy skills for those extensions (+ built-in)
    const bundledSkillsDir = path.resolve(import.meta.dirname, '../../../.claude-skills/skills');
    const extensionsDir = path.resolve(import.meta.dirname, '../../../extensions');
    const sessionSkillsDir = path.join(workingDirectory, '.claude', 'skills');
    try {
      if (fs.existsSync(bundledSkillsDir)) {
        // Clear previous skills for clean state
        if (fs.existsSync(sessionSkillsDir)) fs.rmSync(sessionSkillsDir, { recursive: true, force: true });
        fs.mkdirSync(sessionSkillsDir, { recursive: true });

        if (enabledExtensions && enabledExtensions.length > 0) {
          // Build set of extension-related skill names to include
          const extSkillNames = new Set<string>();
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

          // Symlink each skill dir for speed; fall back to copy if symlinks fail
          for (const entry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
            const isExtensionSkill = this.isExtensionSkill(entry.name, extensionsDir);
            if (isExtensionSkill && !extSkillNames.has(entry.name)) continue;
            const src = path.join(bundledSkillsDir, entry.name);
            const dest = path.join(sessionSkillsDir, entry.name);
            try {
              // Use 'junction' on Windows (no elevated privileges needed), 'dir' on Linux/macOS
              fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
            } catch (symlinkErr) {
              // Symlink failed (e.g. cross-filesystem, permissions) — fall back to copy
              try {
                fs.cpSync(src, dest, { recursive: true, dereference: true });
              } catch (cpErr) {
                log.warn({ src, dest, symlinkErr, cpErr }, 'failed to inject skill');
              }
            }
          }
          log.info({ sessionSkillsDir, enabledExtensions, skillCount: fs.readdirSync(sessionSkillsDir).length }, 'injected filtered skills into session');
        } else {
          // No filter — symlink entire skills dir; fall back to copy
          // Remove the empty dir we just created so symlink target doesn't exist
          fs.rmSync(sessionSkillsDir, { recursive: true, force: true });
          try {
            fs.symlinkSync(bundledSkillsDir, sessionSkillsDir, process.platform === 'win32' ? 'junction' : 'dir');
          } catch {
            fs.cpSync(bundledSkillsDir, sessionSkillsDir, { recursive: true });
          }
          log.info({ sessionSkillsDir }, 'injected all skills into session working directory');
        }
      }
    } catch (err) {
      log.warn({ err, sessionSkillsDir }, 'failed to inject skills into session');
    }

    log.info({ fullArgs: fullArgs.join(' ') }, 'claude command args');

    // Spawn a shell and send tmux command into it.
    // tmux keeps the Claude process alive even if the hub crashes.
    const shell = PtySpawner.resolveShell();
    const proc = pty.spawn(shell, ['--norc', '--noprofile'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workingDirectory,
      env: childEnv,
    });

    this.processes.set(sessionId, proc);
    this.processDimensions.set(sessionId, { cols: 120, rows: 40 });
    this.outputBuffers.set(sessionId, '');
    this.terminalParsers.set(sessionId, new TerminalParser());

    log.info({ pid: proc.pid }, 'bash shell spawned for tmux wrapping');

    // Build the tmux-wrapped claude command
    const tmuxName = getTmuxSessionName(sessionId);
    const envPrefix = `C3_SESSION_ID=${escapeShellArg(sessionId)} C3_HUB_PORT=${this.hubPort}`;
    const claudeCmd = `cd ${escapeShellArg(workingDirectory)} && ${envPrefix} claude ${fullArgs.map(a => escapeShellArg(a)).join(' ')}`;
    // `exec` replaces bash with tmux client, so node-pty onExit fires when tmux session ends
    // Use `bash -lc` inside tmux so that login-shell profile is sourced (ensures claude is on PATH)
    const tmuxCmd = `tmux new-session -d -s ${escapeShellArg(tmuxName)} "bash -lc ${escapeShellArg(claudeCmd)}" && exec tmux attach -t ${escapeShellArg(tmuxName)}\n`;

    log.info({ tmuxSession: tmuxName, cmd: tmuxCmd.trim() }, 'sending tmux-wrapped claude command');
    proc.write(tmuxCmd);

    // Handle output
    proc.onData((data) => {
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
    });

    // Handle exit
    proc.onExit(({ exitCode }) => {
      log.info({ exitCode }, 'tmux client exited');
      this.cleanup(sessionId);
      // SessionEnd hook will POST the claudeSessionId via /api/hooks/event.
      // We emit exit with null — the hook callback will set the claudeSessionId separately.
      this.emit('exit', sessionId, exitCode, null);
    });

    // Skills are self-documenting via their CLAUDE.md — no intro message needed

    return {
      pid: proc.pid,
      sessionId,
      write: (data: string) => proc.write(data),
      resize: (cols: number, rows: number) => proc.resize(cols, rows),
      kill: () => {
        log.info('killing claude process via tmux');
        // Kill the tmux session first (kills Claude inside), then kill outer bash
        killTmuxSession(tmuxName);
        try { proc.kill(); } catch { /* already dead */ }
      },
    };
  }

  getProcess(sessionId: string): pty.IPty | undefined {
    return this.processes.get(sessionId);
  }

  /**
   * Attempt to reattach to a tmux session that survived a hub crash.
   * Returns the PtyProcess if successful, null if tmux session is dead.
   */
  reattachSession(sessionId: string): PtyProcess | null {
    const log = createSessionLogger(sessionId);
    const tmuxName = getTmuxSessionName(sessionId);

    if (!isTmuxSessionAlive(tmuxName)) {
      log.info({ tmuxSession: tmuxName }, 'local tmux session is dead, cannot reattach');
      return null;
    }

    log.info({ tmuxSession: tmuxName }, 'reattaching to surviving local tmux session');

    // Spawn new shell via node-pty and attach to existing tmux session
    const shell = PtySpawner.resolveShell();
    const proc = pty.spawn(shell, ['--norc', '--noprofile'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
    });

    this.processes.set(sessionId, proc);
    this.processDimensions.set(sessionId, { cols: 120, rows: 40 });
    this.outputBuffers.set(sessionId, '');
    this.terminalParsers.set(sessionId, new TerminalParser());

    // `exec` replaces bash with tmux client
    const attachCmd = `exec tmux attach -t ${escapeShellArg(tmuxName)}\n`;
    proc.write(attachCmd);

    // Wire up same data/exit handlers
    proc.onData((data) => {
      const buf = (this.outputBuffers.get(sessionId) || '') + data;
      this.outputBuffers.set(sessionId, buf.slice(-4096));
      this.emit('data', sessionId, data);

      const parser = this.terminalParsers.get(sessionId);
      if (parser) {
        const commands = parser.parse(data);
        for (const cmd of commands) {
          this.emit('board_command', sessionId, cmd);
        }
      }

      this.scheduleScrollbackWrite(sessionId, data);
    });

    proc.onExit(({ exitCode }) => {
      log.info({ exitCode }, 'reattached tmux client exited');
      this.cleanup(sessionId);
      this.emit('exit', sessionId, exitCode, null);
    });

    log.info({ tmuxSession: tmuxName, pid: proc.pid }, 'successfully reattached to local tmux session');

    return {
      pid: proc.pid,
      sessionId,
      write: (data: string) => proc.write(data),
      resize: (cols: number, rows: number) => proc.resize(cols, rows),
      kill: () => {
        log.info('killing reattached claude process via tmux');
        killTmuxSession(tmuxName);
        try { proc.kill(); } catch { /* already dead */ }
      },
    };
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
      this.processDimensions.set(sessionId, { cols, rows });
    }
  }

  getDimensions(sessionId: string): { cols: number; rows: number } | undefined {
    return this.processDimensions.get(sessionId);
  }

  kill(sessionId: string): void {
    const tmuxName = getTmuxSessionName(sessionId);
    // Kill tmux session first (kills Claude inside tmux)
    killTmuxSession(tmuxName);

    const proc = this.processes.get(sessionId);
    if (proc) {
      try {
        // Kill the outer bash/tmux client process
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

  private cleanup(sessionId: string): void {
    // Flush any pending scrollback before cleaning up
    this.flushScrollback(sessionId);

    this.processes.delete(sessionId);
    this.processDimensions.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.terminalParsers.delete(sessionId);
  }

  private scheduleScrollbackWrite(sessionId: string, data: string): void {
    // Accumulate ALL data chunks in the pending buffer
    const pending = this.scrollbackPending.get(sessionId) || '';
    this.scrollbackPending.set(sessionId, pending + data);

    // Throttle disk writes to every 500ms — reduces worst-case data loss on crash
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
    }, 500);

    this.scrollbackWriters.set(sessionId, timer);
  }

  /** Flush any pending scrollback data to disk immediately. */
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
    logger.info({ count: this.processes.size }, 'destroying all pty processes');

    // Track tmux session names we're killing so we can clean up orphans
    const trackedTmuxNames = new Set<string>();

    for (const [sessionId, proc] of this.processes) {
      const tmuxName = getTmuxSessionName(sessionId);
      trackedTmuxNames.add(tmuxName);

      // Kill the tmux session (kills Claude inside)
      killTmuxSession(tmuxName);

      try {
        // Kill the outer bash/tmux client process
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
      this.cleanup(sessionId);
    }

    // Clean up any orphaned c3-* tmux sessions not tracked by this instance
    const orphansKilled = cleanupOrphanedTmuxSessions(trackedTmuxNames);
    if (orphansKilled > 0) {
      logger.info({ count: orphansKilled }, 'killed orphaned tmux sessions');
    }
  }

  /** Check if a skill name belongs to an extension (auto-skill or custom symlink) */
  private isExtensionSkill(skillName: string, extensionsDir: string): boolean {
    // Auto-skills follow the pattern: adyx.<extName>.open / .comment / .select-text
    const autoSuffixes = ['.open', '.comment', '.select-text'];
    for (const suffix of autoSuffixes) {
      if (skillName.endsWith(suffix)) {
        // Strip adyx. prefix and action suffix to get extension name
        const extName = skillName.replace(/^adyx\./, '').slice(0, -suffix.length);
        if (fs.existsSync(path.join(extensionsDir, extName, 'manifest.json'))) return true;
      }
    }
    // Check if any extension declares this as a custom skill
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
}
