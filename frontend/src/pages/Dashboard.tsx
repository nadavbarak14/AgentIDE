import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { SessionGrid } from '../components/SessionGrid';
import { SessionQueue } from '../components/SessionQueue';
import { SettingsPanel } from '../components/SettingsPanel';
import { useSessionQueue } from '../hooks/useSessionQueue';
import { useSession } from '../hooks/useSession';
import { settings as settingsApi, type Settings, type Session } from '../services/api';

export function Dashboard() {
  const {
    sessions,
    createSession,
    deleteSession,
    continueSession,
    killSession,
    toggleLock,
    refresh,
  } = useSessionQueue();

  const {
    activeSessions,
    focusSessions,
    queuedSessions,
    completedSessions,
    failedSessions,
    activeCount,
    queuedCount,
    totalCount,
  } = useSession(sessions);

  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('c3-sidebar-open') !== 'false');

  useEffect(() => {
    settingsApi.get().then(setAppSettings).catch(() => {});
  }, []);

  const maxVisible = appSettings?.maxVisibleSessions ?? 4;

  const handleSettingsChange = useCallback((updated: Settings) => {
    setAppSettings(updated);
  }, []);

  // ── Frozen Display Model ──────────────────────────────────────────
  // displayedIds: IDs of sessions shown in the main grid.
  // FROZEN by default — only changes on explicit triggers:
  //   1. User sends input (Enter) → rebuild from priority order
  //   2. User clicks a session → swap it into view
  //   3. A displayed session becomes inactive → fill its slot
  //   4. A new session activates with available slots → add it
  //   5. maxVisible changes → resize

  const [displayedIds, setDisplayedIds] = useState<string[]>([]);

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
        const toAdd = newActive.slice(0, slots).map((s) => s.id);
        return [...prev, ...toAdd];
      });
    }
  }, [activeSessions, displayedIds, maxVisible]);

  // Trigger 1: User sent input (Enter key) → rebuild after backend processes
  // Backend clears needsInput on the session that received input.
  // Other sessions with needsInput=true get priority in the rebuild.
  const pendingRebuild = useRef(false);

  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        pendingRebuild.current = true;
        refresh();
      }, 500);
    };
    window.addEventListener('c3:input-sent', handler);
    return () => window.removeEventListener('c3:input-sent', handler);
  }, [refresh]);

  // After sessions update, if rebuild is pending, execute it
  useEffect(() => {
    if (pendingRebuild.current) {
      pendingRebuild.current = false;
      rebuildDisplay();
    }
  }, [sessions, rebuildDisplay]);

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

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold">Multy</h1>
            <span className="text-sm text-gray-400">
              {activeCount} active / {queuedCount} queued / {totalCount} total
            </span>
          </div>
          <div className="flex items-center gap-3">
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
              {sidebarOpen ? '»' : '«'}
            </button>
            {appSettings && (
              <SettingsPanel
                settings={appSettings}
                onSettingsChange={handleSettingsChange}
              />
            )}
          </div>
        </div>

        {/* Session Grid */}
        <SessionGrid
          displayedSessions={displayedSessions}
          overflowSessions={overflowSessions}
          onContinue={(id) => continueSession(id).catch(() => {})}
          onKill={(id) => killSession(id).catch(() => {})}
          onToggleLock={(id, lock) => toggleLock(id, lock).catch(() => {})}
          onDelete={(id) => deleteSession(id).catch(() => {})}
          onFocusSession={handleFocusSession}
        />
      </div>

      {/* Sidebar */}
      <div className={`transition-all duration-200 flex-shrink-0 ${sidebarOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
        <SessionQueue
          activeSessions={activeSessions}
          queuedSessions={queuedSessions}
          completedSessions={completedSessions}
          failedSessions={failedSessions}
          onCreateSession={createSession}
          onDeleteSession={deleteSession}
          onContinueSession={continueSession}
          onFocusSession={handleFocusSession}
          onKillSession={(id) => killSession(id).catch(() => {})}
        />
      </div>
    </div>
  );
}
