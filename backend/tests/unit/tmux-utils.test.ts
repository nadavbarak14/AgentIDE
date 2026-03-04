import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock logger
vi.mock('../../src/services/logger.js', () => {
  const noop = () => {};
  const fakeLogger = { info: noop, warn: noop, error: noop, debug: noop, child: () => fakeLogger };
  return { logger: fakeLogger, createSessionLogger: () => fakeLogger };
});

import { execFileSync } from 'node:child_process';
import {
  escapeShellArg,
  getTmuxSessionName,
  checkTmuxAvailable,
  isTmuxSessionAlive,
  killTmuxSession,
  listC3TmuxSessions,
  cleanupOrphanedTmuxSessions,
} from '../../src/worker/tmux-utils.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tmux-utils', () => {
  describe('escapeShellArg', () => {
    it('wraps simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
    });

    it('escapes single quotes within strings', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
    });

    it('handles empty string', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('handles strings with spaces', () => {
      expect(escapeShellArg('hello world')).toBe("'hello world'");
    });
  });

  describe('getTmuxSessionName', () => {
    it('returns c3- prefix with first 8 chars of session ID', () => {
      expect(getTmuxSessionName('abcdef12-3456-7890')).toBe('c3-abcdef12');
    });

    it('handles short session IDs', () => {
      expect(getTmuxSessionName('abc')).toBe('c3-abc');
    });

    it('handles exact 8-char IDs', () => {
      expect(getTmuxSessionName('12345678')).toBe('c3-12345678');
    });
  });

  describe('checkTmuxAvailable', () => {
    it('returns version string when tmux is available', () => {
      mockExecFileSync.mockReturnValue('tmux 3.3a\n');
      expect(checkTmuxAvailable()).toBe('tmux 3.3a');
      expect(mockExecFileSync).toHaveBeenCalledWith('tmux', ['-V'], expect.any(Object));
    });

    it('returns null when tmux is not found', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      expect(checkTmuxAvailable()).toBeNull();
    });
  });

  describe('isTmuxSessionAlive', () => {
    it('returns true when session exists', () => {
      mockExecFileSync.mockReturnValue('');
      expect(isTmuxSessionAlive('c3-abcdef12')).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith('tmux', ['has-session', '-t', 'c3-abcdef12'], expect.any(Object));
    });

    it('returns false when session does not exist', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no session'); });
      expect(isTmuxSessionAlive('c3-abcdef12')).toBe(false);
    });
  });

  describe('killTmuxSession', () => {
    it('calls tmux kill-session', () => {
      mockExecFileSync.mockReturnValue('');
      killTmuxSession('c3-abcdef12');
      expect(mockExecFileSync).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'c3-abcdef12'], expect.any(Object));
    });

    it('does not throw when session is already dead', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no session'); });
      expect(() => killTmuxSession('c3-abcdef12')).not.toThrow();
    });
  });

  describe('listC3TmuxSessions', () => {
    it('returns c3-prefixed sessions', () => {
      mockExecFileSync.mockReturnValue('c3-abc\nc3-def\nother-session\n');
      expect(listC3TmuxSessions()).toEqual(['c3-abc', 'c3-def']);
    });

    it('returns empty array when no sessions exist', () => {
      mockExecFileSync.mockImplementation(() => { throw new Error('no server running'); });
      expect(listC3TmuxSessions()).toEqual([]);
    });

    it('returns empty array when output is empty', () => {
      mockExecFileSync.mockReturnValue('');
      expect(listC3TmuxSessions()).toEqual([]);
    });
  });

  describe('cleanupOrphanedTmuxSessions', () => {
    it('kills sessions not in the tracked set', () => {
      // listC3TmuxSessions returns 3, but only 1 is tracked
      mockExecFileSync
        .mockReturnValueOnce('c3-aaa\nc3-bbb\nc3-ccc\n') // listC3TmuxSessions
        .mockReturnValue(''); // killTmuxSession calls

      const tracked = new Set(['c3-aaa']);
      const killed = cleanupOrphanedTmuxSessions(tracked);

      expect(killed).toBe(2);
      // Should have called kill for c3-bbb and c3-ccc
      expect(mockExecFileSync).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'c3-bbb'], expect.any(Object));
      expect(mockExecFileSync).toHaveBeenCalledWith('tmux', ['kill-session', '-t', 'c3-ccc'], expect.any(Object));
    });

    it('returns 0 when all sessions are tracked', () => {
      mockExecFileSync.mockReturnValue('c3-aaa\n');
      const tracked = new Set(['c3-aaa']);
      expect(cleanupOrphanedTmuxSessions(tracked)).toBe(0);
    });
  });
});
