import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClaudeMode } from '../../../src/hooks/useClaudeMode';

describe('useClaudeMode', () => {
  function renderMode(needsInput: boolean, status: string, waitReason: string | null) {
    const { result } = renderHook(() => useClaudeMode(needsInput, status, waitReason));
    return result.current.mode;
  }

  describe('idle mode', () => {
    it('returns idle when status is completed', () => {
      expect(renderMode(false, 'completed', null)).toBe('idle');
    });

    it('returns idle when status is failed', () => {
      expect(renderMode(false, 'failed', null)).toBe('idle');
    });

    it('returns idle even when needsInput is true but status is completed', () => {
      expect(renderMode(true, 'completed', 'question')).toBe('idle');
    });

    it('returns idle even when needsInput is true but status is failed', () => {
      expect(renderMode(true, 'failed', 'permission')).toBe('idle');
    });
  });

  describe('generating mode', () => {
    it('returns generating when needsInput is false and status is active', () => {
      expect(renderMode(false, 'active', null)).toBe('generating');
    });

    it('returns generating when needsInput is false regardless of waitReason', () => {
      expect(renderMode(false, 'active', 'permission')).toBe('generating');
    });
  });

  describe('permission mode', () => {
    it('returns permission when waitReason is permission and needsInput is true', () => {
      expect(renderMode(true, 'active', 'permission')).toBe('permission');
    });
  });

  describe('input mode', () => {
    it('returns input when waitReason is question and needsInput is true', () => {
      expect(renderMode(true, 'active', 'question')).toBe('input');
    });

    it('returns input when waitReason is stopped and needsInput is true', () => {
      expect(renderMode(true, 'active', 'stopped')).toBe('input');
    });

    it('returns input when waitReason is null and needsInput is true (remote idle fallback)', () => {
      expect(renderMode(true, 'active', null)).toBe('input');
    });
  });

  describe('edge cases', () => {
    it('handles crashed status as generating (not idle)', () => {
      // crashed is not in the idle list — session may recover
      expect(renderMode(false, 'crashed', null)).toBe('generating');
    });

    it('prioritises idle over permission for completed sessions', () => {
      expect(renderMode(true, 'completed', 'permission')).toBe('idle');
    });

    it('prioritises generating over permission when needsInput is false', () => {
      expect(renderMode(false, 'active', 'permission')).toBe('generating');
    });
  });
});
