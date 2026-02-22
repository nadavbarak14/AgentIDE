import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { SessionGrid } from '../components/SessionGrid';
import { SessionQueue } from '../components/SessionQueue';
import { SettingsPanel } from '../components/SettingsPanel';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { SessionSwitcher } from '../components/SessionSwitcher';
import { useSessionQueue } from '../hooks/useSessionQueue';
import { useSession } from '../hooks/useSession';
import { useKeyboardShortcuts, type ShortcutAction } from '../hooks/useKeyboardShortcuts';
import { settings as settingsApi, workers as workersApi, type Settings, type Session, type Worker } from '../services/api';
import { WorkerHealth } from '../components/WorkerHealth';

export function Dashboard() {
  const {
    sessions,
    createSession,
    deleteSession,
    killSession,
    toggleLock,
    refresh,
  } = useSessionQueue();

  const {
    activeSessions,
    focusSessions,
    completedSessions,
    failedSessions,
    activeCount,
    totalCount,
  } = useSession(sessions);

  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [workersList, setWorkersList] = useState<Worker[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('c3-sidebar-open') !== 'false');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('c3-current-session'));
  const [addMachineTrigger, setAddMachineTrigger] = useState(0);

  useEffect(() => {
    settingsApi.get().then(setAppSettings).catch(() => {});
    workersApi.list().then(setWorkersList).catch(() => {});
  }, []);

  // Persist currentSessionId to localStorage
  const handleSetCurrentSession = useCallback((id: string | null) => {
    setCurrentSessionId(id);
    if (id) {
      localStorage.setItem('c3-current-session', id);
    } else {
      localStorage.removeItem('c3-current-session');
    }
  }, []);

  const maxVisible = appSettings?.maxVisibleSessions ?? 4;

  const handleSettingsChange = useCallback((updated: Settings) => {
    setAppSettings(updated);
  }, []);

  // ── Frozen Display Model ──────────────────────────────────────────
  // displayedIds: IDs of sessions shown in the main grid.
  // FROZEN by default — only changes on explicit triggers:
  //   1. User sends input (Enter) → swap that slot with next in FIFO queue
  //   2. User clicks a session → swap it into view
  //   3. A displayed session becomes inactive → fill its slot
  //   4. A new session activates with available slots → add it
  //   5. maxVisible changes → resize

  const [displayedIds, setDisplayedIds] = useState<string[]>([]);

  // FIFO queue: tracks the order sessions entered needsInput state.
  // Oldest needsInput session gets priority when a slot opens.
  const needsInputQueueRef = useRef<string[]>([]);
  useEffect(() => {
    const currentNeedsInput = new Set(
      activeSessions.filter((s) => s.needsInput).map((s) => s.id),
    );
    // Remove sessions that no longer need input
    needsInputQueueRef.current = needsInputQueueRef.current.filter((id) =>
      currentNeedsInput.has(id),
    );
    // Append new needsInput sessions (FIFO — new ones go to the back)
    const inQueue = new Set(needsInputQueueRef.current);
    for (const id of currentNeedsInput) {
      if (!inQueue.has(id)) {
        needsInputQueueRef.current.push(id);
      }
    }
  }, [activeSessions]);

  // Keep refs to latest data for use in callbacks without stale closures
  const focusSessionsRef = useRef(focusSessions);
  focusSessionsRef.current = focusSessions;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Rebuild displayed list from current priority order.
  // Pinned sessions that are currently displayed AND still active keep their slots.
  // Remaining slots are filled from the priority queue.
  const rebuildDisplay = useCallback(() => {
    setDisplayedIds((prev) => {
      const allFocus = focusSessionsRef.current;

      // Identify pinned sessions in current slots that are still active
      const pinnedInSlots: (string | null)[] = prev.map((id) => {
        const sess = allFocus.find((s) => s.id === id);
        return sess?.lock ? id : null;
      });

      // Collect IDs already placed (pinned)
      const placed = new Set(pinnedInSlots.filter((id): id is string => id !== null));

      // Fill remaining slots from priority order, skipping already-placed
      const fillQueue = allFocus
        .filter((s) => !placed.has(s.id))
        .map((s) => s.id);

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

      // Fill any remaining capacity
      while (result.length < maxVisible && fillIdx < fillQueue.length) {
        result.push(fillQueue[fillIdx++]);
      }

      return result;
    });
  }, [maxVisible]);

  // Initialize when first active sessions appear
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current && focusSessions.length > 0) {
      hasInitialized.current = true;
      rebuildDisplay();
    }
  }, [focusSessions.length, rebuildDisplay]);

  // Fill slots when a displayed session becomes inactive (completed/failed)
  useEffect(() => {
    if (displayedIds.length === 0) return;
    const activeIds = new Set(activeSessions.map((s) => s.id));
    if (displayedIds.some((id) => !activeIds.has(id))) {
      rebuildDisplay();
    }
  }, [activeSessions, displayedIds, rebuildDisplay]);

  // Add newly activated sessions when slots are available
  useEffect(() => {
    if (activeSessions.length === 0) return;
    const displayed = new Set(displayedIds);
    const newActive = activeSessions.filter((s) => !displayed.has(s.id));
    if (newActive.length > 0 && displayedIds.length < maxVisible) {
      setDisplayedIds((prev) => {
        const slots = maxVisible - prev.length;
        if (slots <= 0) return prev;
        const prevSet = new Set(prev);
        const toAdd = newActive
          .filter((s) => !prevSet.has(s.id))
          .slice(0, slots)
          .map((s) => s.id);
        if (toAdd.length === 0) return prev;
        return [...prev, ...toAdd];
      });
    }
  }, [activeSessions, displayedIds, maxVisible]);

  // Trigger 1: User sent input (Enter key) → mark that slot as eligible for swap.
  // The slot stays marked until the backend confirms needsInput=false AND
  // there's an overflow session needing input to replace it.
  const swapEligibleSessionId = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const sessionId = (e as CustomEvent).detail?.sessionId;
      if (sessionId) {
        swapEligibleSessionId.current = sessionId;
      }
    };
    window.addEventListener('c3:input-sent', handler);
    return () => window.removeEventListener('c3:input-sent', handler);
  }, []);

  // On every poll: check if the swap-eligible slot is ready to rotate.
  // "Ready" = the session we typed in no longer needs input (user answered it)
  // AND there's an overflow session that does need input (FIFO order).
  useEffect(() => {
    const swapId = swapEligibleSessionId.current;
    if (!swapId) return;

    // Check if the session we typed in still needs input — if so, wait
    const typedSession = sessions.find((s) => s.id === swapId);
    if (typedSession?.needsInput) return; // backend hasn't cleared yet, keep waiting

    setDisplayedIds((prev) => {
      const slotIdx = prev.indexOf(swapId);
      if (slotIdx === -1) {
        swapEligibleSessionId.current = null;
        return prev;
      }

      // Find oldest overflow session that needs input (FIFO queue)
      const displayedSet = new Set(prev);
      const candidateId = needsInputQueueRef.current.find(
        (id) => !displayedSet.has(id),
      );
      if (!candidateId) {
        // No overflow session needs input — clear eligibility, nothing to swap
        swapEligibleSessionId.current = null;
        return prev;
      }

      // Swap! Clear eligibility.
      swapEligibleSessionId.current = null;
      const next = [...prev];
      next[slotIdx] = candidateId;
      return next;
    });
  }, [sessions]);

  // Trigger 2: maxVisible changed → resize
  const prevMaxVisible = useRef(maxVisible);
  useEffect(() => {
    if (prevMaxVisible.current !== maxVisible && displayedIds.length > 0) {
      prevMaxVisible.current = maxVisible;
      rebuildDisplay();
    }
  }, [maxVisible, displayedIds.length, rebuildDisplay]);

  // Trigger 3: User clicks a session → swap it into view
  // Replaces the last non-pinned slot to preserve pinned sessions.
  // If all slots are pinned, replaces the last slot as fallback.
  const handleFocusSession = useCallback(
    (id: string) => {
      setDisplayedIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev];
        if (next.length >= maxVisible) {
          // Find the last non-pinned slot to replace
          let replaceIdx = -1;
          for (let i = next.length - 1; i >= 0; i--) {
            const sess = sessionsRef.current.find((s) => s.id === next[i]);
            if (!sess?.lock) {
              replaceIdx = i;
              break;
            }
          }
          // If all slots are pinned, replace the last one anyway
          if (replaceIdx === -1) replaceIdx = next.length - 1;
          next[replaceIdx] = id;
        } else {
          next.push(id);
        }
        return next;
      });
    },
    [maxVisible],
  );

  // Build session objects from frozen IDs (data updates on polls, order stays frozen)
  const displayedSessions = useMemo(
    () =>
      displayedIds
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is Session => !!s),
    [displayedIds, sessions],
  );

  const overflowSessions = useMemo(
    () => activeSessions.filter((s) => !displayedIds.includes(s.id)),
    [activeSessions, displayedIds],
  );

  // Auto-focus terminal when a new session swaps into view
  const prevDisplayedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = new Set(prevDisplayedIdsRef.current);
    prevDisplayedIdsRef.current = displayedIds;
    // Find sessions that are newly displayed
    const newlyDisplayed = displayedIds.filter((id) => !prev.has(id));
    if (newlyDisplayed.length >= 1) {
      const newId = newlyDisplayed[0];
      handleSetCurrentSession(newId);
      // Focus terminal with retries — terminal may take time to mount
      const tryFocus = (attempt: number) => {
        const textarea = document.querySelector(`[data-session-id="${newId}"] .xterm-helper-textarea`) as HTMLElement | null;
        if (textarea) {
          textarea.focus();
        } else if (attempt < 5) {
          setTimeout(() => tryFocus(attempt + 1), 200);
        }
      };
      setTimeout(() => tryFocus(0), 200);
    }
  }, [displayedIds, handleSetCurrentSession]);

  // ── Keyboard Shortcuts ──────────────────────────────────────────
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [sessionSwitcherOpen, setSessionSwitcherOpen] = useState(false);
  const [sessionSwitcherIndex, setSessionSwitcherIndex] = useState(0);

  // Auto-set current session to first displayed if none set
  useEffect(() => {
    if (!currentSessionId && displayedIds.length > 0) {
      handleSetCurrentSession(displayedIds[0]);
    }
  }, [currentSessionId, displayedIds, handleSetCurrentSession]);

  // Keep a ref to displayedIds for the shortcut handler
  const displayedIdsRef = useRef(displayedIds);
  displayedIdsRef.current = displayedIds;
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  const sessionSwitcherOpenRef = useRef(sessionSwitcherOpen);
  sessionSwitcherOpenRef.current = sessionSwitcherOpen;

  // Focus the terminal in a specific session — synchronous DOM focus + delayed retry.
  // Called only from keyboard shortcuts — NOT from mouse clicks.
  const focusTerminalInSession = useCallback((sessionId: string) => {
    const doFocus = () => {
      const textarea = document.querySelector(`[data-session-id="${sessionId}"] .xterm-helper-textarea`) as HTMLElement | null;
      if (textarea && document.activeElement !== textarea) {
        textarea.focus();
      }
    };
    doFocus();
    // Retry after React re-renders (disarm causes re-render that can steal focus)
    setTimeout(doFocus, 200);
  }, []);

  const handleShortcutAction = useCallback((action: ShortcutAction) => {
    const curId = currentSessionIdRef.current;
    const displayed = displayedIdsRef.current;
    const allSessions = sessionsRef.current;
    const switcherOpen = sessionSwitcherOpenRef.current;

    switch (action) {
      // Arrow keys: move focus (or navigate switcher if open)
      case 'focus_next': {
        if (switcherOpen) {
          // Navigate within switcher
          setSessionSwitcherIndex((prev) => (prev + 1) % allSessions.length);
          return;
        }
        if (displayed.length <= 1) return;
        const curIdx = curId ? displayed.indexOf(curId) : -1;
        const nextIdx = (curIdx + 1) % displayed.length;
        const nextId = displayed[nextIdx];
        handleSetCurrentSession(nextId);
        focusTerminalInSession(nextId);
        break;
      }
      case 'focus_prev': {
        if (switcherOpen) {
          setSessionSwitcherIndex((prev) => (prev - 1 + allSessions.length) % allSessions.length);
          return;
        }
        if (displayed.length <= 1) return;
        const curIdx = curId ? displayed.indexOf(curId) : 0;
        const prevIdx = (curIdx - 1 + displayed.length) % displayed.length;
        const prevId = displayed[prevIdx];
        handleSetCurrentSession(prevId);
        focusTerminalInSession(prevId);
        break;
      }
      // Tab: open session switcher for all sessions (including overflow)
      case 'switch_next': {
        if (allSessions.length === 0) return;
        setSessionSwitcherOpen((wasOpen) => {
          if (!wasOpen) {
            const curIdx = curId ? allSessions.findIndex((s) => s.id === curId) : -1;
            setSessionSwitcherIndex((curIdx + 1) % allSessions.length);
          } else {
            setSessionSwitcherIndex((prev) => (prev + 1) % allSessions.length);
          }
          return true;
        });
        break;
      }
      case 'switch_prev': {
        if (allSessions.length === 0) return;
        setSessionSwitcherOpen((wasOpen) => {
          if (!wasOpen) {
            const curIdx = curId ? allSessions.findIndex((s) => s.id === curId) : 0;
            setSessionSwitcherIndex((curIdx - 1 + allSessions.length) % allSessions.length);
          } else {
            setSessionSwitcherIndex((prev) => (prev - 1 + allSessions.length) % allSessions.length);
          }
          return true;
        });
        break;
      }
      case 'confirm_session': {
        const idx = sessionSwitcherIndex;
        if (allSessions[idx]) {
          const id = allSessions[idx].id;
          handleSetCurrentSession(id);
          handleFocusSession(id);
          focusTerminalInSession(id);
        }
        setSessionSwitcherOpen(false);
        break;
      }
      case 'show_help':
        setShortcutsHelpOpen((prev) => !prev);
        break;
      case 'toggle_files':
      case 'toggle_git':
      case 'toggle_preview':
      case 'toggle_claude':
      case 'toggle_issues':
      case 'toggle_shell':
      case 'search_files':
        if (curId) {
          window.dispatchEvent(new CustomEvent('c3:shortcut', { detail: { action, sessionId: curId } }));
        }
        break;
    }
  }, [handleSetCurrentSession, handleFocusSession, focusTerminalInSession, sessionSwitcherIndex]);

  const chordState = useKeyboardShortcuts({
    enabled: true,
    onAction: handleShortcutAction,
  });

  // Close session switcher when chord times out (don't auto-select — user must press Enter)
  useEffect(() => {
    if (!chordState.isArmed && sessionSwitcherOpen) {
      setSessionSwitcherOpen(false);
    }
  }, [chordState.isArmed, sessionSwitcherOpen]);

  const handleSessionSwitcherSelect = useCallback((id: string) => {
    handleSetCurrentSession(id);
    handleFocusSession(id);
    setSessionSwitcherOpen(false);
  }, [handleSetCurrentSession, handleFocusSession]);

  const handleSessionSwitcherClose = useCallback(() => {
    setSessionSwitcherOpen(false);
  }, []);

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold">Multy</h1>
            <span className="text-sm text-gray-400">
              {activeCount} active / {totalCount} total
            </span>
          </div>
          <div className="flex items-center gap-3">
            {workersList.length > 1 && (
              <WorkerHealth workers={workersList} />
            )}
            <button
              onClick={() => {
                setSidebarOpen((prev) => {
                  const next = !prev;
                  localStorage.setItem('c3-sidebar-open', String(next));
                  return next;
                });
              }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? '\u00BB' : '\u00AB'}
            </button>
            {appSettings && (
              <SettingsPanel
                settings={appSettings}
                onSettingsChange={handleSettingsChange}
                workers={workersList}
                onWorkersChange={setWorkersList}
                autoOpenAddForm={addMachineTrigger}
              />
            )}
          </div>
        </div>

        {/* Session Grid */}
        <SessionGrid
          displayedSessions={displayedSessions}
          overflowSessions={overflowSessions}
          currentSessionId={currentSessionId}
          workers={workersList}
          onKill={(id) => killSession(id).catch(() => {})}
          onToggleLock={(id, lock) => toggleLock(id, lock).catch(() => {})}
          onDelete={(id) => deleteSession(id).catch(() => {})}
          onFocusSession={handleFocusSession}
          onSetCurrent={handleSetCurrentSession}
        />
      </div>

      {/* Chord Indicator */}
      {chordState.isArmed && (
        <div className="fixed top-2 right-2 z-40 bg-blue-600 text-white text-xs font-mono px-2 py-1 rounded shadow-lg animate-pulse">
          Ctrl+. ...
        </div>
      )}

      {/* Session Switcher Overlay */}
      <SessionSwitcher
        sessions={sessions}
        currentSessionId={currentSessionId}
        isOpen={sessionSwitcherOpen}
        highlightedIndex={sessionSwitcherIndex}
        onSelect={handleSessionSwitcherSelect}
        onClose={handleSessionSwitcherClose}
      />

      {/* Shortcuts Help Overlay */}
      <ShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />

      {/* Sidebar */}
      <div className={`transition-all duration-200 flex-shrink-0 ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <SessionQueue
          activeSessions={activeSessions}
          completedSessions={completedSessions}
          failedSessions={failedSessions}
          workers={workersList}
          onRequestAddMachine={() => setAddMachineTrigger((n) => n + 1)}
          onCreateSession={createSession}
          onDeleteSession={deleteSession}
          onFocusSession={handleFocusSession}
          onKillSession={(id) => killSession(id).catch(() => {})}
        />
      </div>
    </div>
  );
}
