import { useState, useCallback, useRef, useEffect } from 'react';
import { panelState as panelStateApi } from '../services/api';

export type ActivePanel = 'none' | 'files' | 'git' | 'preview';
export type LeftPanel = 'none' | 'files';
export type RightPanel = 'none' | 'git' | 'preview';

interface ScrollPosition {
  line: number;
  column: number;
}

export interface PanelStateValues {
  // v4 dual-panel fields
  leftPanel: LeftPanel;
  rightPanel: RightPanel;
  leftWidthPercent: number;
  rightWidthPercent: number;
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
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('none');
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const [leftWidthPercent, setLeftWidthPercent] = useState(25);
  const [rightWidthPercent, setRightWidthPercent] = useState(35);
  const [fileTabs, setFileTabs] = useState<string[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabScrollPositions, setTabScrollPositions] = useState<Record<string, ScrollPosition>>({});
  const [gitScrollPosition, setGitScrollPosition] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  const getState = useCallback((): PanelStateValues => ({
    leftPanel,
    rightPanel,
    leftWidthPercent,
    rightWidthPercent,
    activePanel: deriveActivePanel(leftPanel, rightPanel),
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    panelWidthPercent: rightWidthPercent, // legacy compat
  }), [leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl]);

  const restoreState = useCallback((state: PanelStateValues) => {
    // Handle v4 format (has leftPanel/rightPanel)
    if (state.leftPanel !== undefined && state.rightPanel !== undefined) {
      setLeftPanel(state.leftPanel);
      setRightPanel(state.rightPanel);
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

  const doSave = useCallback((newLeft: LeftPanel, newRight: RightPanel) => {
    if (currentSessionRef.current) {
      const state: PanelStateValues = {
        leftPanel: newLeft,
        rightPanel: newRight,
        leftWidthPercent,
        rightWidthPercent,
        activePanel: deriveActivePanel(newLeft, newRight),
        fileTabs,
        activeTabIndex,
        tabScrollPositions,
        gitScrollPosition,
        previewUrl,
        panelWidthPercent: rightWidthPercent,
      };
      scheduleSave(currentSessionRef.current, state);
    }
  }, [leftWidthPercent, rightWidthPercent, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, scheduleSave]);

  const togglePanel = useCallback((panel: ActivePanel) => {
    if (panel === 'files') {
      setLeftPanel((prev) => {
        const next = prev === 'files' ? 'none' : 'files';
        doSave(next, rightPanel);
        return next;
      });
    } else if (panel === 'git' || panel === 'preview') {
      setRightPanel((prev) => {
        // Toggle off if same panel, otherwise switch
        const next: RightPanel = prev === panel ? 'none' : panel;
        doSave(leftPanel, next);
        return next;
      });
    } else {
      // 'none' — close all
      setLeftPanel('none');
      setRightPanel('none');
      doSave('none', 'none');
    }
  }, [leftPanel, rightPanel, doSave]);

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

  // Computed legacy activePanel for backward compat
  const activePanel = deriveActivePanel(leftPanel, rightPanel);
  // Legacy panelWidthPercent — use rightWidthPercent for compat
  const panelWidthPercent = rightWidthPercent;

  return {
    // v4 dual-panel state
    leftPanel,
    rightPanel,
    leftWidthPercent,
    rightWidthPercent,
    setLeftWidth: setLeftWidthPercent,
    setRightWidth: setRightWidthPercent,
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
