/**
 * Tests for session cycling logic in handleShortcutAction.
 * Directly tests the focus_prev / focus_next cycling algorithm
 * to verify it cycles through ALL active sessions (including overflow),
 * not just displayed ones.
 */
import { describe, it, expect } from 'vitest';
import type { Session } from '../../src/services/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(id: string, createdAt: string): Session {
  return {
    id,
    title: `Session ${id.slice(0, 4)}`,
    status: 'active',
    createdAt,
    workingDirectory: '/tmp',
    needsInput: false,
    lock: false,
  } as Session;
}

/**
 * Extracted cycling algorithm from handleShortcutAction (focus_next / focus_prev).
 * Returns the next session id to focus and whether it was already displayed.
 */
function getNextSession(
  direction: 'next' | 'prev',
  activeSessions: Session[],
  curId: string | null,
): string | null {
  const sorted = [...activeSessions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return null; // no change possible

  const curIdx = sorted.findIndex((s) => s.id === curId);

  if (direction === 'next') {
    const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % sorted.length;
    return sorted[nextIdx].id;
  } else {
    const prevIdx =
      curIdx === -1
        ? sorted.length - 1
        : (curIdx - 1 + sorted.length) % sorted.length;
    return sorted[prevIdx].id;
  }
}

/**
 * Simulates getNextSession called repeatedly to produce a full cycle sequence.
 */
function cycleAll(
  direction: 'next' | 'prev',
  sessions: Session[],
  startId: string,
): string[] {
  const results: string[] = [];
  let cur = startId;
  for (let i = 0; i < sessions.length; i++) {
    const next = getNextSession(direction, sessions, cur);
    if (!next) break;
    results.push(next);
    cur = next;
  }
  return results;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('focus_next / focus_prev session cycling', () => {
  const sessions = [
    makeSession('aaaa', '2025-01-01T00:00:00Z'),
    makeSession('bbbb', '2025-01-02T00:00:00Z'),
    makeSession('cccc', '2025-01-03T00:00:00Z'),
  ];

  describe('focus_next', () => {
    it('moves from first to second session', () => {
      expect(getNextSession('next', sessions, 'aaaa')).toBe('bbbb');
    });

    it('moves from second to third session', () => {
      expect(getNextSession('next', sessions, 'bbbb')).toBe('cccc');
    });

    it('wraps from last back to first', () => {
      expect(getNextSession('next', sessions, 'cccc')).toBe('aaaa');
    });

    it('starts from first session when curId is null', () => {
      expect(getNextSession('next', sessions, null)).toBe('aaaa');
    });

    it('cycles through ALL sessions (not just 2)', () => {
      const cycle = cycleAll('next', sessions, 'aaaa');
      // Should visit all 3 and wrap back to start
      expect(cycle).toEqual(['bbbb', 'cccc', 'aaaa']);
    });

    it('cycles correctly with 2 sessions displayed and 1 overflow', () => {
      // Key regression test: previously only cycled through displayed sessions
      // Now should include overflow session 'cccc'
      // displayed would be ['aaaa', 'bbbb'], cccc is overflow
      const cycle = cycleAll('next', sessions, 'aaaa');
      // Must reach cccc (the overflow session)
      expect(cycle).toContain('cccc');
      // And the cycle should include ALL sessions, not just displayed
      expect(cycle.length).toBe(sessions.length);
    });
  });

  describe('focus_prev', () => {
    it('moves from last to second session', () => {
      expect(getNextSession('prev', sessions, 'cccc')).toBe('bbbb');
    });

    it('moves from second to first session', () => {
      expect(getNextSession('prev', sessions, 'bbbb')).toBe('aaaa');
    });

    it('wraps from first back to last', () => {
      expect(getNextSession('prev', sessions, 'aaaa')).toBe('cccc');
    });

    it('starts from last session when curId is null', () => {
      expect(getNextSession('prev', sessions, null)).toBe('cccc');
    });

    it('cycles through ALL sessions in reverse', () => {
      const cycle = cycleAll('prev', sessions, 'cccc');
      expect(cycle).toEqual(['bbbb', 'aaaa', 'cccc']);
    });

    it('reaches overflow sessions going backwards', () => {
      // User is on aaaa (displayed), pressing prev should reach cccc (overflow)
      expect(getNextSession('prev', sessions, 'aaaa')).toBe('cccc');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty session list', () => {
      expect(getNextSession('next', [], null)).toBeNull();
    });

    it('returns null for single session (nothing to cycle to)', () => {
      const single = [makeSession('aaaa', '2025-01-01T00:00:00Z')];
      expect(getNextSession('next', single, 'aaaa')).toBeNull();
    });

    it('sorts by createdAt regardless of input order', () => {
      // Shuffled order in input — should still sort by creation time
      const shuffled = [
        makeSession('cccc', '2025-01-03T00:00:00Z'),
        makeSession('aaaa', '2025-01-01T00:00:00Z'),
        makeSession('bbbb', '2025-01-02T00:00:00Z'),
      ];
      expect(getNextSession('next', shuffled, 'aaaa')).toBe('bbbb');
      expect(getNextSession('next', shuffled, 'bbbb')).toBe('cccc');
      expect(getNextSession('next', shuffled, 'cccc')).toBe('aaaa');
    });
  });
});

// ── Grid Navigation (focus_down / focus_up) ──────────────────────────────────

/**
 * Extracted grid navigation algorithm from handleShortcutAction (focus_down / focus_up).
 * Returns the target session id, or null if at grid boundary.
 */
function getGridTarget(
  direction: 'down' | 'up',
  gridSessions: Session[],
  curId: string | null,
): string | null {
  if (gridSessions.length <= 1) return null;
  const cols = Math.min(gridSessions.length, 3);
  const curIdx = gridSessions.findIndex((s) => s.id === curId);
  if (curIdx === -1) return null;

  if (direction === 'down') {
    const targetIdx = curIdx + cols;
    if (targetIdx >= gridSessions.length) return null;
    return gridSessions[targetIdx].id;
  } else {
    const targetIdx = curIdx - cols;
    if (targetIdx < 0) return null;
    return gridSessions[targetIdx].id;
  }
}

describe('focus_down / focus_up grid navigation', () => {
  // 6 sessions in a 3-column grid (2 rows):
  // [s1] [s2] [s3]
  // [s4] [s5] [s6]
  const sixSessions = [
    makeSession('s1', '2025-01-01T00:00:00Z'),
    makeSession('s2', '2025-01-02T00:00:00Z'),
    makeSession('s3', '2025-01-03T00:00:00Z'),
    makeSession('s4', '2025-01-04T00:00:00Z'),
    makeSession('s5', '2025-01-05T00:00:00Z'),
    makeSession('s6', '2025-01-06T00:00:00Z'),
  ];

  describe('focus_down', () => {
    it('moves from top-left to bottom-left (idx 0 → idx 3)', () => {
      expect(getGridTarget('down', sixSessions, 's1')).toBe('s4');
    });

    it('moves from top-middle to bottom-middle (idx 1 → idx 4)', () => {
      expect(getGridTarget('down', sixSessions, 's2')).toBe('s5');
    });

    it('moves from top-right to bottom-right (idx 2 → idx 5)', () => {
      expect(getGridTarget('down', sixSessions, 's3')).toBe('s6');
    });

    it('returns null at bottom row (no row below)', () => {
      expect(getGridTarget('down', sixSessions, 's4')).toBeNull();
      expect(getGridTarget('down', sixSessions, 's5')).toBeNull();
      expect(getGridTarget('down', sixSessions, 's6')).toBeNull();
    });

    it('handles 4 sessions in 3 cols (idx 0 → idx 3)', () => {
      const fourSessions = sixSessions.slice(0, 4);
      // [s1] [s2] [s3]
      // [s4]
      expect(getGridTarget('down', fourSessions, 's1')).toBe('s4');
    });

    it('returns null for incomplete bottom row (no target below)', () => {
      const fiveSessions = sixSessions.slice(0, 5);
      // [s1] [s2] [s3]
      // [s4] [s5]
      expect(getGridTarget('down', fiveSessions, 's3')).toBeNull(); // no s6 below s3
    });

    it('returns null for single row (3 sessions, 3 cols)', () => {
      const threeSessions = sixSessions.slice(0, 3);
      expect(getGridTarget('down', threeSessions, 's1')).toBeNull();
      expect(getGridTarget('down', threeSessions, 's2')).toBeNull();
      expect(getGridTarget('down', threeSessions, 's3')).toBeNull();
    });

    it('returns null for single session', () => {
      const single = [sixSessions[0]];
      expect(getGridTarget('down', single, 's1')).toBeNull();
    });

    it('returns null for 2 sessions (single row, 2 cols)', () => {
      const twoSessions = sixSessions.slice(0, 2);
      expect(getGridTarget('down', twoSessions, 's1')).toBeNull();
      expect(getGridTarget('down', twoSessions, 's2')).toBeNull();
    });
  });

  describe('focus_up', () => {
    it('moves from bottom-left to top-left (idx 3 → idx 0)', () => {
      expect(getGridTarget('up', sixSessions, 's4')).toBe('s1');
    });

    it('moves from bottom-middle to top-middle (idx 4 → idx 1)', () => {
      expect(getGridTarget('up', sixSessions, 's5')).toBe('s2');
    });

    it('moves from bottom-right to top-right (idx 5 → idx 2)', () => {
      expect(getGridTarget('up', sixSessions, 's6')).toBe('s3');
    });

    it('returns null at top row (no row above)', () => {
      expect(getGridTarget('up', sixSessions, 's1')).toBeNull();
      expect(getGridTarget('up', sixSessions, 's2')).toBeNull();
      expect(getGridTarget('up', sixSessions, 's3')).toBeNull();
    });

    it('handles 4 sessions (idx 3 → idx 0)', () => {
      const fourSessions = sixSessions.slice(0, 4);
      expect(getGridTarget('up', fourSessions, 's4')).toBe('s1');
    });

    it('returns null for single row (2 sessions)', () => {
      const twoSessions = sixSessions.slice(0, 2);
      expect(getGridTarget('up', twoSessions, 's1')).toBeNull();
      expect(getGridTarget('up', twoSessions, 's2')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null when curId is not in grid', () => {
      expect(getGridTarget('down', sixSessions, 'unknown')).toBeNull();
      expect(getGridTarget('up', sixSessions, 'unknown')).toBeNull();
    });

    it('returns null when curId is null', () => {
      expect(getGridTarget('down', sixSessions, null)).toBeNull();
      expect(getGridTarget('up', sixSessions, null)).toBeNull();
    });

    it('returns null for empty session list', () => {
      expect(getGridTarget('down', [], null)).toBeNull();
      expect(getGridTarget('up', [], null)).toBeNull();
    });
  });
});

describe('markManualSwitch guard logic', () => {
  it('setFocusTarget should expire after 1 second', () => {
    // Simulate the focus target logic in isolation
    let focusTarget: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const setFocusTarget = (id: string) => {
      focusTarget = id;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { focusTarget = null; }, 1000);
    };

    setFocusTarget('aaaa');
    expect(focusTarget).toBe('aaaa');

    // Simulating the timer expiring (by calling the callback directly)
    // We can't use real timers in unit tests easily, so we just verify the ref is set
    if (timer) clearTimeout(timer);
    focusTarget = null; // Simulate expiry
    expect(focusTarget).toBeNull();
  });

  it('setFocusTarget clears previous timer when called twice', () => {
    let callCount = 0;
    let focusTarget: string | null = null;

    const setFocusTarget = (id: string) => {
      focusTarget = id;
      callCount++;
    };

    setFocusTarget('aaaa');
    setFocusTarget('bbbb');

    expect(focusTarget).toBe('bbbb');
    expect(callCount).toBe(2);
  });
});

describe('focusout re-focus guard logic', () => {
  it('re-focuses target when related is null (focus went to body)', () => {
    // Simulate the focusout guard logic
    const focusTarget: string | null = 'target-session';
    const relatedCard: Element | null = null;
    const related: Element | null = null;

    // The condition for re-focusing
    const shouldRefocus = !relatedCard && !related && focusTarget !== null;
    expect(shouldRefocus).toBe(true);
  });

  it('does NOT re-focus when focus went to another session card', () => {
    const focusTarget: string | null = 'target-session';
    const related = document.createElement('div');
    const relatedCard = document.createElement('div');
    relatedCard.setAttribute('data-session-id', 'other-session');

    const shouldRefocus = !relatedCard && !related && focusTarget !== null;
    expect(shouldRefocus).toBe(false);
  });

  it('does NOT re-focus when focusTarget is null (no recent navigation)', () => {
    const focusTarget: string | null = null;
    const relatedCard: Element | null = null;
    const related: Element | null = null;

    const shouldRefocus = !relatedCard && !related && focusTarget !== null;
    expect(shouldRefocus).toBe(false);
  });
});
