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
    spawner.spawn('test-session-1', '/tmp/work');

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
    spawner.spawn('test-session-2', '/tmp/work');

    expect(mkdirSpy).toHaveBeenCalledWith(
      '/tmp/work/.claude/skills',
      { recursive: true },
    );

    spawner.destroy();
  });

  it('does NOT include --plugin-dir in spawned args', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return true;
      }
      return originalExistsSync(p);
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-3', '/tmp/work');

    expect(lastSpawnArgs).not.toBeNull();
    expect(lastSpawnArgs!.args).not.toContain('--plugin-dir');

    spawner.destroy();
  });

  it('still includes --settings as the first flag pair', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return true;
      }
      return originalExistsSync(p);
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-4', '/tmp/work', ['--verbose']);

    const args = lastSpawnArgs!.args;
    expect(args[0]).toBe('--settings');
    expect(args[1]).toMatch(/settings\.json$/);

    spawner.destroy();
  });

  it('does not send intro message (skills are self-documenting)', () => {
    vi.useFakeTimers();

    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('.claude-skills/skills')) {
        return true;
      }
      return originalExistsSync(p);
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);

    const spawner = new PtySpawner({ scrollbackDir: '/tmp/c3-test-scrollback' });
    spawner.spawn('test-session-5', '/tmp/work');

    // Advance past any potential delay
    vi.advanceTimersByTime(5000);

    expect(lastFakeProc!.write).not.toHaveBeenCalled();

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
    expect(() => spawner.spawn('test-session-6', '/tmp/work')).not.toThrow();

    // cpSync should not have been called
    expect(cpSyncSpy).not.toHaveBeenCalled();

    spawner.destroy();
  });
});
