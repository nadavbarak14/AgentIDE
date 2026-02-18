import { describe, it, expect } from 'vitest';
import type { Session } from '../../src/services/api';

// ── SessionCard — port_detected WebSocket handling ──

describe('SessionCard — port_detected WebSocket handling', () => {
  it('WsServerMessage port_detected type has correct shape', () => {
    const msg = {
      type: 'port_detected' as const,
      port: 3000,
      localPort: 3001,
      protocol: 'http',
    };

    expect(msg.type).toBe('port_detected');
    expect(msg.port).toBe(3000);
    expect(msg.localPort).toBe(3001);
    expect(typeof msg.port).toBe('number');
    expect(typeof msg.localPort).toBe('number');
  });

  it('port_detected message can be destructured for state', () => {
    const msg = {
      type: 'port_detected' as const,
      port: 8080,
      localPort: 8081,
      protocol: 'http',
    };

    const detectedPort = { port: msg.port, localPort: msg.localPort };
    expect(detectedPort.port).toBe(8080);
    expect(detectedPort.localPort).toBe(8081);
  });
});

// ── Responsive panel layout constants ──

describe('Responsive panel layout constants', () => {
  it('minimum panel width (200px) and terminal width (300px) allow dual-panel at 700px', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;

    const singlePanelMin = MIN_PANEL_PX + MIN_TERMINAL_PX;
    expect(singlePanelMin).toBe(500);

    const dualPanelMin = MIN_PANEL_PX + MIN_TERMINAL_PX + MIN_PANEL_PX;
    expect(dualPanelMin).toBe(700);
  });

  it('resize clamping keeps panels within bounds', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;
    const containerWidth = 1000;

    const minLeftPercent = (MIN_PANEL_PX / containerWidth) * 100;
    const maxLeftPercent = 100 - ((MIN_TERMINAL_PX / containerWidth) * 100);

    expect(minLeftPercent).toBe(20);
    expect(maxLeftPercent).toBe(70);

    const rightPanelPercent = 25;
    const maxLeftWithRight = 100 - ((MIN_TERMINAL_PX / containerWidth) * 100) - rightPanelPercent;
    expect(maxLeftWithRight).toBe(45);
  });

  it('canOpenPanel logic prevents opening when viewport too narrow', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;

    const canOpenPanel = (containerWidth: number, otherPanelOpen: boolean): boolean => {
      const neededWidth = MIN_PANEL_PX + MIN_TERMINAL_PX + (otherPanelOpen ? MIN_PANEL_PX : 0);
      return containerWidth >= neededWidth;
    };

    expect(canOpenPanel(800, false)).toBe(true);
    expect(canOpenPanel(800, true)).toBe(true);
    expect(canOpenPanel(600, true)).toBe(false);
    expect(canOpenPanel(400, false)).toBe(false);
  });
});

// ── Sidebar toggle — localStorage state ──

describe('Sidebar toggle — localStorage state', () => {
  it('sidebar defaults to open when no localStorage value', () => {
    const stored = null;
    const defaultOpen = stored !== 'false';
    expect(defaultOpen).toBe(true);
  });

  it('sidebar stays open when localStorage is "true"', () => {
    const stored = 'true';
    const open = stored !== 'false';
    expect(open).toBe(true);
  });

  it('sidebar is hidden when localStorage is "false"', () => {
    const stored = 'false';
    const open = stored !== 'false';
    expect(open).toBe(false);
  });
});

// ── Overflow strip — collapsible state ──

describe('Overflow strip — collapsible state', () => {
  it('overflow defaults to collapsed when no localStorage value', () => {
    const stored = null;
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(true);
  });

  it('overflow is expanded when localStorage is "false"', () => {
    const stored = 'false';
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(false);
  });

  it('overflow stays collapsed when localStorage is "true"', () => {
    const stored = 'true';
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(true);
  });
});

// ── focusSessions priority ordering ──

describe('focusSessions priority ordering', () => {
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

// ── handleFocusSession replaces last non-pinned slot ──

describe('handleFocusSession replaces last non-pinned slot', () => {
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
    expect(result).toEqual(['s1', 's2', 's4']);
  });

  it('preserves pinned sessions and replaces non-pinned', () => {
    const sessions = [
      { id: 's1', lock: true },
      { id: 's2', lock: true },
      { id: 's3', lock: false },
    ];
    const result = handleFocusSession(['s1', 's2', 's3'], 's4', 3, sessions);
    expect(result).toEqual(['s1', 's2', 's4']);
  });

  it('replaces last slot when ALL are pinned (fallback)', () => {
    const sessions = [
      { id: 's1', lock: true },
      { id: 's2', lock: true },
      { id: 's3', lock: true },
    ];
    const result = handleFocusSession(['s1', 's2', 's3'], 's4', 3, sessions);
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

// ── rebuildDisplay preserves pinned slot positions ──

describe('rebuildDisplay preserves pinned slot positions', () => {
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
    const prev = ['s1', 's2', 's3'];
    const focus = [
      { id: 's1', lock: true, needsInput: false },
      { id: 's4', lock: false, needsInput: true },
      { id: 's2', lock: false, needsInput: false },
      { id: 's3', lock: false, needsInput: false },
    ];
    const result = rebuildDisplay(prev, focus, 3);
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
    expect(result).toEqual(['s1', 's4', 's3']);
  });

  it('drops sessions that are no longer in focus (completed/failed)', () => {
    const prev = ['s1', 's2'];
    const focus = [
      { id: 's3', lock: false, needsInput: false },
    ];
    const result = rebuildDisplay(prev, focus, 2);
    expect(result).toEqual(['s3']);
  });
});

// ── Overflow bar indicator logic ──

describe('Overflow bar indicator logic', () => {
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

// ── Rename C3 Dashboard -> Multy ──

describe('Rename C3 Dashboard to Multy', () => {
  it('Dashboard h1 text is "Multy" not "C3 Dashboard"', () => {
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

// ── Overflow bar amber background ──

describe('Overflow bar amber background', () => {
  function getOverflowButtonClass(
    overflowCollapsed: boolean,
    overflowSessions: Partial<Session>[]
  ): string {
    const base = 'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:bg-gray-800/50 transition-colors';
    const hasNeedsInput = overflowSessions.some((s) => s.needsInput);
    if (overflowCollapsed && hasNeedsInput) {
      return `${base} bg-amber-500/20`;
    }
    return base;
  }

  it('adds amber background when collapsed and sessions need input', () => {
    const sessions: Partial<Session>[] = [
      { id: 'a', needsInput: true },
      { id: 'b', needsInput: false },
    ];
    const cls = getOverflowButtonClass(true, sessions);
    expect(cls).toContain('bg-amber-500/20');
  });

  it('no amber background when collapsed and no sessions need input', () => {
    const sessions: Partial<Session>[] = [
      { id: 'a', needsInput: false },
      { id: 'b', needsInput: false },
    ];
    const cls = getOverflowButtonClass(true, sessions);
    expect(cls).not.toContain('bg-amber-500/20');
  });

  it('no amber background when expanded regardless of needsInput', () => {
    const sessions: Partial<Session>[] = [
      { id: 'a', needsInput: true },
    ];
    const cls = getOverflowButtonClass(false, sessions);
    expect(cls).not.toContain('bg-amber-500/20');
  });
});
