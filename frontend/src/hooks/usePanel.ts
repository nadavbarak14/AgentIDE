import { useState, useCallback, useRef, useEffect } from 'react';
import { panelState as panelStateApi } from '../services/api';

export type ActivePanel = 'none' | 'files' | 'git' | 'preview';
export type LeftPanel = 'none' | 'files';
export type RightPanel = 'none' | 'git' | 'preview';
export type PanelContent = 'none' | 'files' | 'git' | 'preview' | 'claude' | 'search' | 'issues' | 'shell' | `ext:${string}`;
export type TerminalPosition = 'center' | 'bottom';
export type ViewportMode = 'desktop' | 'mobile' | 'custom';

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
  fontSize: number;
  // Backward-compatible legacy field (derived from left/right)
  activePanel: ActivePanel;
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
function deriveActivePanel(left: LeftPanel, right: RightPanel): ActivePanel {
  // If both are active, prefer right for legacy single-value compat
  if (right !== 'none') return right;
  if (left !== 'none') return left;
  return 'none';
}

export function usePanel(sessionId: string | null) {
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
  }, []);
  const setRightPanel = useCallback((val: PanelContent | ((prev: PanelContent) => PanelContent)) => {
    setRightPanelRaw(val);
  }, []);
  const setBottomPanel = useCallback((val: PanelContent | ((prev: PanelContent) => PanelContent)) => {
    setBottomPanelRaw(val);
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionRef = useRef<string | null>(null);

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
    fontSize,
    activePanel: deriveActivePanel(leftPanel as LeftPanel, rightPanel as RightPanel),
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    panelWidthPercent: rightWidthPercent, // legacy compat
  }), [leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, bottomPanel, bottomHeightPercent, terminalPosition, terminalVisible, previewViewport, customViewportWidth, customViewportHeight, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl]);

  const restoreState = useCallback((state: PanelStateValues) => {
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
      const migrated = migrateFromLegacy(state.activePanel);
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
    setPreviewViewport(state.previewViewport ?? 'desktop');
    setCustomViewportWidth(state.customViewportWidth ?? null);
    setCustomViewportHeight(state.customViewportHeight ?? null);
    setFontSize(state.fontSize ?? 14);
    setFileTabs(state.fileTabs);
    setActiveTabIndex(state.activeTabIndex);
    setTabScrollPositions(state.tabScrollPositions);
    setGitScrollPosition(state.gitScrollPosition);
    setPreviewUrl(state.previewUrl);
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
      panelStateApi.save(sid, state).catch(() => {
        // Silently ignore save errors
      });
    }, 500);
  }, []);

  // Load state on session change
  useEffect(() => {
    if (!sessionId) {
      resetToDefaults();
      return;
    }

    currentSessionRef.current = sessionId;

    // Load new session state
    panelStateApi.get(sessionId).then((loaded) => {
      if (currentSessionRef.current === sessionId) {
        restoreState(loaded as unknown as PanelStateValues);
      }
    }).catch(() => {
      // No saved state — use defaults
      if (currentSessionRef.current === sessionId) {
        resetToDefaults();
      }
    });

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [sessionId, restoreState, resetToDefaults]);

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
  // Uses a render counter to skip the first render (initial load / session switch).
  const saveGeneration = useRef(0);
  useEffect(() => {
    // Skip the very first effect run after mount or session change
    if (saveGeneration.current < 2) {
      saveGeneration.current++;
      return;
    }
    if (!currentSessionRef.current) return;
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
      fontSize,
      activePanel: deriveActivePanel(leftPanel as LeftPanel, rightPanel as RightPanel),
      fileTabs,
      activeTabIndex,
      tabScrollPositions,
      gitScrollPosition,
      previewUrl,
      panelWidthPercent: rightWidthPercent,
    };
    scheduleSave(currentSessionRef.current, state);
  }, [leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, bottomPanel, bottomHeightPercent, terminalPosition, terminalVisible, previewViewport, customViewportWidth, customViewportHeight, fontSize, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, scheduleSave]);

  // Reset generation counter when session changes so we skip the load-triggered renders
  useEffect(() => {
    saveGeneration.current = 0;
  }, [sessionId]);

  // Computed legacy activePanel for backward compat
  const activePanel = deriveActivePanel(leftPanel as LeftPanel, rightPanel as RightPanel);
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
    setBottomPanel,
    setBottomHeight: setBottomHeightPercent,
    setTerminalPosition,
    setTerminalVisible,
    setPreviewViewport,
    setCustomViewport,
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
      if (currentSessionRef.current) {
        scheduleSave(currentSessionRef.current, state);
      }
    },
  };
}
