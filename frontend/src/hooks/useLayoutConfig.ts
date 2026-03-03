import { useState, useCallback, useRef, useEffect } from 'react';
import { panelState as panelStateApi } from '../services/api';
import type { LayoutConfig, PanelId, LayoutPresetId } from '../types/layout';
import {
  applyPreset,
  movePanelToCell,
  swapPanels,
  closePanel,
  openPanel,
  updateSizes,
  buildDefaultLayoutConfig,
} from '../constants/layoutPresets';

const VALID_PRESET_IDS = ['equal-3col', '2left-1right', '1left-2right', '2top-1bottom', '1top-2bottom', 'focus'] as const;
const KNOWN_PANEL_IDS = new Set(['files', 'git', 'preview', 'issues', 'widgets', 'shell']);

function getDefaultLayoutConfig(): LayoutConfig {
  return {
    presetId: 'equal-3col',
    cells: [
      { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
      { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
      { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
    ],
    sizes: [33, 34, 33],
  };
}

export function useLayoutConfig(sessionId: string | null) {
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>(getDefaultLayoutConfig());
  const [isLoading, setIsLoading] = useState(true);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const saveGenerationRef = useRef(0);
  const skipSaveRef = useRef(true);

  const scheduleLayoutSave = useCallback((sid: string, config: LayoutConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      panelStateApi.saveLayoutConfig(sid, config).catch((err) => {
        console.error('[LayoutConfig Save Error]', err);
      });
    }, 100);
  }, []);

  // Load on session change
  useEffect(() => {
    if (!sessionId) {
      setLayoutConfig(getDefaultLayoutConfig());
      setIsLoading(false);
      return;
    }

    currentSessionRef.current = sessionId;
    skipSaveRef.current = true;
    setIsLoading(true);

    panelStateApi.get(sessionId).then((loaded) => {
      if (currentSessionRef.current !== sessionId) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = loaded as any;
      if (raw.layoutConfig && VALID_PRESET_IDS.includes(raw.layoutConfig.presetId)) {
        // Warn on unknown panelIds (Principle VIII: observability)
        if (Array.isArray(raw.layoutConfig.cells)) {
          for (const cell of raw.layoutConfig.cells) {
            const pid = cell.activePanelId;
            if (pid && !KNOWN_PANEL_IDS.has(pid) && !String(pid).startsWith('ext:')) {
              console.warn(`[LayoutConfig] Unknown panelId "${pid}" in loaded layout — ignoring`);
            }
          }
        }
        setLayoutConfig(raw.layoutConfig as LayoutConfig);
      } else {
        // Migrate from legacy state
        const migrated = buildDefaultLayoutConfig(
          raw.leftPanel || 'none',
          raw.rightPanel || 'none',
          raw.terminalVisible ?? true,
        );
        setLayoutConfig(migrated);
      }
      setIsLoading(false);
      // Allow saves after a tick
      setTimeout(() => { skipSaveRef.current = false; }, 50);
    }).catch(() => {
      if (currentSessionRef.current !== sessionId) return;
      setLayoutConfig(getDefaultLayoutConfig());
      setIsLoading(false);
      setTimeout(() => { skipSaveRef.current = false; }, 50);
    });

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessionId]);

  // Auto-save on config change
  useEffect(() => {
    if (skipSaveRef.current) return;
    if (!currentSessionRef.current) return;
    scheduleLayoutSave(currentSessionRef.current, layoutConfig);
  }, [layoutConfig, scheduleLayoutSave]);

  const handleApplyPreset = useCallback((presetId: LayoutPresetId) => {
    setLayoutConfig(prev => applyPreset(prev, presetId));
  }, []);

  const handleMovePanel = useCallback((panelId: PanelId, targetCellId: string) => {
    setLayoutConfig(prev => movePanelToCell(prev, panelId, targetCellId));
  }, []);

  const handleClosePanel = useCallback((panelId: PanelId) => {
    setLayoutConfig(prev => closePanel(prev, panelId));
  }, []);

  const handleOpenPanel = useCallback((panelId: PanelId) => {
    setLayoutConfig(prev => openPanel(prev, panelId));
  }, []);

  const handleSwapPanels = useCallback((panelA: PanelId, panelB: PanelId) => {
    setLayoutConfig(prev => swapPanels(prev, panelA, panelB));
  }, []);

  const handleUpdateSizes = useCallback((newSizes: number[]) => {
    setLayoutConfig(prev => updateSizes(prev, newSizes));
  }, []);

  // suppress unused variable warning
  void saveGenerationRef;

  return {
    layoutConfig,
    isLoading,
    applyPreset: handleApplyPreset,
    movePanel: handleMovePanel,
    closePanel: handleClosePanel,
    openPanel: handleOpenPanel,
    swapPanels: handleSwapPanels,
    updateSizes: handleUpdateSizes,
  };
}
