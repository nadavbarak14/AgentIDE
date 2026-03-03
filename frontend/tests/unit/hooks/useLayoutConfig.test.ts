import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the API service
vi.mock('../../../src/services/api', () => ({
  panelState: {
    get: vi.fn().mockResolvedValue({
      leftPanel: 'files',
      rightPanel: 'git',
      terminalVisible: true,
      layoutConfig: null,
    }),
    saveLayoutConfig: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import { useLayoutConfig } from '../../../src/hooks/useLayoutConfig';
import { panelState as mockApi } from '../../../src/services/api';

describe('useLayoutConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with default layout config', () => {
    const { result } = renderHook(() => useLayoutConfig(null));
    expect(result.current.layoutConfig.presetId).toBe('equal-3col');
    expect(result.current.layoutConfig.cells).toHaveLength(3);
  });

  it('migrates legacy state when layoutConfig is null', async () => {
    vi.mocked(mockApi.get).mockResolvedValue({
      leftPanel: 'files',
      rightPanel: 'git',
      terminalVisible: true,
      layoutConfig: null,
    } as never);

    const { result } = renderHook(() => useLayoutConfig('session-1'));

    // Wait for async load
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.layoutConfig.presetId).toBe('equal-3col');
    // files should be in first cell
    const filesCell = result.current.layoutConfig.cells.find(c => c.activePanelId === 'files');
    expect(filesCell).toBeTruthy();
  });

  it('loads saved layoutConfig from API', async () => {
    const savedConfig = {
      presetId: '2left-1right' as const,
      cells: [
        { cellId: 'cell-0', activePanelId: 'git' as const, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'files' as const, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: 'preview' as const, stackedPanelIds: [] },
      ],
      sizes: [40, 60],
    };

    vi.mocked(mockApi.get).mockResolvedValue({ layoutConfig: savedConfig } as never);

    const { result } = renderHook(() => useLayoutConfig('session-2'));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    expect(result.current.layoutConfig.presetId).toBe('2left-1right');
  });

  it('applyPreset redistributes panels', async () => {
    vi.mocked(mockApi.get).mockResolvedValue({
      leftPanel: 'files', rightPanel: 'git', terminalVisible: true, layoutConfig: null,
    } as never);

    const { result } = renderHook(() => useLayoutConfig('session-3'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.applyPreset('1left-2right'); });

    expect(result.current.layoutConfig.presetId).toBe('1left-2right');
    expect(result.current.layoutConfig.cells).toHaveLength(3);
  });

  it('movePanel changes cell assignment', async () => {
    const savedConfig = {
      presetId: 'equal-3col' as const,
      cells: [
        { cellId: 'cell-0', activePanelId: 'files' as const, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell' as const, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    vi.mocked(mockApi.get).mockResolvedValue({ layoutConfig: savedConfig } as never);

    const { result } = renderHook(() => useLayoutConfig('session-4'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.movePanel('files', 'cell-2'); });

    expect(result.current.layoutConfig.cells[0].activePanelId).toBeNull();
    expect(result.current.layoutConfig.cells[2].activePanelId).toBe('files');
  });

  it('closePanel removes panel from cell', async () => {
    const savedConfig = {
      presetId: 'equal-3col' as const,
      cells: [
        { cellId: 'cell-0', activePanelId: 'files' as const, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell' as const, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: 'git' as const, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    vi.mocked(mockApi.get).mockResolvedValue({ layoutConfig: savedConfig } as never);

    const { result } = renderHook(() => useLayoutConfig('session-5'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.closePanel('git'); });

    expect(result.current.layoutConfig.cells[2].activePanelId).toBeNull();
  });

  it('closePanel is blocked when only one visible panel remains', async () => {
    const savedConfig = {
      presetId: 'equal-3col' as const,
      cells: [
        { cellId: 'cell-0', activePanelId: 'shell' as const, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: null, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    vi.mocked(mockApi.get).mockResolvedValue({ layoutConfig: savedConfig } as never);

    const { result } = renderHook(() => useLayoutConfig('session-6'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.closePanel('shell'); });

    // Should remain unchanged - last panel protected
    expect(result.current.layoutConfig.cells[0].activePanelId).toBe('shell');
  });

  it('openPanel places panel in first empty cell', async () => {
    const savedConfig = {
      presetId: 'equal-3col' as const,
      cells: [
        { cellId: 'cell-0', activePanelId: 'shell' as const, stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: null, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    vi.mocked(mockApi.get).mockResolvedValue({ layoutConfig: savedConfig } as never);

    const { result } = renderHook(() => useLayoutConfig('session-7'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.openPanel('git'); });

    expect(result.current.layoutConfig.cells[1].activePanelId).toBe('git');
  });

  it('updateSizes updates size array', async () => {
    vi.mocked(mockApi.get).mockResolvedValue({
      leftPanel: 'none', rightPanel: 'none', terminalVisible: true, layoutConfig: null,
    } as never);

    const { result } = renderHook(() => useLayoutConfig('session-8'));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    act(() => { result.current.updateSizes([40, 30, 30]); });

    expect(result.current.layoutConfig.sizes).toEqual([40, 30, 30]);
  });
});
