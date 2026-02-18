import { useState, useCallback, useRef, useEffect } from 'react';
import { panelState as panelStateApi } from '../services/api';

export type ActivePanel = 'none' | 'files' | 'git' | 'preview';

interface ScrollPosition {
  line: number;
  column: number;
}

export interface PanelStateValues {
  activePanel: ActivePanel;
  fileTabs: string[];
  activeTabIndex: number;
  tabScrollPositions: Record<string, ScrollPosition>;
  gitScrollPosition: number;
  previewUrl: string;
  panelWidthPercent: number;
}

const DEFAULT_STATE: PanelStateValues = {
  activePanel: 'none',
  fileTabs: [],
  activeTabIndex: 0,
  tabScrollPositions: {},
  gitScrollPosition: 0,
  previewUrl: '',
  panelWidthPercent: 40,
};

export function usePanel(sessionId: string | null) {
  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [fileTabs, setFileTabs] = useState<string[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabScrollPositions, setTabScrollPositions] = useState<Record<string, ScrollPosition>>({});
  const [gitScrollPosition, setGitScrollPosition] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [panelWidthPercent, setPanelWidthPercent] = useState(40);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  const getState = useCallback((): PanelStateValues => ({
    activePanel,
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    panelWidthPercent,
  }), [activePanel, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, panelWidthPercent]);

  const restoreState = useCallback((state: PanelStateValues) => {
    setActivePanel(state.activePanel);
    setFileTabs(state.fileTabs);
    setActiveTabIndex(state.activeTabIndex);
    setTabScrollPositions(state.tabScrollPositions);
    setGitScrollPosition(state.gitScrollPosition);
    setPreviewUrl(state.previewUrl);
    setPanelWidthPercent(state.panelWidthPercent);
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

    // Save previous session state before switching
    const prevSession = currentSessionRef.current;
    if (prevSession && prevSession !== sessionId) {
      // Get current state values directly (not from stale closure)
      // We schedule save inline with the values from current render
    }

    currentSessionRef.current = sessionId;

    // Load new session state
    panelStateApi.get(sessionId).then((loaded) => {
      if (currentSessionRef.current === sessionId) {
        restoreState({
          activePanel: loaded.activePanel as ActivePanel,
          fileTabs: loaded.fileTabs,
          activeTabIndex: loaded.activeTabIndex,
          tabScrollPositions: loaded.tabScrollPositions,
          gitScrollPosition: loaded.gitScrollPosition,
          previewUrl: loaded.previewUrl,
          panelWidthPercent: loaded.panelWidthPercent,
        });
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

  const openPanel = useCallback((panel: ActivePanel) => {
    setActivePanel((prev) => {
      const next = prev === panel ? 'none' : panel;
      if (currentSessionRef.current) {
        // Schedule save with updated value
        const state = { ...DEFAULT_STATE, activePanel: next, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, panelWidthPercent };
        scheduleSave(currentSessionRef.current, state);
      }
      return next;
    });
  }, [fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, panelWidthPercent, scheduleSave]);

  const closePanel = useCallback(() => {
    openPanel('none' as ActivePanel);
  }, [openPanel]);

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

  return {
    activePanel,
    fileTabs,
    activeTabIndex,
    tabScrollPositions,
    gitScrollPosition,
    previewUrl,
    panelWidthPercent,
    openPanel,
    closePanel,
    addFileTab,
    removeFileTab,
    setActiveTab: setActiveTabIndex,
    updateScrollPosition,
    setGitScrollPosition,
    setPreviewUrl,
    setPanelWidth: setPanelWidthPercent,
    getState,
    scheduleSave: (state: PanelStateValues) => {
      if (currentSessionRef.current) {
        scheduleSave(currentSessionRef.current, state);
      }
    },
  };
}
