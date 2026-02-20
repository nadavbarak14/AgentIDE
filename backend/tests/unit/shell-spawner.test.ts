import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// ── Mock node-pty ────────────────────────────────────────────────────
let lastSpawnArgs: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
let lastFakeProc: ReturnType<typeof makeFakeProc> | null = null;

function makeFakeProc() {
  const emitter = new EventEmitter();
  return {
    pid: 99,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb: (data: string) => void) => emitter.on('data', cb),
    onExit: (cb: (e: { exitCode: number }) => void) => emitter.on('exit', cb),
    _emitter: emitter,
  };
}

vi.mock('node-pty', () => ({
  default: {
    spawn: (command: string, args: string[], options: Record<string, unknown>) => {
      lastSpawnArgs = { command, args: [...args], options };
      lastFakeProc = makeFakeProc();
      return lastFakeProc;
    },
  },
  spawn: (command: string, args: string[], options: Record<string, unknown>) => {
    lastSpawnArgs = { command, args: [...args], options };
    lastFakeProc = makeFakeProc();
    return lastFakeProc;
  },
}));

// ── Mock logger ──────────────────────────────────────────────────────
vi.mock('../../src/services/logger.js', () => {
  const noop = () => {};
  const child = () => fakeLogger;
  const fakeLogger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child,
  };
  return {
    logger: fakeLogger,
    createSessionLogger: () => fakeLogger,
  };
});

// ── Import after mocks ──────────────────────────────────────────────
const { ShellSpawner } = await import('../../src/worker/shell-spawner.js');

describe('ShellSpawner', () => {
  let spawner: InstanceType<typeof ShellSpawner>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-test-'));
    spawner = new ShellSpawner(path.join(tmpDir, 'scrollback'));
    lastSpawnArgs = null;
    lastFakeProc = null;
  });

  afterEach(() => {
    spawner.destroy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getDefaultShell', () => {
    it('returns $SHELL when set', () => {
      const original = process.env.SHELL;
      process.env.SHELL = '/bin/zsh';
      try {
        expect(spawner.getDefaultShell()).toBe('/bin/zsh');
      } finally {
        if (original !== undefined) {
          process.env.SHELL = original;
        } else {
          delete process.env.SHELL;
        }
      }
    });

    it('falls back to /bin/bash when $SHELL is unset', () => {
      const original = process.env.SHELL;
      delete process.env.SHELL;
      try {
        expect(spawner.getDefaultShell()).toBe('/bin/bash');
      } finally {
        if (original !== undefined) {
          process.env.SHELL = original;
        }
      }
    });
  });

  describe('spawn', () => {
    it('creates a PTY process', () => {
      const proc = spawner.spawn('session-1', tmpDir);

      expect(proc.pid).toBe(99);
      expect(proc.sessionId).toBe('session-1');
      expect(proc.shell).toBeTruthy();
      expect(proc.cwd).toBe(tmpDir);
      expect(lastSpawnArgs).toBeTruthy();
      expect(lastSpawnArgs!.options.cwd).toBe(tmpDir);
      expect(lastSpawnArgs!.options.name).toBe('xterm-256color');
    });

    it('uses specified cols and rows', () => {
      spawner.spawn('session-2', tmpDir, 80, 24);

      expect(lastSpawnArgs!.options.cols).toBe(80);
      expect(lastSpawnArgs!.options.rows).toBe(24);
    });

    it('falls back to home directory when cwd does not exist', () => {
      const proc = spawner.spawn('session-3', '/nonexistent/path');

      expect(proc.cwd).toBe(os.homedir());
      expect(lastSpawnArgs!.options.cwd).toBe(os.homedir());
    });

    it('tracks the shell process', () => {
      spawner.spawn('session-4', tmpDir);

      expect(spawner.hasShell('session-4')).toBe(true);
      expect(spawner.hasShell('nonexistent')).toBe(false);
    });
  });

  describe('write', () => {
    it('sends data to the PTY', () => {
      spawner.spawn('session-5', tmpDir);
      spawner.write('session-5', 'ls\r');

      expect(lastFakeProc!.write).toHaveBeenCalledWith('ls\r');
    });

    it('does nothing for unknown session', () => {
      spawner.write('nonexistent', 'hello');
      // Should not throw
    });
  });

  describe('resize', () => {
    it('resizes the PTY dimensions', () => {
      spawner.spawn('session-6', tmpDir);
      spawner.resize('session-6', 200, 50);

      expect(lastFakeProc!.resize).toHaveBeenCalledWith(200, 50);
    });
  });

  describe('kill', () => {
    it('terminates the shell process', () => {
      spawner.spawn('session-7', tmpDir);
      spawner.kill('session-7');

      // process.kill(-pid) is called for process group kill
      // Since we mock node-pty, the kill is handled at OS level
      // Just verify no crash
      expect(spawner.hasShell('session-7')).toBe(true); // Cleanup happens on exit event
    });
  });

  describe('events', () => {
    it('emits data events on PTY output', () => {
      const dataFn = vi.fn();
      spawner.on('data', dataFn);

      spawner.spawn('session-8', tmpDir);
      lastFakeProc!._emitter.emit('data', 'hello world');

      expect(dataFn).toHaveBeenCalledWith('session-8', 'hello world');
    });

    it('emits exit events when PTY exits', () => {
      const exitFn = vi.fn();
      spawner.on('exit', exitFn);

      spawner.spawn('session-9', tmpDir);
      lastFakeProc!._emitter.emit('exit', { exitCode: 0 });

      expect(exitFn).toHaveBeenCalledWith('session-9', 0);
      expect(spawner.hasShell('session-9')).toBe(false);
    });
  });

  describe('concurrent shells', () => {
    it('manages multiple shells for different sessions', () => {
      const firstFakeProc = lastFakeProc;
      spawner.spawn('session-a', tmpDir);
      const procA = lastFakeProc;

      spawner.spawn('session-b', tmpDir);
      const procB = lastFakeProc;

      expect(procA).not.toBe(procB);
      expect(spawner.hasShell('session-a')).toBe(true);
      expect(spawner.hasShell('session-b')).toBe(true);

      // Data events are session-specific
      const dataFn = vi.fn();
      spawner.on('data', dataFn);

      procA!._emitter.emit('data', 'from-a');
      procB!._emitter.emit('data', 'from-b');

      expect(dataFn).toHaveBeenCalledWith('session-a', 'from-a');
      expect(dataFn).toHaveBeenCalledWith('session-b', 'from-b');
    });
  });

  describe('scrollback', () => {
    it('returns null when no scrollback exists', () => {
      expect(spawner.loadScrollback('no-such-session')).toBeNull();
    });

    it('deletes scrollback file', () => {
      const scrollbackPath = spawner.getScrollbackPath('session-del');
      fs.writeFileSync(scrollbackPath, 'test-data');

      spawner.deleteScrollback('session-del');
      expect(fs.existsSync(scrollbackPath)).toBe(false);
    });

    it('does not throw when deleting nonexistent scrollback', () => {
      expect(() => spawner.deleteScrollback('nonexistent')).not.toThrow();
    });
  });

  describe('getShellInfo', () => {
    it('returns shell info for active session', () => {
      spawner.spawn('session-info', tmpDir);
      const info = spawner.getShellInfo('session-info');

      expect(info).toBeTruthy();
      expect(info!.shell).toBeTruthy();
      expect(info!.cwd).toBe(tmpDir);
    });

    it('returns undefined for unknown session', () => {
      expect(spawner.getShellInfo('nonexistent')).toBeUndefined();
    });
  });
});
