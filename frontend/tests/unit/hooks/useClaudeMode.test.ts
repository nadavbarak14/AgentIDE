import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClaudeMode } from '../../../src/hooks/useClaudeMode';

describe('useClaudeMode', () => {
  function renderMode(needsInput: boolean, status: string, outputBuffer: string[]) {
    const { result } = renderHook(() => useClaudeMode(needsInput, status, outputBuffer));
    return result.current.mode;
  }

  describe('idle mode', () => {
    it('returns idle when status is completed', () => {
      expect(renderMode(false, 'completed', [])).toBe('idle');
    });

    it('returns idle when status is failed', () => {
      expect(renderMode(false, 'failed', [])).toBe('idle');
    });

    it('returns idle even when needsInput is true but status is completed', () => {
      expect(renderMode(true, 'completed', ['some output'])).toBe('idle');
    });

    it('returns idle even when needsInput is true but status is failed', () => {
      expect(renderMode(true, 'failed', ['Allow? (y/n)'])).toBe('idle');
    });
  });

  describe('generating mode', () => {
    it('returns generating when needsInput is false and status is active', () => {
      expect(renderMode(false, 'active', [])).toBe('generating');
    });

    it('returns generating when needsInput is false regardless of output', () => {
      expect(renderMode(false, 'active', ['Allow? (y/n)'])).toBe('generating');
    });
  });

  describe('permission mode', () => {
    it('detects (y/n) pattern', () => {
      expect(renderMode(true, 'active', ['Allow this action? (y/n)'])).toBe('permission');
    });

    it('detects (Y/n) pattern', () => {
      expect(renderMode(true, 'active', ['Continue? (Y/n)'])).toBe('permission');
    });

    it('detects (yes/no) pattern', () => {
      expect(renderMode(true, 'active', ['Proceed with changes? (yes/no)'])).toBe('permission');
    });

    it('detects Allow? pattern', () => {
      expect(renderMode(true, 'active', ['Allow?'])).toBe('permission');
    });

    it('detects Deny? pattern', () => {
      expect(renderMode(true, 'active', ['Deny?'])).toBe('permission');
    });

    it('detects "approve" in output', () => {
      expect(renderMode(true, 'active', ['Do you approve this change?'])).toBe('permission');
    });

    it('detects "reject" in output', () => {
      expect(renderMode(true, 'active', ['Type reject to cancel'])).toBe('permission');
    });

    it('detects "permission" in output', () => {
      expect(renderMode(true, 'active', ['Requesting permission to write file'])).toBe('permission');
    });

    it('detects "Do you want to proceed?" pattern', () => {
      expect(renderMode(true, 'active', ['Do you want to proceed?'])).toBe('permission');
    });

    it('detects permission in last 5 lines even with other output', () => {
      const buffer = [
        'line 1',
        'line 2',
        'line 3',
        'line 4',
        'Allow this edit? (y/n)',
      ];
      expect(renderMode(true, 'active', buffer)).toBe('permission');
    });

    it('ignores permission patterns beyond last 5 lines', () => {
      const buffer = [
        'Allow? (y/n)',  // line 1 — outside last 5
        'normal output 2',
        'normal output 3',
        'normal output 4',
        'normal output 5',
        'normal output 6',
      ];
      expect(renderMode(true, 'active', buffer)).toBe('input');
    });
  });

  describe('input mode', () => {
    it('returns input when needsInput and no permission pattern', () => {
      expect(renderMode(true, 'active', ['Enter your message:'])).toBe('input');
    });

    it('returns input with empty output buffer', () => {
      expect(renderMode(true, 'active', [])).toBe('input');
    });

    it('returns input with only normal output', () => {
      const buffer = [
        'Reading file...',
        'Processing...',
        'Done.',
        '> ',
      ];
      expect(renderMode(true, 'active', buffer)).toBe('input');
    });
  });

  describe('edge cases', () => {
    it('handles empty output buffer gracefully', () => {
      expect(renderMode(false, 'active', [])).toBe('generating');
      expect(renderMode(true, 'active', [])).toBe('input');
      expect(renderMode(false, 'completed', [])).toBe('idle');
    });

    it('is case insensitive for permission patterns', () => {
      expect(renderMode(true, 'active', ['ALLOW? (Y/N)'])).toBe('permission');
      expect(renderMode(true, 'active', ['do you want to proceed?'])).toBe('permission');
    });

    it('handles crashed status as generating (not idle)', () => {
      // crashed is not in the idle list — session may recover
      expect(renderMode(false, 'crashed', [])).toBe('generating');
    });
  });
});
