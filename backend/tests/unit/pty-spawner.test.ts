import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

// ── Mock node-pty ────────────────────────────────────────────────────
// PtySpawner imports node-pty at module scope, so we must register the
// mock before the dynamic import below.

let lastSpawnArgs: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
let lastFakeProc: ReturnType<typeof makeFakeProc> | null = null;

function makeFakeProc() {
  const emitter = new EventEmitter();
  return {
    pid: 42,
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

// ── Mock logger to silence output during tests ──────────────────────
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
    createWorkerLogger: () => fakeLogger,
  };
});

// ── Mock tmux-utils to avoid real tmux calls ────────────────────────
vi.mock('../../src/worker/tmux-utils.js', () => ({
  escapeShellArg: (arg: string) => `'${arg.replace(/'/g, "'\\''")}'`,
  getTmuxSessionName: (sessionId: string) => `c3-${sessionId.substring(0, 8)}`,
  isTmuxSessionAlive: vi.fn().mockReturnValue(false),
  killTmuxSession: vi.fn(),
  cleanupOrphanedTmuxSessions: vi.fn().mockReturnValue(0),
}));

// ── Import the module under test AFTER mocks are registered ─────────
// We use a dynamic import so vitest's module-level mocks take effect.
let PtySpawner: typeof import('../../src/worker/pty-spawner.js').PtySpawner;

beforeEach(async () => {
  lastSpawnArgs = null;
  lastFakeProc = null;
  const mod = await import('../../src/worker/pty-spawner.js');
  PtySpawner = mod.PtySpawner;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('PtySpawner — tmux wrapping', () => {
  it('spawns /bin/bash instead of claude directly', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) return false;
      return originalExistsSync(p);
    });

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-1', '/tmp/work');

    expect(lastSpawnArgs).not.toBeNull();
    expect(lastSpawnArgs!.command).toBe('/bin/bash');
    expect(lastSpawnArgs!.args).toEqual(['--norc', '--noprofile']);

    spawner.destroy();
  });

  it('writes tmux command into the bash shell', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) return false;
      return originalExistsSync(p);
    });

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-sess', '/tmp/work');

    expect(lastFakeProc!.write).toHaveBeenCalledTimes(1);
    const writtenCmd = lastFakeProc!.write.mock.calls[0][0] as string;
    expect(writtenCmd).toContain('tmux new-session -d -s');
    expect(writtenCmd).toContain('c3-test-ses');
    expect(writtenCmd).toContain('exec tmux attach');
    expect(writtenCmd).toContain('claude');

    spawner.destroy();
  });

  it('includes --settings and user args in the tmux command', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) return false;
      return originalExistsSync(p);
    });

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-2', '/tmp/work', ['--verbose']);

    const writtenCmd = lastFakeProc!.write.mock.calls[0][0] as string;
    expect(writtenCmd).toContain("'--settings'");
    expect(writtenCmd).toContain("'--verbose'");

    spawner.destroy();
  });

  it('includes C3 env vars in the tmux command', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) return false;
      return originalExistsSync(p);
    });

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback', hubPort: 3001 });
    spawner.spawn('test-session-3', '/tmp/work');

    const writtenCmd = lastFakeProc!.write.mock.calls[0][0] as string;
    expect(writtenCmd).toContain('C3_SESSION_ID=');
    expect(writtenCmd).toContain('test-session-3');
    expect(writtenCmd).toContain('C3_HUB_PORT=3001');

    spawner.destroy();
  });
});

describe('PtySpawner — reattachSession', () => {
  it('returns null when tmux session is dead', async () => {
    const { isTmuxSessionAlive } = await import('../../src/worker/tmux-utils.js');
    vi.mocked(isTmuxSessionAlive).mockReturnValue(false);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    const result = spawner.reattachSession('dead-session');

    expect(result).toBeNull();
    spawner.destroy();
  });

  it('returns PtyProcess when tmux session is alive', async () => {
    const { isTmuxSessionAlive } = await import('../../src/worker/tmux-utils.js');
    vi.mocked(isTmuxSessionAlive).mockReturnValue(true);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    const result = spawner.reattachSession('alive-se');

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('alive-se');
    expect(result!.pid).toBe(42);

    // Should have written tmux attach command
    expect(lastFakeProc!.write).toHaveBeenCalledTimes(1);
    const writtenCmd = lastFakeProc!.write.mock.calls[0][0] as string;
    expect(writtenCmd).toContain('exec tmux attach -t');

    spawner.destroy();
  });
});

describe('PtySpawner — per-session skill injection', () => {
  it('copies skills to session working directory when bundled skills exist', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return true;
      }
      return originalExistsSync(p);
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
    const cpSyncSpy = vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-sk1', '/tmp/work');

    expect(cpSyncSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\.claude-skills\/skills$/),
      '/tmp/work/.claude/skills',
      { recursive: true },
    );

    spawner.destroy();
  });

  it('creates the .claude/skills directory in the session working directory', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return true;
      }
      return originalExistsSync(p);
    });
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-sk2', '/tmp/work');

    expect(mkdirSpy).toHaveBeenCalledWith(
      '/tmp/work/.claude/skills',
      { recursive: true },
    );

    spawner.destroy();
  });

  it('handles gracefully when bundled skills directory does not exist', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return false;
      }
      return originalExistsSync(p);
    });
    const cpSyncSpy = vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });

    // Should not throw
    expect(() => spawner.spawn('test-session-sk3', '/tmp/work')).not.toThrow();

    // cpSync should not have been called
    expect(cpSyncSpy).not.toHaveBeenCalled();

    spawner.destroy();
  });
});
