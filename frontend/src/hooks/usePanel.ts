import { useState, useCallback, useRef, useEffect } from 'react';
import { panelState as panelStateApi, layoutSnapshot as layoutSnapshotApi } from '../services/api';

export type ActivePanel = 'none' | 'files' | 'git' | 'preview';
export type LeftPanel = 'none' | 'files';
export type RightPanel = 'none' | 'git' | 'preview';
export type PanelContent = 'none' | 'files' | 'git' | 'preview' | 'claude' | 'search' | 'issues' | 'shell' | 'widgets' | `ext:${string}`;
export type TerminalPosition = 'center' | 'bottom';
export type ViewportMode = 'desktop' | 'mobile' | 'custom' | null;

interface ScrollPosition {
  line: number;
  column: number;
}

export interface PanelStateValues {
  // v4 dual-panel fields
  leftPanel: LeftPanel | PanelContent;
  rightPanel: RightPanel | PanelContent;
  leftWidthPercent: number;
  rightWidthPercent: number;
  // v6 bottom panel + terminal control
  bottomPanel: PanelContent;
  bottomHeightPercent: number;
  terminalPosition: TerminalPosition;
  terminalVisible: boolean;
  previewViewport: ViewportMode;
  customViewportWidth: number | null;
  customViewportHeight: number | null;
  mobileDeviceId: string | null;
  desktopDeviceId: string | null;
  fontSize: number;
  // Backward-compatible legacy field (derived from left/right)
  activePanel: string;
  // Shared fields
  fileTabs: string[];
  activeTabIndex: number;
  tabScrollPositions: Record<string, ScrollPosition>;
  gitScrollPosition: number;
  previewUrl: string;
  panelWidthPercent: number; // legacy — kept for backward compat
}

const DEFAULT_STATE: PanelStateValues = {
  leftPanel: 'none',
  rightPanel: 'none',
  leftWidthPercent: 25,
  rightWidthPercent: 35,
  bottomPanel: 'none',
  bottomHeightPercent: 40,
  terminalPosition: 'center',
  terminalVisible: true,
  previewViewport: 'desktop',
  customViewportWidth: null,
  customViewportHeight: null,
  mobileDeviceId: null,
  desktopDeviceId: null,
  fontSize: 14,
  activePanel: 'none',
  fileTabs: [],
  activeTabIndex: 0,
  tabScrollPositions: {},
  gitScrollPosition: 0,
  previewUrl: '',
  panelWidthPercent: 40,
};

/** Map legacy activePanel to left/right panels */
function migrateFromLegacy(activePanel: ActivePanel): { leftPanel: LeftPanel; rightPanel: RightPanel } {
  if (activePanel === 'files') return { leftPanel: 'files', rightPanel: 'none' };
  if (activePanel === 'git') return { leftPanel: 'none', rightPanel: 'git' };
  if (activePanel === 'preview') return { leftPanel: 'none', rightPanel: 'preview' };
  return { leftPanel: 'none', rightPanel: 'none' };
}

/** Derive legacy activePanel from left/right (for backward compat) */
function deriveActivePanel(left: string, right: string): string {
  // If both are active, prefer right for legacy single-value compat
  if (right !== 'none') return right;
  if (left !== 'none') return left;
  return 'none';
}

/** Generate a sorted, +-joined key from open panel names for layout snapshot lookups */
export function getCombinationKey(left: string, right: string): string {
  const panels = [left, right].filter((p) => p !== 'none').sort();
  return panels.join('+');
}

export type ViewMode = 'grid' | 'zoomed';

export function usePanel(sessionId: string | null, viewMode: ViewMode = 'grid') {
  const [leftPanel, setLeftPanelRaw] = useState<PanelContent>('none');
  const [rightPanel, setRightPanelRaw] = useState<PanelContent>('none');
  const [leftWidthPercent, setLeftWidthPercent] = useState(25);
  const [rightWidthPercent, setRightWidthPercent] = useState(35);
  const [bottomPanel, setBottomPanelRaw] = useState<PanelContent>('none');
  const [bottomHeightPercent, setBottomHeightPercent] = useState(40);
  const [terminalPosition, setTerminalPosition] = useState<TerminalPosition>('center');
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [previewViewport, setPreviewViewport] = useState<ViewportMode>('desktop');
  const [customViewportWidth, setCustomViewportWidth] = useState<number | null>(null);
  const [customViewportHeight, setCustomViewportHeight] = useState<number | null>(null);
  const [mobileDeviceId, setMobileDeviceId] = useState<string | null>(null);
  const [desktopDeviceId, setDesktopDeviceId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [fileTabs, setFileTabs] = useState<string[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabScrollPositions, setTabScrollPositions] = useState<Record<string, ScrollPosition>>({});
  const [gitScrollPosition, setGitScrollPosition] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewNavCounter, setPreviewNavCounter] = useState(0);

  // Typed setters that accept PanelContent
  const setLeftPanel = useCallback((val: PanelContent | ((prev: PanelContent) => PanelContent)) => {
    setLeftPanelRaw(val);
    window.dispatchEvent(new CustomEvent('c3:grid-changed'));
  }, []);
  const setRightPanel = useCallback((val: PanelContent | ((prev: PanelContent) => PanelContent)) => {
    setRightPanelRaw(val);
    window.dispatchEvent(new CustomEvent('c3:grid-changed'));
  }, []);
  const setBottomPanel = useCallback((val: PanelContent | ((prev: PanelContent) => PanelContent)) => {
    setBottomPanelRaw(val);
    window.dispatchEvent(new CustomEvent('c3:grid-changed'));
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const combinationKeyRef = useRef<string>('');

  // Dual layout: compute storage key from sessionId + viewMode
  const storageKey = sessionId ? (viewMode === 'zoomed' ? `${sessionId}:zoomed` : sessionId) : null;
  const viewModeKey = viewMode === 'zoomed' ? 'zoomed' : '';
  const storageKeyRef = useRef<string | null>(null);

  const getState = useCallback((): PanelStateValues => ({
    leftPanel,
    rightPanel,
    leftWidthPercent,
    rightWidthPercent,
    bottomPanel,
    bottomHeightPercent,
    terminalPosition,
    terminalVisible,
    previewViewport,
    customViewportWidth,
    customViewportHeight,
    mobileDeviceId,
    desktopDeviceId,
    fontSize,
    activePanel: deriveActivePanel(leftPanel as LeftPanel, rightPanel as RightPanel),
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    panelWidthPercent: rightWidthPercent, // legacy compat
  }), [leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, bottomPanel, bottomHeightPercent, terminalPosition, terminalVisible, previewViewport, customViewportWidth, customViewportHeight, mobileDeviceId, desktopDeviceId, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl]);

  // Keep a ref to the latest state so the storageKey-switch effect can read fresh values
  const stateRef = useRef<PanelStateValues>(getState());
  stateRef.current = getState();

  const restoreState = useCallback((state: PanelStateValues) => {
    console.log(`[RestoreState] Restoring with:`, { previewUrl: state.previewUrl, previewViewport: state.previewViewport });
    // Normalize legacy 'search' panel to 'files' (search is now inside files sidebar)
    const normalizePanel = (p: string): PanelContent => (p === 'search' ? 'files' : p) as PanelContent;

    // Handle v4+ format (has leftPanel/rightPanel)
    if (state.leftPanel !== undefined && state.rightPanel !== undefined) {
      setLeftPanel(normalizePanel(state.leftPanel));
      setRightPanel(normalizePanel(state.rightPanel));
      setLeftWidthPercent(state.leftWidthPercent ?? 25);
      setRightWidthPercent(state.rightWidthPercent ?? 35);
    } else {
      // Legacy format — migrate from activePanel
      const migrated = migrateFromLegacy(state.activePanel as ActivePanel);
      setLeftPanel(migrated.leftPanel);
      setRightPanel(migrated.rightPanel);
      setLeftWidthPercent(25);
      setRightWidthPercent(state.panelWidthPercent ?? 35);
    }
    // v6 fields — default gracefully when absent (backward compat)
    setBottomPanel((state.bottomPanel as PanelContent) ?? 'none');
    setBottomHeightPercent(state.bottomHeightPercent ?? 40);
    setTerminalPosition(state.terminalPosition ?? 'center');
    setTerminalVisible(state.terminalVisible ?? true);
    setPreviewViewport((state.previewViewport as ViewportMode) ?? 'desktop');
    setCustomViewportWidth(state.customViewportWidth ?? null);
    setCustomViewportHeight(state.customViewportHeight ?? null);
    setMobileDeviceId(state.mobileDeviceId ?? null);
    setDesktopDeviceId((state as any).desktopDeviceId ?? null);
    setFontSize(state.fontSize ?? 14);
    setFileTabs(state.fileTabs);
    setActiveTabIndex(state.activeTabIndex);
    setTabScrollPositions(state.tabScrollPositions);
    setGitScrollPosition(state.gitScrollPosition);
    console.log(`[RestoreState] Setting previewUrl to: "${state.previewUrl}"`);
    setPreviewUrl(state.previewUrl);
    // Initialize combination key ref so snapshot tracking starts from correct state
    combinationKeyRef.current = getCombinationKey(
      state.leftPanel !== undefined ? (state.leftPanel === 'search' ? 'files' : state.leftPanel) : 'none',
      state.rightPanel !== undefined ? (state.rightPanel === 'search' ? 'files' : state.rightPanel) : 'none',
    );
  }, []);

  const resetToDefaults = useCallback(() => {
    restoreState(DEFAULT_STATE);
  }, [restoreState]);

  // Debounced save to backend
  const scheduleSave = useCallback((sid: string, state: PanelStateValues) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      console.log(`[Panel Save] Session ${sid}:`, { previewUrl: state.previewUrl, previewViewport: state.previewViewport });
      panelStateApi.save(sid, state).catch((err) => {
        console.error(`[Panel Save Error] Failed to save panel state:`, err);
      });
    }, 100);
  }, []);

  // Debounced snapshot save for current combination (035-save-panel-position)
  const scheduleSnapshotSave = useCallback((sid: string, combKey: string, vm: string) => {
    if (!combKey) return; // No panels open — nothing to snapshot
    if (snapshotSaveTimerRef.current) {
      clearTimeout(snapshotSaveTimerRef.current);
    }
    snapshotSaveTimerRef.current = setTimeout(() => {
      const s = stateRef.current;
      layoutSnapshotApi.save(sid, {
        combinationKey: combKey,
        leftWidthPercent: s.leftWidthPercent,
        rightWidthPercent: s.rightWidthPercent,
        bottomHeightPercent: s.bottomHeightPercent,
      }, vm || undefined).catch(() => {});
    }, 200);
  }, []);

  // Load state on session/viewMode change (dual layout persistence)
  useEffect(() => {
    if (!storageKey || !sessionId) {
      resetToDefaults();
      storageKeyRef.current = null;
      return;
    }

    // Save current layout to the OLD key before switching (if we had one)
    if (storageKeyRef.current && storageKeyRef.current !== storageKey) {
      const oldKey = storageKeyRef.current;
      // Flush any pending save immediately
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Save current state to old key using ref (avoids stale closure)
      panelStateApi.save(oldKey, stateRef.current).catch(() => {});
    }

    currentSessionRef.current = sessionId;
    storageKeyRef.current = storageKey;

    // Load layout for the new key
    panelStateApi.get(storageKey).then((loaded) => {
      if (storageKeyRef.current === storageKey) {
        restoreState(loaded as unknown as PanelStateValues);
        // Enable auto-save after a tick (let React batch the restoreState renders)
        requestAnimationFrame(() => { saveReadyRef.current = true; });
      }
    }).catch(() => {
      // No saved state for this view mode — use defaults
      if (storageKeyRef.current === storageKey) {
        resetToDefaults();
        requestAnimationFrame(() => { saveReadyRef.current = true; });
      }
    });

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (snapshotSaveTimerRef.current) {
        clearTimeout(snapshotSaveTimerRef.current);
        snapshotSaveTimerRef.current = null;
      }
      // Flush save on unmount/key-change so panel state isn't lost
      if (storageKeyRef.current) {
        panelStateApi.save(storageKeyRef.current, stateRef.current).catch(() => {});
      }
    };
  }, [storageKey]); // eslint-disable-line -- intentionally only re-run on key change

  const togglePanel = useCallback((panel: ActivePanel) => {
    if (panel === 'files') {
      setLeftPanel((prev: PanelContent) => (prev === 'files' ? 'none' : 'files'));
    } else if (panel === 'git' || panel === 'preview') {
      setRightPanel((prev: PanelContent) => (prev === panel ? 'none' : panel));
    } else {
      // 'none' — close all
      setLeftPanel('none');
      setRightPanel('none');
    }
  }, []);

  const closePanel = useCallback(() => {
    togglePanel('none' as ActivePanel);
  }, [togglePanel]);

  const addFileTab = useCallback((path: string) => {
    setFileTabs((prev) => {
      if (prev.includes(path)) {
        const idx = prev.indexOf(path);
        setActiveTabIndex(idx);
        return prev;
      }
      const next = [...prev, path];
      setActiveTabIndex(next.length - 1);
      return next;
    });
  }, []);

  const removeFileTab = useCallback((path: string) => {
    setFileTabs((prev) => {
      const idx = prev.indexOf(path);
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setActiveTabIndex((prevIdx) => {
        if (next.length === 0) return 0;
        if (prevIdx >= next.length) return next.length - 1;
        return prevIdx;
      });
      return next;
    });
  }, []);

  const updateScrollPosition = useCallback((path: string, pos: ScrollPosition) => {
    setTabScrollPositions((prev) => ({ ...prev, [path]: pos }));
  }, []);

  // Unified auto-save: watches ALL panel state and debounce-saves on any change.
  // Uses a "ready" flag to skip save-back during load/restore.
  const saveReadyRef = useRef(false);

  useEffect(() => {
    if (!saveReadyRef.current) return;
    if (!storageKeyRef.current) return;
    const state: PanelStateValues = {
      leftPanel,
      rightPanel,
      leftWidthPercent,
      rightWidthPercent,
      bottomPanel,
      bottomHeightPercent,
      terminalPosition,
      terminalVisible,
      previewViewport,
      customViewportWidth,
      customViewportHeight,
      mobileDeviceId,
      desktopDeviceId,
      fontSize,
      activePanel: deriveActivePanel(leftPanel, rightPanel),
      fileTabs,
      activeTabIndex,
      tabScrollPositions,
      gitScrollPosition,
      previewUrl,
      panelWidthPercent: rightWidthPercent,
    };
    scheduleSave(storageKeyRef.current, state);

    // Also save layout snapshot for current combination (T014)
    if (sessionId) {
      scheduleSnapshotSave(sessionId, combinationKeyRef.current, viewModeKey);
    }
  }, [leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, bottomPanel, bottomHeightPercent, terminalPosition, terminalVisible, previewViewport, customViewportWidth, customViewportHeight, mobileDeviceId, desktopDeviceId, fontSize, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, scheduleSave, scheduleSnapshotSave, sessionId, viewModeKey]);

  // Track panel combination changes and restore saved snapshots (T012/T013)
  useEffect(() => {
    if (!saveReadyRef.current) return;
    if (!sessionId) return;
    const newKey = getCombinationKey(leftPanel, rightPanel);
    const oldKey = combinationKeyRef.current;
    if (newKey === oldKey) return;

    // Save snapshot for old combination before switching
    if (oldKey && sessionId) {
      const s = stateRef.current;
      layoutSnapshotApi.save(sessionId, {
        combinationKey: oldKey,
        leftWidthPercent: s.leftWidthPercent,
        rightWidthPercent: s.rightWidthPercent,
        bottomHeightPercent: s.bottomHeightPercent,
      }, viewModeKey || undefined).catch(() => {});
    }

    combinationKeyRef.current = newKey;

    // Restore snapshot for new combination
    if (newKey && sessionId) {
      layoutSnapshotApi.get(sessionId, newKey, viewModeKey || undefined).then((snapshot) => {
        // Only apply if combination hasn't changed again
        if (combinationKeyRef.current === newKey) {
          setLeftWidthPercent(snapshot.leftWidthPercent);
          setRightWidthPercent(snapshot.rightWidthPercent);
          setBottomHeightPercent(snapshot.bottomHeightPercent);
        }
      }).catch(() => {
        // No saved snapshot — keep defaults
      });
    }
  }, [leftPanel, rightPanel, sessionId, viewModeKey]); // eslint-disable-line -- intentionally track panel changes

  // Disable auto-save when storageKey changes (will re-enable after load completes)
  useEffect(() => {
    saveReadyRef.current = false;
  }, [storageKey]);

  // Computed legacy activePanel for backward compat
  const activePanel = deriveActivePanel(leftPanel, rightPanel);
  // Legacy panelWidthPercent — use rightWidthPercent for compat
  const panelWidthPercent = rightWidthPercent;

  const setCustomViewport = useCallback((width: number, height: number) => {
    setPreviewViewport('custom');
    setCustomViewportWidth(width);
    setCustomViewportHeight(height);
  }, []);

  return {
    // v4 dual-panel state
    leftPanel,
    rightPanel,
    leftWidthPercent,
    rightWidthPercent,
    setLeftWidth: setLeftWidthPercent,
    setRightWidth: setRightWidthPercent,
    setLeftPanel,
    setRightPanel,
    // v6 bottom panel + terminal control
    bottomPanel,
    bottomHeightPercent,
    terminalPosition,
    terminalVisible,
    previewViewport,
    customViewportWidth,
    customViewportHeight,
    mobileDeviceId,
    desktopDeviceId,
    setBottomPanel,
    setBottomHeight: setBottomHeightPercent,
    setTerminalPosition,
    setTerminalVisible,
    setPreviewViewport,
    setCustomViewport,
    setMobileDeviceId,
    setDesktopDeviceId,
    fontSize,
    setFontSize,
    // Backward-compatible legacy fields
    activePanel,
    panelWidthPercent,
    // Actions
    openPanel: togglePanel,
    closePanel,
    addFileTab,
    removeFileTab,
    setActiveTab: setActiveTabIndex,
    updateScrollPosition,
    setGitScrollPosition,
    setPreviewUrl,
    previewNavCounter,
    bumpPreviewNavCounter: () => setPreviewNavCounter(c => c + 1),
    setPanelWidth: setRightWidthPercent, // legacy — maps to right width
    // File tabs
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    // State management
    getState,
    scheduleSave: (state: PanelStateValues) => {
      if (storageKeyRef.current) {
        scheduleSave(storageKeyRef.current, state);
      }
    },
  };
}
