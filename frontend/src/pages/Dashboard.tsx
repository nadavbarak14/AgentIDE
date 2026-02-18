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

  // Keep a ref to latest focusSessions for use in rebuild
  const focusSessionsRef = useRef(focusSessions);
  focusSessionsRef.current = focusSessions;

  // Rebuild displayed list from current priority order
  const rebuildDisplay = useCallback(() => {
    const ids = focusSessionsRef.current
      .slice(0, maxVisible)
      .map((s) => s.id);
    setDisplayedIds(ids);
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
  const handleFocusSession = useCallback(
    (id: string) => {
      setDisplayedIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev];
        if (next.length >= maxVisible) {
          // Replace the last slot with the clicked session
          next[next.length - 1] = id;
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
            <h1 className="text-lg font-bold">C3 Dashboard</h1>
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
