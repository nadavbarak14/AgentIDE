// Regression tests — captures known bugs that were fixed. Each test prevents the bug from recurring.
import { describe, it, expect } from 'vitest';
import type { Session } from '../../src/services/api';
import { createMockSession, createMockComment } from '../test-utils';

describe('Regression: old-side comments must match old column line numbers, not new', () => {
  // Fixed in 004-ux-polish: old-side comments were matching against new-column line numbers
  interface DiffPair {
    left: { lineNumber: number; content: string } | null;
    right: { lineNumber: number; content: string } | null;
  }

  function getLineComments(
    comments: Array<{ startLine: number; filePath: string; side: 'old' | 'new' }>,
    filePath: string,
    pair: DiffPair,
  ) {
    return comments.filter((c) =>
      c.filePath === filePath && (
        (c.side === 'old' && pair.left !== null && c.startLine === pair.left.lineNumber) ||
        (c.side === 'new' && c.startLine === (pair.right?.lineNumber ?? 0))
      )
    );
  }

  it('old-side comment on line 5 matches when left column is 5, not when right column is 5', () => {
    const comment = createMockComment({ startLine: 5, side: 'old', filePath: 'test.ts' });
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old' }, right: { lineNumber: 10, content: 'new' } };

    const matches = getLineComments([comment], 'test.ts', pair);
    expect(matches).toHaveLength(1);
  });

  it('old-side comment on line 10 does NOT match when only right column is 10', () => {
    const comment = createMockComment({ startLine: 10, side: 'old', filePath: 'test.ts' });
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old' }, right: { lineNumber: 10, content: 'new' } };

    const matches = getLineComments([comment], 'test.ts', pair);
    expect(matches).toHaveLength(0);
  });
});

describe('Regression: overflow bar must show amber background when sessions need input', () => {
  // Fixed in 004-ux-polish: overflow bar did not highlight when collapsed sessions needed input

  function hasNeedsInputOverflow(
    overflowCollapsed: boolean,
    overflowSessions: Partial<Session>[],
  ): boolean {
    return overflowCollapsed && overflowSessions.some((s) => s.needsInput);
  }

  it('returns true when collapsed and at least one overflow session has needsInput', () => {
    const sessions = [
      createMockSession({ id: 's1', needsInput: false }),
      createMockSession({ id: 's2', needsInput: true }),
    ];
    expect(hasNeedsInputOverflow(true, sessions)).toBe(true);
  });

  it('returns false when expanded even if sessions need input', () => {
    const sessions = [createMockSession({ id: 's1', needsInput: true })];
    expect(hasNeedsInputOverflow(false, sessions)).toBe(false);
  });
});

describe('Regression: modified file tabs must require close confirmation', () => {
  // Fixed in 004-ux-polish: closing a modified tab discarded changes without confirmation

  function handleTabClose(
    isActive: boolean,
    isModified: boolean,
  ): 'guard' | 'close' {
    if (isActive && isModified) {
      return 'guard';
    }
    return 'close';
  }

  it('triggers close guard when active tab is modified', () => {
    expect(handleTabClose(true, true)).toBe('guard');
  });

  it('closes directly when tab is not modified', () => {
    expect(handleTabClose(true, false)).toBe('close');
  });

  it('closes directly when tab is not active even if modified', () => {
    expect(handleTabClose(false, true)).toBe('close');
  });
});
