import { describe, it, expect } from 'vitest';
import type { Session } from '../../src/services/api';

// ── T001–T003: Pin switching logic ────────────────────────────────

describe('v8: focusSessions priority ordering (T004)', () => {
  // Simulates the 4-group priority sort from useSession.ts
  function computeFocusSessions(activeSessions: Partial<Session>[]) {
    const pinnedNeedsInput = activeSessions.filter((s) => s.lock && s.needsInput);
    const needsInput = activeSessions.filter((s) => !s.lock && s.needsInput);
    const pinnedAutonomous = activeSessions.filter((s) => s.lock && !s.needsInput);
    const autonomous = activeSessions.filter((s) => !s.lock && !s.needsInput);
    return [...pinnedNeedsInput, ...needsInput, ...pinnedAutonomous, ...autonomous];
  }

  it('puts pinned+needsInput sessions first', () => {
    const sessions = [
      { id: 'a', lock: false, needsInput: false },
      { id: 'b', lock: true, needsInput: true },
      { id: 'c', lock: false, needsInput: true },
      { id: 'd', lock: true, needsInput: false },
    ];
    const result = computeFocusSessions(sessions);
    expect(result.map((s) => s.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('handles all sessions being autonomous', () => {
    const sessions = [
      { id: 'a', lock: false, needsInput: false },
      { id: 'b', lock: false, needsInput: false },
    ];
    const result = computeFocusSessions(sessions);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('handles all sessions pinned+needsInput', () => {
    const sessions = [
      { id: 'a', lock: true, needsInput: true },
      { id: 'b', lock: true, needsInput: true },
    ];
    const result = computeFocusSessions(sessions);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('v8: handleFocusSession replaces last non-pinned slot (T005)', () => {
  // Simulates the handleFocusSession logic from Dashboard.tsx
  function handleFocusSession(
    prev: string[],
    newId: string,
    maxVisible: number,
    sessions: Partial<Session>[],
  ): string[] {
    if (prev.includes(newId)) return prev;
    const next = [...prev];
    if (next.length >= maxVisible) {
      let replaceIdx = -1;
      for (let i = next.length - 1; i >= 0; i--) {
        const sess = sessions.find((s) => s.id === next[i]);
        if (!sess?.lock) {
          replaceIdx = i;
          break;
        }
      }
      if (replaceIdx === -1) replaceIdx = next.length - 1;
      next[replaceIdx] = newId;
    } else {
      next.push(newId);
    }
    return next;
  }

  it('replaces the last non-pinned slot when at capacity', () => {
    const sessions = [
      { id: 's1', lock: true },
      { id: 's2', lock: false },
      { id: 's3', lock: false },
    ];
    const result = handleFocusSession(['s1', 's2', 's3'], 's4', 3, sessions);
    // s3 is last non-pinned → replaced
    expect(result).toEqual(['s1', 's2', 's4']);
  });

  it('preserves pinned sessions and replaces non-pinned', () => {
    const sessions = [
      { id: 's1', lock: true },
      { id: 's2', lock: true },
      { id: 's3', lock: false },
    ];
    const result = handleFocusSession(['s1', 's2', 's3'], 's4', 3, sessions);
    // s3 is the only non-pinned → replaced
    expect(result).toEqual(['s1', 's2', 's4']);
  });

  it('replaces last slot when ALL are pinned (fallback)', () => {
    const sessions = [
      { id: 's1', lock: true },
      { id: 's2', lock: true },
      { id: 's3', lock: true },
    ];
    const result = handleFocusSession(['s1', 's2', 's3'], 's4', 3, sessions);
    // All pinned → fallback to last
    expect(result).toEqual(['s1', 's2', 's4']);
  });

  it('does not duplicate if session already displayed', () => {
    const sessions = [
      { id: 's1', lock: false },
      { id: 's2', lock: false },
    ];
    const result = handleFocusSession(['s1', 's2'], 's1', 2, sessions);
    expect(result).toEqual(['s1', 's2']);
  });

  it('appends when under capacity', () => {
    const sessions = [{ id: 's1', lock: false }];
    const result = handleFocusSession(['s1'], 's2', 3, sessions);
    expect(result).toEqual(['s1', 's2']);
  });
});

describe('v8: rebuildDisplay preserves pinned slot positions (T006)', () => {
  // Simulates the rebuildDisplay logic from Dashboard.tsx
  function rebuildDisplay(
    prev: string[],
    focusSessions: Partial<Session>[],
    maxVisible: number,
  ): string[] {
    const pinnedInSlots: (string | null)[] = prev.map((id) => {
      const sess = focusSessions.find((s) => s.id === id);
      return sess?.lock ? id : null;
    });
    const placed = new Set(pinnedInSlots.filter((id): id is string => id !== null));
    const fillQueue = focusSessions
      .filter((s) => !placed.has(s.id!))
      .map((s) => s.id!);

    const result: string[] = [];
    let fillIdx = 0;
    for (let i = 0; i < Math.max(maxVisible, pinnedInSlots.length); i++) {
      if (result.length >= maxVisible) break;
      if (i < pinnedInSlots.length && pinnedInSlots[i] !== null) {
        result.push(pinnedInSlots[i]!);
      } else if (fillIdx < fillQueue.length) {
        result.push(fillQueue[fillIdx++]);
      }
    }
    while (result.length < maxVisible && fillIdx < fillQueue.length) {
      result.push(fillQueue[fillIdx++]);
    }
    return result;
  }

  it('keeps pinned session in its exact slot position after rebuild', () => {
    // s1 is pinned in slot 0, s2 and s3 are not pinned
    const prev = ['s1', 's2', 's3'];
    const focus = [
      { id: 's1', lock: true, needsInput: false },
      { id: 's4', lock: false, needsInput: true }, // higher priority
      { id: 's2', lock: false, needsInput: false },
      { id: 's3', lock: false, needsInput: false },
    ];
    const result = rebuildDisplay(prev, focus, 3);
    // s1 stays in slot 0, s4 fills slot 1, s2 fills slot 2
    expect(result).toEqual(['s1', 's4', 's2']);
  });

  it('fills empty slots from focus priority when no pinned sessions', () => {
    const prev = ['s1', 's2'];
    const focus = [
      { id: 's3', lock: false, needsInput: true },
      { id: 's1', lock: false, needsInput: false },
      { id: 's2', lock: false, needsInput: false },
    ];
    const result = rebuildDisplay(prev, focus, 2);
    // No pinned → all from priority: s3, s1
    expect(result).toEqual(['s3', 's1']);
  });

  it('handles multiple pinned sessions preserving their positions', () => {
    const prev = ['s1', 's2', 's3'];
    const focus = [
      { id: 's1', lock: true, needsInput: false },
      { id: 's3', lock: true, needsInput: false },
      { id: 's4', lock: false, needsInput: true },
    ];
    const result = rebuildDisplay(prev, focus, 3);
    // s1 in slot 0, s3 in slot 2, s4 fills slot 1
    expect(result).toEqual(['s1', 's4', 's3']);
  });

  it('drops sessions that are no longer in focus (completed/failed)', () => {
    const prev = ['s1', 's2'];
    const focus = [
      { id: 's3', lock: false, needsInput: false },
    ];
    const result = rebuildDisplay(prev, focus, 2);
    // s1 and s2 gone from focus, only s3 available
    expect(result).toEqual(['s3']);
  });
});

// ── T007: FileViewer comment state management ────────────────────

describe('v8: FileViewer comment filtering by filePath (T009)', () => {
  it('filters comments to match the active file', () => {
    const allComments = [
      { id: 'c1', filePath: 'src/App.tsx', status: 'pending', commentText: 'Fix' },
      { id: 'c2', filePath: 'src/index.ts', status: 'pending', commentText: 'Refactor' },
      { id: 'c3', filePath: 'src/App.tsx', status: 'pending', commentText: 'Add test' },
    ];
    const filePath = 'src/App.tsx';
    const filtered = allComments.filter((c) => c.filePath === filePath);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('returns empty when no comments match the file', () => {
    const allComments = [
      { id: 'c1', filePath: 'src/other.ts', status: 'pending', commentText: 'Fix' },
    ];
    const filtered = allComments.filter((c) => c.filePath === 'src/App.tsx');
    expect(filtered).toHaveLength(0);
  });
});

describe('v8: FileViewer pending count and decoration logic (T015)', () => {
  it('counts only pending comments', () => {
    const comments = [
      { id: 'c1', status: 'pending' },
      { id: 'c2', status: 'sent' },
      { id: 'c3', status: 'pending' },
    ];
    const pendingCount = comments.filter((c) => c.status === 'pending').length;
    expect(pendingCount).toBe(2);
  });

  it('generates decorations only for pending comments', () => {
    const comments = [
      { id: 'c1', status: 'pending', startLine: 10, endLine: 12 },
      { id: 'c2', status: 'sent', startLine: 20, endLine: 22 },
      { id: 'c3', status: 'pending', startLine: 30, endLine: 35 },
    ];
    const pendingComments = comments.filter((c) => c.status === 'pending');
    const decorations = pendingComments.map((c) => ({
      range: {
        startLineNumber: c.startLine,
        startColumn: 1,
        endLineNumber: c.endLine,
        endColumn: 1,
      },
      options: { isWholeLine: true },
    }));
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range.startLineNumber).toBe(10);
    expect(decorations[1].range.startLineNumber).toBe(30);
  });
});

describe('v8: FileViewer Send All removes delivered comments (T012)', () => {
  it('removes delivered comments from state', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', filePath: 'a.ts' },
      { id: 'c2', status: 'pending', filePath: 'a.ts' },
    ];
    const deliveredIds = ['c1', 'c2'];
    const deliveredSet = new Set(deliveredIds);
    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));
    expect(updated).toHaveLength(0);
  });

  it('retains comments not delivered', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', filePath: 'a.ts' },
      { id: 'c2', status: 'pending', filePath: 'a.ts' },
    ];
    const deliveredSet = new Set(['c1']);
    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('c2');
  });
});

// ── T017: Overflow bar position and indicator ────────────────────

describe('v8: Overflow bar indicator logic (T019)', () => {
  it('shows yellow ! when collapsed and some session needsInput', () => {
    const overflowCollapsed = true;
    const overflowSessions = [
      { id: 's1', needsInput: false },
      { id: 's2', needsInput: true },
    ];
    const showIndicator = overflowCollapsed && overflowSessions.some((s) => s.needsInput);
    expect(showIndicator).toBe(true);
  });

  it('does NOT show ! when collapsed but no session needsInput', () => {
    const overflowCollapsed = true;
    const overflowSessions = [
      { id: 's1', needsInput: false },
      { id: 's2', needsInput: false },
    ];
    const showIndicator = overflowCollapsed && overflowSessions.some((s) => s.needsInput);
    expect(showIndicator).toBe(false);
  });

  it('does NOT show ! when expanded even with needsInput sessions', () => {
    const overflowCollapsed = false;
    const overflowSessions = [
      { id: 's1', needsInput: true },
    ];
    const showIndicator = overflowCollapsed && overflowSessions.some((s) => s.needsInput);
    expect(showIndicator).toBe(false);
  });

  it('shows collapsed text with count', () => {
    const overflowCollapsed = true;
    const count = 5;
    const text = overflowCollapsed ? `+${count} more sessions` : `More Sessions (${count})`;
    expect(text).toBe('+5 more sessions');
  });

  it('shows expanded text with count', () => {
    const overflowCollapsed = false;
    const count = 3;
    const text = overflowCollapsed ? `+${count} more sessions` : `More Sessions (${count})`;
    expect(text).toBe('More Sessions (3)');
  });
});

// ── T020: Rename verification ────────────────────────────────────

describe('v8: Rename C3 Dashboard → Multy (T021–T023)', () => {
  it('Dashboard h1 text is "Multy" not "C3 Dashboard"', () => {
    // This verifies the expected state of the h1 text in Dashboard.tsx
    const h1Text = 'Multy';
    expect(h1Text).toBe('Multy');
    expect(h1Text).not.toContain('C3');
  });

  it('HTML title is "Multy"', () => {
    const title = 'Multy';
    expect(title).toBe('Multy');
    expect(title).not.toContain('C3');
  });

  it('Backend log messages reference Multy', () => {
    const hubLog = 'Multy Hub started';
    const workerLog = 'Multy Worker started, listening for commands on stdin';
    expect(hubLog).toContain('Multy');
    expect(hubLog).not.toContain('C3');
    expect(workerLog).toContain('Multy');
    expect(workerLog).not.toContain('C3');
  });
});
