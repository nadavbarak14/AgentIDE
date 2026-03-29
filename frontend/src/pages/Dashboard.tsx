import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { SessionGrid } from '../components/SessionGrid';
import { SessionQueue } from '../components/SessionQueue';
import { SettingsPanel } from '../components/SettingsPanel';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { SessionSwitcher } from '../components/SessionSwitcher';
import { CommandPalette, BUTTON_ONLY_COMMANDS } from '../components/CommandPalette';
import { ProjectList } from '../components/ProjectList';
import { ProjectSidePanel } from '../components/ProjectSidePanel';
import { ProjectDetail } from '../components/ProjectDetail';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { StartAgentModal } from '../components/StartAgentModal';
import { useProjects } from '../hooks/useProjects';
import { useSessionQueue } from '../hooks/useSessionQueue';
import { useSession } from '../hooks/useSession';
import { useKeyboardShortcuts, type ShortcutAction } from '../hooks/useKeyboardShortcuts';
import { settings as settingsApi, workers as workersApi, type Settings, type Session, type Worker } from '../services/api';
import { WorkerHealth } from '../components/WorkerHealth';
import { MobileSessionSelector } from '../components/MobileSessionSelector';
import { WaitingSessionAlert } from '../components/WaitingSessionAlert';
import { MobileLayout, type MobileLayoutHandle } from '../components/MobileLayout';
import { TerminalView, type TerminalViewHandle } from '../components/TerminalView';
import { useClaudeMode } from '../hooks/useClaudeMode';
import { useVisualViewport } from '../hooks/useVisualViewport';
import type { WsServerMessage } from '../services/ws';

export function Dashboard() {
  const {
    sessions,
    createSession,
    deleteSession,
    killSession,
    toggleLock,
  } = useSessionQueue();

  const {
    activeSessions,
    focusSessions,
    activeCount,
  } = useSession(sessions);

  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [workersList, setWorkersList] = useState<Worker[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('c3-sidebar-open') !== 'false');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => localStorage.getItem('c3-current-session'));
  const [addMachineTrigger, setAddMachineTrigger] = useState(0);

  // ── Project-First View ──────────────────────────────────────────
  const [currentView, setCurrentView] = useState<'projects' | 'sessions'>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { findProject, projectTree } = useProjects();
  const [startAgentModal, setStartAgentModal] = useState<{ projectId: string; workDir: string; project: ReturnType<typeof findProject>; issueNumber?: number; defaultName?: string } | null>(null);
  const [projectSidebarOpen, setProjectSidebarOpen] = useState(() => localStorage.getItem('c3-project-sidebar') !== 'false');
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentView('sessions');
  }, []);

  const handleBackToProjects = useCallback(() => {
    setSelectedProjectId(null);
    setCurrentView('projects');
  }, []);

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

  const { isMobile, viewportHeight, keyboardOffset } = useVisualViewport();
  const maxVisible = isMobile ? 1 : (appSettings?.maxVisibleSessions ?? 4);

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

  // ── Zoom State ──────────────────────────────────────────────────
  const [zoomedSessionId, setZoomedSessionId] = useState<string | null>(null);
  const preZoomDisplayedIdsRef = useRef<string[] | null>(null);
  const zoomedSessionIdRef = useRef(zoomedSessionId);

  const displayedIdsRef = useRef(displayedIds);
  displayedIdsRef.current = displayedIds;

  const activeSessionsRef = useRef(activeSessions);
  activeSessionsRef.current = activeSessions;

  const handleToggleZoom = useCallback((sessionId: string) => {
    if (zoomedSessionIdRef.current === sessionId) {
      // Unzoom: restore previous layout
      const saved = preZoomDisplayedIdsRef.current;
      setZoomedSessionId(null);
      zoomedSessionIdRef.current = null;
      preZoomDisplayedIdsRef.current = null;
      if (saved) setDisplayedIds(saved);
    } else {
      // Zoom: save current layout, show only the zoomed session
      preZoomDisplayedIdsRef.current = [...displayedIdsRef.current];
      setZoomedSessionId(sessionId);
      zoomedSessionIdRef.current = sessionId;
      setDisplayedIds([sessionId]);
      handleSetCurrentSession(sessionId);
    }
  }, [handleSetCurrentSession]);

  // Auto-unzoom when zoomed session is killed/deleted
  useEffect(() => {
    if (!zoomedSessionId) return;
    const sessionStillExists = sessions.some((s) => s.id === zoomedSessionId);
    if (!sessionStillExists) {
      const saved = preZoomDisplayedIdsRef.current;
      setZoomedSessionId(null);
      zoomedSessionIdRef.current = null;
      preZoomDisplayedIdsRef.current = null;
      if (saved) {
        setDisplayedIds(saved.filter((id) => id !== zoomedSessionId));
      }
    }
  }, [sessions, zoomedSessionId]);

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

  // Debounce timer for handleFocusSession — only the last call within 100ms fires.
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rebuild displayed list from current priority order.
  // Pinned sessions that are currently displayed AND still active keep their slots.
  // Remaining slots are filled from the priority queue.
  const rebuildDisplay = useCallback(() => {
    setDisplayedIds((prev) => {
      const allFocus = focusSessionsRef.current;

      // Identify protected sessions in current slots: pinned, focused, or waiting
      const protectedInSlots: (string | null)[] = prev.map((id) => {
        const sess = allFocus.find((s) => s.id === id);
        if (!sess) return null;
        if (sess.lock || id === currentSessionIdRef.current || sess.needsInput) return id;
        return null;
      });

      // Collect IDs already placed (protected)
      const placed = new Set(protectedInSlots.filter((id): id is string => id !== null));

      // Fill remaining slots from priority order, skipping already-placed
      const fillQueue = allFocus
        .filter((s) => !placed.has(s.id))
        .map((s) => s.id);

      const result: string[] = [];
      let fillIdx = 0;
      for (let i = 0; i < Math.max(maxVisible, protectedInSlots.length); i++) {
        if (result.length >= maxVisible) break;
        if (i < protectedInSlots.length && protectedInSlots[i] !== null) {
          result.push(protectedInSlots[i]!);
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
    if (zoomedSessionIdRef.current) return; // Skip during zoom
    if (displayedIds.length === 0) return;
    const activeIds = new Set(activeSessions.map((s) => s.id));
    if (displayedIds.some((id) => !activeIds.has(id))) {
      rebuildDisplay();
    }
  }, [activeSessions, displayedIds, rebuildDisplay]);

  // Only count active sessions in displayed slots — completed ones don't occupy space
  const activeDisplayedIds = useMemo(
    () => {
      const activeIds = new Set(activeSessions.map((s) => s.id));
      return displayedIds.filter((id) => activeIds.has(id));
    },
    [displayedIds, activeSessions],
  );

  // Add newly activated sessions when slots are available
  useEffect(() => {
    if (zoomedSessionIdRef.current) return; // Skip during zoom
    if (activeSessions.length === 0) return;
    const displayed = new Set(activeDisplayedIds);
    const newActive = activeSessions.filter((s) => !displayed.has(s.id));
    if (newActive.length > 0 && activeDisplayedIds.length < maxVisible) {
      setDisplayedIds((prev) => {
        // Count only active sessions in current displayedIds for slot calculation
        const activeIdSet = new Set(activeSessions.map((s) => s.id));
        const activeInPrev = prev.filter((id) => activeIdSet.has(id));
        const slots = maxVisible - activeInPrev.length;
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
  }, [activeSessions, activeDisplayedIds, maxVisible]);

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
    if (zoomedSessionIdRef.current) return; // Skip during zoom
    const swapId = swapEligibleSessionId.current;
    if (!swapId) return;

    // Never swap out the focused session
    if (swapId === currentSessionIdRef.current) return;

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
    if (zoomedSessionIdRef.current) return; // Skip during zoom
    if (prevMaxVisible.current !== maxVisible && displayedIds.length > 0) {
      prevMaxVisible.current = maxVisible;
      rebuildDisplay();
    }
  }, [maxVisible, displayedIds.length, rebuildDisplay]);

  // Guard: suppress focusout auto-switch for 800ms after any manual switch.
  const manualSwitchPendingRef = useRef(false);
  const manualSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markManualSwitch = useCallback(() => {
    manualSwitchPendingRef.current = true;
    if (manualSwitchTimerRef.current !== null) clearTimeout(manualSwitchTimerRef.current);
    manualSwitchTimerRef.current = setTimeout(() => {
      manualSwitchPendingRef.current = false;
    }, 800);
  }, []);

  // Focus the terminal in a specific session — synchronous DOM focus + delayed retry.
  const focusTerminalInSession = useCallback((sessionId: string) => {
    const doFocus = () => {
      const textarea = document.querySelector(`[data-session-id="${sessionId}"] .xterm-helper-textarea`) as HTMLElement | null;
      if (textarea && document.activeElement !== textarea) {
        textarea.focus();
      }
    };
    doFocus();
    setTimeout(doFocus, 200);
  }, []);

  // Trigger 3: User switches to a session → swap it into view + focus its terminal.
  // Replaces the FOCUSED session's slot (the one the user was looking at).
  // Falls back to last non-pinned slot if focused session is pinned or not in view.
  const handleFocusSession = useCallback(
    (id: string) => {
      // Debounce: if called again within 100ms, cancel the previous call
      // so only the final target session gets focused.
      if (focusDebounceRef.current) {
        clearTimeout(focusDebounceRef.current);
      }
      focusDebounceRef.current = setTimeout(() => {
        focusDebounceRef.current = null;

        // Capture the previously focused session BEFORE updating currentSessionId
        const previousFocusedId = currentSessionIdRef.current;
        console.log('[handleFocusSession] switching to:', id, '| previously focused:', previousFocusedId);

        handleSetCurrentSession(id);
        markManualSwitch();
        // Switch from project detail to session view so the terminal is visible
        setCurrentView('sessions');
        setDisplayedIds((prev) => {
          if (prev.includes(id)) {
            console.log('[handleFocusSession] target already displayed, no swap needed. displayed:', prev);
            return prev;
          }
          const next = [...prev];
          if (next.length >= maxVisible) {
            // First: try to replace the previously focused session's slot
            let replaceIdx = previousFocusedId ? next.indexOf(previousFocusedId) : -1;
            console.log('[handleFocusSession] focused slot index:', replaceIdx, '| displayed:', next);

            // Don't replace a pinned session — fall back instead
            if (replaceIdx !== -1) {
              const sess = sessionsRef.current.find((s) => s.id === next[replaceIdx]);
              if (sess?.lock) {
                console.log('[handleFocusSession] focused slot is pinned, falling back');
                replaceIdx = -1;
              }
            }

            // Fallback: last non-pinned slot (original behavior)
            if (replaceIdx === -1) {
              for (let i = next.length - 1; i >= 0; i--) {
                const sess = sessionsRef.current.find((s) => s.id === next[i]);
                if (!sess?.lock) { replaceIdx = i; break; }
              }
              console.log('[handleFocusSession] fallback to last non-pinned slot:', replaceIdx);
            }

            if (replaceIdx === -1) replaceIdx = next.length - 1;
            console.log('[handleFocusSession] replacing slot', replaceIdx, '(was:', next[replaceIdx], ') with:', id);
            next[replaceIdx] = id;
          } else {
            console.log('[handleFocusSession] slots available, appending. displayed:', next);
            next.push(id);
          }
          console.log('[handleFocusSession] new displayed:', next);
          return next;
        });
        focusTerminalInSession(id);
      }, 100);
    },
    [maxVisible, focusTerminalInSession, markManualSwitch, handleSetCurrentSession],
  );


  const displayedSessions = useMemo(
    () =>
      activeDisplayedIds
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is Session => !!s),
    [activeDisplayedIds, sessions],
  );

  const displayedSessionsRef = useRef(displayedSessions);
  displayedSessionsRef.current = displayedSessions;

  const overflowSessions = useMemo(
    () => activeSessions
      .filter((s) => !activeDisplayedIds.includes(s.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [activeSessions, activeDisplayedIds],
  );


  // ── Keyboard Shortcuts ──────────────────────────────────────────
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sessionSwitcherOpen, setSessionSwitcherOpen] = useState(false);
  const [sessionSwitcherIndex, setSessionSwitcherIndex] = useState(0);

  // Auto-set current session to first displayed if none set or points to a deleted/completed session.
  // Only runs when activeDisplayedIds changes (not on every poll), to avoid fighting explicit jumps.
  useEffect(() => {
    if (activeDisplayedIds.length === 0) return;
    // Check validity using ref so we don't add activeSessions as a dep (re-fires every poll)
    const activeIds = new Set(activeSessionsRef.current.map((s) => s.id));
    const isValid = currentSessionId && activeIds.has(currentSessionId);
    if (!isValid) {
      handleSetCurrentSession(activeDisplayedIds[0]);
    }
  }, [activeDisplayedIds, handleSetCurrentSession]);

  // Track whether the most recent mousedown landed inside a session card
  // (used to suppress auto-switch when clicking between sessions).
  const mouseDownInSessionRef = useRef(false);
  useEffect(() => {
    const track = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('[data-session-id]') as HTMLElement | null;
      mouseDownInSessionRef.current = !!card;
    };
    document.addEventListener('mousedown', track, true);
    return () => document.removeEventListener('mousedown', track, true);
  }, []);

  // Keep currentSessionId in sync with actual keyboard focus.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('xterm-helper-textarea')) return;
      const card = target.closest('[data-session-id]') as HTMLElement | null;
      if (card?.dataset.sessionId) {
        handleSetCurrentSession(card.dataset.sessionId);
      }
    };
    document.addEventListener('focusin', handleFocusIn, true);
    return () => document.removeEventListener('focusin', handleFocusIn, true);
  }, [handleSetCurrentSession]);

  // Auto-switch to a waiting (needsInput) session when the current terminal loses focus
  // and no manual switch is in progress. Never fires during manual session switching.
  useEffect(() => {
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('xterm-helper-textarea')) return;
      const card = target.closest('[data-session-id]') as HTMLElement | null;
      if (!card) return;
      const related = e.relatedTarget as HTMLElement | null;
      const relatedCard = related?.closest('[data-session-id]') as HTMLElement | null;
      if (manualSwitchPendingRef.current) return;
      if (mouseDownInSessionRef.current) return;
      if (relatedCard) return;

      // Never auto-switch if only one session is displayed
      if (displayedIdsRef.current.length <= 1) return;

      // Never auto-switch away from the focused/current session
      if (card.dataset.sessionId === currentSessionIdRef.current) return;

      setTimeout(() => {
        if (manualSwitchPendingRef.current) return;
        if (mouseDownInSessionRef.current) return;
        if ((document.activeElement as HTMLElement | null)?.closest('[data-session-id]')) return;
        if (displayedIdsRef.current.length <= 1) return;

        const waiting = activeSessionsRef.current.find((s) => s.needsInput && s.id !== card.dataset.sessionId);
        if (!waiting) return;
        console.log('[auto-switch on focusout] from:', card.dataset.sessionId, '→ waiting:', waiting.id);
        handleFocusSession(waiting.id);
      }, 150);
    };

    document.addEventListener('focusout', handleFocusOut, true);
    return () => document.removeEventListener('focusout', handleFocusOut, true);
  }, [handleFocusSession]);

  // Keep a ref to currentSessionId for the shortcut handler
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

  const sessionSwitcherOpenRef = useRef(sessionSwitcherOpen);
  sessionSwitcherOpenRef.current = sessionSwitcherOpen;


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
        // Cycle through ALL active sessions by creation order (including overflow)
        const allActive = [...activeSessionsRef.current].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        if (allActive.length <= 1) return;
        const curIdx = allActive.findIndex((s) => s.id === curId);
        const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % allActive.length;
        const nextId = allActive[nextIdx].id;
        console.log('[focus_next] curId:', curId, '| curIdx:', curIdx, '| nextIdx:', nextIdx, '| nextId:', nextId, '| displayed:', displayed);
        handleFocusSession(nextId);
        break;
      }
      case 'focus_prev': {
        if (switcherOpen) {
          setSessionSwitcherIndex((prev) => (prev - 1 + allSessions.length) % allSessions.length);
          return;
        }
        // Cycle through ALL active sessions by creation order (including overflow)
        const allActive2 = [...activeSessionsRef.current].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        if (allActive2.length <= 1) return;
        const curIdx2 = allActive2.findIndex((s) => s.id === curId);
        const prevIdx = curIdx2 === -1 ? allActive2.length - 1 : (curIdx2 - 1 + allActive2.length) % allActive2.length;
        const prevId = allActive2[prevIdx].id;
        console.log('[focus_prev] curId:', curId, '| curIdx:', curIdx2, '| prevIdx:', prevIdx, '| prevId:', prevId, '| displayed:', displayed);
        handleFocusSession(prevId);
        break;
      }
      // Arrow Down/Up: move focus vertically in the session grid
      case 'focus_down': {
        const gridSessions = displayedSessionsRef.current;
        if (gridSessions.length <= 1) return;
        const cols = Math.min(gridSessions.length, 3);
        const curIdx = gridSessions.findIndex((s) => s.id === curId);
        if (curIdx === -1) return;
        const targetIdx = curIdx + cols;
        if (targetIdx >= gridSessions.length) return; // no row below
        console.log('[focus_down] curId:', curId, '| curIdx:', curIdx, '| targetIdx:', targetIdx, '| cols:', cols);
        handleFocusSession(gridSessions[targetIdx].id);
        break;
      }
      case 'focus_up': {
        const gridSessions2 = displayedSessionsRef.current;
        if (gridSessions2.length <= 1) return;
        const cols2 = Math.min(gridSessions2.length, 3);
        const curIdx2 = gridSessions2.findIndex((s) => s.id === curId);
        if (curIdx2 === -1) return;
        const targetIdx2 = curIdx2 - cols2;
        if (targetIdx2 < 0) return; // no row above
        console.log('[focus_up] curId:', curId, '| curIdx:', curIdx2, '| targetIdx:', targetIdx2, '| cols:', cols2);
        handleFocusSession(gridSessions2[targetIdx2].id);
        break;
      }
      // Tab: open session switcher for all sessions (including overflow), sorted by queue priority
      case 'switch_next': {
        if (allSessions.length === 0) return;
        if (zoomedSessionIdRef.current) {
          handleToggleZoom(zoomedSessionIdRef.current);
        }
        // Sort by queue: waiting sessions first (needsInput: true), then others
        const sorted = [...allSessions].sort((a, b) => {
          if (a.needsInput && !b.needsInput) return -1;
          if (!a.needsInput && b.needsInput) return 1;
          return 0;
        });
        console.log('[switch_next] sorted:', sorted.map(s => `${s.id}(${s.needsInput ? 'waiting' : 'busy'})`));
        setSessionSwitcherOpen((wasOpen) => {
          if (!wasOpen) {
            const curIdx = curId ? sorted.findIndex((s) => s.id === curId) : -1;
            const newIdx = (curIdx + 1) % sorted.length;
            console.log('[switch_next] opening switcher. curIdx:', curIdx, '→ newIdx:', newIdx);
            setSessionSwitcherIndex(newIdx);
          } else {
            setSessionSwitcherIndex((prev) => {
              const newIdx = (prev + 1) % sorted.length;
              console.log('[switch_next] advancing in switcher. prev:', prev, '→ new:', newIdx);
              return newIdx;
            });
          }
          return true;
        });
        break;
      }
      case 'switch_prev': {
        if (allSessions.length === 0) return;
        if (zoomedSessionIdRef.current) {
          handleToggleZoom(zoomedSessionIdRef.current);
        }
        // Sort by queue: waiting sessions first (needsInput: true), then others
        const sorted = [...allSessions].sort((a, b) => {
          if (a.needsInput && !b.needsInput) return -1;
          if (!a.needsInput && b.needsInput) return 1;
          return 0;
        });
        console.log('[switch_prev] sorted:', sorted.map(s => `${s.id}(${s.needsInput ? 'waiting' : 'busy'})`));
        setSessionSwitcherOpen((wasOpen) => {
          if (!wasOpen) {
            const curIdx = curId ? sorted.findIndex((s) => s.id === curId) : 0;
            const newIdx = (curIdx - 1 + sorted.length) % sorted.length;
            console.log('[switch_prev] opening switcher. curIdx:', curIdx, '→ newIdx:', newIdx);
            setSessionSwitcherIndex(newIdx);
          } else {
            setSessionSwitcherIndex((prev) => {
              const newIdx = (prev - 1 + sorted.length) % sorted.length;
              console.log('[switch_prev] backing in switcher. prev:', prev, '→ new:', newIdx);
              return newIdx;
            });
          }
          return true;
        });
        break;
      }
      case 'confirm_session': {
        const idx = sessionSwitcherIndex;
        // Use same sorted order as the switcher UI (needsInput first)
        const sortedForConfirm = [...allSessions].sort((a, b) => (b.needsInput ? 1 : 0) - (a.needsInput ? 1 : 0));
        const target = sortedForConfirm[idx];
        console.log('[confirm_session] idx:', idx, '| target:', target?.id, '| sorted:', sortedForConfirm.map(s => s.id));
        if (target) {
          handleFocusSession(target.id);
        }
        setSessionSwitcherOpen(false);
        break;
      }
      case 'show_help':
        setShortcutsHelpOpen((prev) => !prev);
        break;
      case 'command_palette':
        setPaletteOpen((prev) => !prev);
        break;
      case 'zoom_session': {
        const zoomTarget = curId && displayed.includes(curId) ? curId : displayed[0];
        if (zoomTarget) {
          handleToggleZoom(zoomTarget);
        }
        break;
      }
      case 'kill_session': {
        if (!curId) break;
        const sess = allSessions.find((s) => s.id === curId);
        if (!sess || sess.status !== 'active') break;
        killSession(curId).catch(() => {});
        break;
      }
      case 'toggle_pin': {
        if (!curId) break;
        const sess = allSessions.find((s) => s.id === curId);
        if (!sess) break;
        toggleLock(curId, !sess.lock).catch(() => {});
        break;
      }
      case 'toggle_sidebar': {
        setSidebarOpen((prev) => {
          const next = !prev;
          localStorage.setItem('c3-sidebar-open', String(next));
          return next;
        });
        break;
      }
      case 'jump_1': case 'jump_2': case 'jump_3':
      case 'jump_4': case 'jump_5': case 'jump_6':
      case 'jump_7': case 'jump_8': case 'jump_9': {
        const num = parseInt(action.split('_')[1]);
        // Find session by constant creation-order number
        const byCreation = [...allSessions]
          .filter((s) => s.status === 'active')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const target = byCreation[num - 1];
        if (target) {
          console.log('[jump_' + num + '] target:', target.id, '| displayed:', displayed);
          handleFocusSession(target.id);
        }
        break;
      }
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
  }, [handleSetCurrentSession, handleFocusSession, sessionSwitcherIndex, handleToggleZoom, killSession, toggleLock]);

  // Handle actions from command palette — covers both shortcut-bound and button-only actions
  const handlePaletteAction = useCallback((action: string) => {
    const curId = currentSessionIdRef.current;
    switch (action) {
      // Shortcut-bound actions — delegate to existing handler
      case 'toggle_files':
      case 'toggle_git':
      case 'toggle_preview':
      case 'toggle_claude':
      case 'toggle_issues':
      case 'toggle_shell':
      case 'search_files':
      case 'focus_next':
      case 'focus_prev':
      case 'focus_down':
      case 'focus_up':
      case 'switch_next':
      case 'switch_prev':
      case 'confirm_session':
      case 'show_help':
      case 'command_palette':
      case 'zoom_session':
      case 'kill_session':
      case 'toggle_pin':
      case 'toggle_sidebar':
        handleShortcutAction(action as ShortcutAction);
        break;
      // Button-only actions
      case 'open_settings':
        (document.querySelector('[data-testid="settings-button"], [title*="Settings"]') as HTMLElement)?.click();
        break;
      case 'toggle_terminal_position':
      case 'font_size_decrease':
      case 'font_size_increase':
      case 'toggle_file_search':
        if (curId) {
          window.dispatchEvent(new CustomEvent('c3:shortcut', { detail: { action, sessionId: curId } }));
        }
        break;
      case 'continue_session':
        if (curId) {
          window.dispatchEvent(new CustomEvent('c3:shortcut', { detail: { action: 'continue_session', sessionId: curId } }));
        }
        break;
      case 'new_session':
        (document.querySelector('[data-testid="session-input"], input[placeholder*="session"], input[placeholder*="Session"]') as HTMLElement)?.focus();
        break;
    }
  }, [handleShortcutAction]);

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
    console.log('[handleSessionSwitcherSelect] clicked session:', id);
    handleFocusSession(id);
    setSessionSwitcherOpen(false);
  }, [handleFocusSession]);

  const handleSessionSwitcherClose = useCallback(() => {
    setSessionSwitcherOpen(false);
  }, []);

  // Sort sessions for the switcher: needsInput first, preserving relative order
  const switcherSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.needsInput ? 1 : 0) - (a.needsInput ? 1 : 0)),
    [sessions],
  );

  // Map session ID → constant number (1-9) based on creation order (never changes)
  const sessionNumbers = useMemo(() => {
    const map: Record<string, number> = {};
    const byCreation = [...activeSessions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    byCreation.forEach((s, i) => {
      if (i < 9) map[s.id] = i + 1;
    });
    return map;
  }, [activeSessions]);

  // ── Mobile Terminal State ──────────────────────────────────────────
  const mobileLayoutRef = useRef<MobileLayoutHandle>(null);
  const mobileTerminalRef = useRef<TerminalViewHandle>(null);
  const mobileOutputBufferRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_mobileOutputBuffer, setMobileOutputBuffer] = useState<string[]>([]);
  const [mobileDetectedPort, setMobileDetectedPort] = useState<{ port: number; localPort: number } | null>(null);

  const currentMobileSession = sessions.find((s) => s.id === currentSessionId);
  const { mode: mobileClaudeMode } = useClaudeMode(
    currentMobileSession?.needsInput ?? false,
    currentMobileSession?.status ?? 'active',
    currentMobileSession?.waitReason ?? null,
  );

  const handleMobileWsMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'port_detected') {
      setMobileDetectedPort({ port: msg.port, localPort: msg.localPort });
    }
    // Forward file_changed events to MobileLayout for extension handling (e.g. work-report)
    if (msg.type === 'file_changed') {
      const paths = (msg as { paths?: string[] }).paths ?? [];
      mobileLayoutRef.current?.handleFileChanged(paths);
    }
  }, []);

  const handleMobileBinaryData = useCallback((data: ArrayBuffer) => {
    const text = new TextDecoder().decode(data);
    const lines = text.split(/\r?\n/);
    const buf = mobileOutputBufferRef.current;
    buf.push(...lines);
    if (buf.length > 20) buf.splice(0, buf.length - 20);
    setMobileOutputBuffer([...buf]);
  }, []);

  const handleMobileNewSession = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('c3-sidebar-open', String(next));
      return next;
    });
  }, []);

  // ── Mobile Layout Branch ──────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <MobileLayout
          ref={mobileLayoutRef}
          viewportHeight={viewportHeight}
          keyboardOpen={false}
          keyboardOffset={keyboardOffset}
          sessions={sessions}
          activeSessions={activeSessions}
          currentSessionId={currentSessionId}
          onFocusSession={handleFocusSession}
          onSetCurrentSession={handleSetCurrentSession}
          onNewSession={handleMobileNewSession}
          onKillSession={(id) => killSession(id).catch(() => {})}
          terminalSendInput={(data) => mobileTerminalRef.current?.sendInput(data)}
          terminalScrollToTop={() => {/* scrollToTop handled via terminal ref */}}
          terminalScrollToBottom={() => mobileTerminalRef.current?.scrollToBottom()}
          isScrolledUp={mobileTerminalRef.current?.isScrolledUp}
          isWaiting={mobileClaudeMode === 'permission'}
          previewPort={mobileDetectedPort?.port}
          previewLocalPort={mobileDetectedPort?.localPort}
          isLocalSession={!currentMobileSession?.workerId}
          settings={appSettings}
          onSettingsChange={handleSettingsChange}
          workers={workersList}
          onWorkersChange={setWorkersList}
          projectTree={projectTree}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onStartAgent={(projectId, workDir, project) => {
            setStartAgentModal({ projectId, workDir, project });
          }}
        >
          {currentSessionId && (
            <TerminalView
              ref={mobileTerminalRef}
              sessionId={currentSessionId}
              active={true}
              onWsMessage={handleMobileWsMessage}
              onBinaryData={handleMobileBinaryData}
            />
          )}
        </MobileLayout>

        {/* Sidebar overlay for new session (shared with desktop) */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => {
                setSidebarOpen(false);
                localStorage.setItem('c3-sidebar-open', 'false');
              }}
            />
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80">
              <SessionQueue
                activeSessions={activeSessions}
                workers={workersList}
                onRequestAddMachine={() => setAddMachineTrigger((n) => n + 1)}
                onClose={() => {
                  setSidebarOpen(false);
                  localStorage.setItem('c3-sidebar-open', 'false');
                }}
                onCreateSession={async (...args) => {
                  const result = await createSession(...args);
                  setSidebarOpen(false);
                  localStorage.setItem('c3-sidebar-open', 'false');
                  return result;
                }}
                onFocusSession={handleFocusSession}
                onKillSession={(id) => killSession(id).catch(() => {})}
              />
            </div>
          </>
        )}
      </>
    );
  }

  // ── Desktop Layout (unchanged) ──────────────────────────────────────
  return (
    <div className="flex bg-gray-900 text-white" style={{ height: isMobile ? `${viewportHeight}px` : '100vh' }}>
      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-2 sm:px-4 py-1 sm:py-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
          {isMobile ? (
            <MobileSessionSelector
              sessions={activeSessions.map(s => ({ id: s.id, title: s.title || 'Untitled', status: s.status, needsInput: s.needsInput }))}
              currentSessionId={currentSessionId}
              waitingCount={activeSessions.filter(s => s.needsInput && s.id !== currentSessionId).length}
              onSelect={handleFocusSession}
              onNewSession={() => {
                setSidebarOpen((prev) => {
                  const next = !prev;
                  localStorage.setItem('c3-sidebar-open', String(next));
                  return next;
                });
              }}
            />
          ) : (
            <div className="flex items-center gap-4 min-w-0">
              <h1 className="text-lg font-bold shrink-0">Adyx</h1>
              <span className="text-sm text-gray-400">
                {activeCount} active
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            {!isMobile && (
              <button
                onClick={() => setPaletteOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 rounded-md transition-colors"
                title="Help &amp; Commands (Ctrl+. H)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Help</span>
                {chordState.isArmed && (
                  <span className="ml-0.5 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono font-bold animate-pulse">H</span>
                )}
              </button>
            )}
            {workersList.length > 1 && (
              <WorkerHealth workers={workersList} />
            )}
            {/* New Session / Close button */}
            <button
              onClick={() => {
                setSidebarOpen((prev) => {
                  const next = !prev;
                  localStorage.setItem('c3-sidebar-open', String(next));
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-sm rounded-md transition-colors ${
                sidebarOpen
                  ? 'text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 border border-gray-600'
                  : 'text-gray-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 hover:border-blue-500/50'
              }`}
              title={sidebarOpen ? 'Close sidebar (Ctrl+. N)' : 'New session (Ctrl+. N)'}
              data-testid="sidebar-toggle"
            >
              {sidebarOpen ? (
                <>
                  <span className="hidden sm:inline">Close</span>
                  <span className="text-base leading-none">&times;</span>
                </>
              ) : (
                <>
                  <span className="text-base leading-none">+</span>
                  <span className="hidden sm:inline">New Session</span>
                </>
              )}
              {chordState.isArmed && (
                <span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono font-bold animate-pulse">N</span>
              )}
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

        {/* Main Content: Collapsible sidebar + Session Grid */}
        <div className="flex-1 flex min-h-0">
          {/* Left Sidebar — collapsible */}
          {projectSidebarOpen ? (
            <div className="w-60 flex-shrink-0 border-r border-gray-700 bg-gray-800/30 flex flex-col">
              <ProjectSidePanel
                projects={projectTree}
                sessions={sessions}
                currentSessionId={currentSessionId}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onOpenProject={(id) => setOpenProjectId(id)}
                onFocusSession={handleFocusSession}
                onStartAgent={(projectId, workDir, project) => {
                  setStartAgentModal({ projectId, workDir, project });
                }}
                onNewSession={() => setSidebarOpen(true)}
                onCreateProject={() => setCreateProjectOpen(true)}
                onCollapse={() => { setProjectSidebarOpen(false); localStorage.setItem('c3-project-sidebar', 'false'); }}
              />
            </div>
          ) : (
            <button
              onClick={() => { setProjectSidebarOpen(true); localStorage.setItem('c3-project-sidebar', 'true'); }}
              className="w-10 flex-shrink-0 border-r border-gray-700 bg-gray-800/20 flex flex-col items-center justify-start pt-3 gap-2 hover:bg-gray-700/30 transition group"
              title="Show projects"
            >
              <svg className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {projectTree.length > 0 && (
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300">{projectTree.length}</span>
              )}
              {activeSessions.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-green-500" title={`${activeSessions.length} active`} />
              )}
            </button>
          )}

          {/* Project Detail overlay panel */}
          {openProjectId && findProject(openProjectId) && (
            <div className="w-96 flex-shrink-0 border-r border-gray-700 bg-gray-800 flex flex-col overflow-y-auto">
              <ProjectDetail
                projectId={openProjectId}
                project={findProject(openProjectId)!}
                onBack={() => setOpenProjectId(null)}
                onStartAgent={(projectId, issueNumber) => {
                  const project = findProject(projectId);
                  if (!project) return;
                  const workDir = project.directoryPath
                    || (project.githubRepo ? `/home/ubuntu/projects/${project.githubRepo.split('/').pop()}` : '');
                  if (!workDir) return;
                  const defaultName = issueNumber ? `#${issueNumber}` : (project.displayName || 'New agent');
                  setStartAgentModal({ projectId, workDir, project, issueNumber, defaultName } as any);
                }}
              />
            </div>
          )}

          {/* Session Grid — always visible */}
          <div className="flex-1 min-w-0 flex flex-col">
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
              zoomedSessionId={zoomedSessionId}
              onToggleZoom={handleToggleZoom}
              chordArmed={chordState.isArmed}
              sessionNumbers={sessionNumbers}
            />
          </div>
        </div>
      </div>

      {/* Chord Indicator */}
      {chordState.isArmed && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 bg-blue-600 text-white text-xs font-mono px-3 py-1 rounded shadow-lg animate-pulse">
          Ctrl+. ...
        </div>
      )}

      {/* Session Switcher Overlay */}
      <SessionSwitcher
        sessions={switcherSessions}
        currentSessionId={currentSessionId}
        isOpen={sessionSwitcherOpen}
        highlightedIndex={sessionSwitcherIndex}
        onSelect={handleSessionSwitcherSelect}
        onClose={handleSessionSwitcherClose}
      />

      {/* Create Project Modal */}
      {createProjectOpen && (
        <CreateProjectModal
          isOpen={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={() => { setCreateProjectOpen(false); }}
          workerId={workersList[0]?.id || ''}
        />
      )}

      {/* Start Agent Modal */}
      {startAgentModal && (
        <StartAgentModal
          defaultName={startAgentModal.defaultName || startAgentModal.project?.displayName || 'New agent'}
          projectName={startAgentModal.project?.displayName || 'Project'}
          onClose={() => setStartAgentModal(null)}
          onConfirm={async (options) => {
            const { projectId, workDir } = startAgentModal;
            setStartAgentModal(null);
            try {
              const { sessions: sApi } = await import('../services/api');
              const session = await sApi.create({
                workingDirectory: workDir,
                title: options.title,
                targetWorker: startAgentModal.project?.workerId,
                projectId,
                worktree: options.worktree || undefined,
                resume: options.resume || undefined,
                continueLatest: options.continueLatest || undefined,
                flags: options.flags || undefined,
              });
              handleFocusSession(session.id);
            } catch (err) {
              console.error('Failed to start agent:', err);
            }
          }}
        />
      )}

      {/* Shortcuts Help Overlay */}
      <ShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={(action) => {
          setPaletteOpen(false);
          handlePaletteAction(action);
        }}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />

      {/* Sidebar — desktop: inline panel; mobile: overlay */}
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => {
            setSidebarOpen(false);
            localStorage.setItem('c3-sidebar-open', 'false');
          }}
        />
      )}
      <div className={`transition-all duration-200 flex-shrink-0 ${
        sidebarOpen
          ? 'fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80 lg:relative lg:z-auto'
          : 'w-0 overflow-hidden'
      }`}>
        <SessionQueue
          activeSessions={activeSessions}
          workers={workersList}
          onRequestAddMachine={() => setAddMachineTrigger((n) => n + 1)}
          onClose={() => {
            setSidebarOpen(false);
            localStorage.setItem('c3-sidebar-open', 'false');
          }}
          onCreateSession={async (...args) => {
            const result = await createSession(...args);
            // On mobile, auto-close sidebar so user sees their new session
            if (window.innerWidth < 1024) {
              setSidebarOpen(false);
              localStorage.setItem('c3-sidebar-open', 'false');
            }
            return result;
          }}
          onFocusSession={handleFocusSession}
          onKillSession={(id) => killSession(id).catch(() => {})}
        />
      </div>

      {/* Mobile: Waiting Session Alert */}
      {isMobile && (
        <WaitingSessionAlert
          waitingSessions={activeSessions
            .filter(s => s.needsInput && s.id !== currentSessionId)
            .map(s => ({ id: s.id, title: s.title || 'Untitled', waitReason: s.waitReason }))}
          onSwitch={handleFocusSession}
          bottomOffset={keyboardOffset + 52}
        />
      )}
    </div>
  );
}
