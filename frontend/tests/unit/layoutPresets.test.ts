import { describe, it, expect } from 'vitest';
import { LAYOUT_PRESETS, PRESET_IDS, applyPreset, closePanel, openPanel, movePanelToCell } from '../../src/constants/layoutPresets';
import type { LayoutConfig } from '../../src/types/layout';

describe('LAYOUT_PRESETS constants', () => {
  it('contains all 6 required preset IDs', () => {
    const required = ['equal-3col', '2left-1right', '1left-2right', '2top-1bottom', '1top-2bottom', 'focus'];
    for (const id of required) {
      expect(LAYOUT_PRESETS).toHaveProperty(id);
    }
    expect(PRESET_IDS).toHaveLength(6);
  });

  it('each preset defaultSizes sums to 100', () => {
    for (const preset of Object.values(LAYOUT_PRESETS)) {
      const sum = preset.structure.defaultSizes.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
    }
  });

  it('each preset slotCount matches leaf cell count', () => {
    function countLeaves(structure: import('../../src/types/layout').PresetStructure | 'cell'): number {
      if (structure === 'cell') return 1;
      return structure.children.reduce((sum, child) => sum + countLeaves(child), 0);
    }

    for (const preset of Object.values(LAYOUT_PRESETS)) {
      const leafCount = countLeaves(preset.structure);
      expect(leafCount).toBe(preset.slotCount);
    }
  });

  it('focus preset has exactly 1 slot', () => {
    expect(LAYOUT_PRESETS['focus'].slotCount).toBe(1);
  });
});

describe('applyPreset', () => {
  const base3Col: LayoutConfig = {
    presetId: 'equal-3col',
    cells: [
      { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
      { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
      { cellId: 'cell-2', activePanelId: 'git', stackedPanelIds: [] },
    ],
    sizes: [33, 34, 33],
  };

  it('switches preset ID', () => {
    const result = applyPreset(base3Col, '2left-1right');
    expect(result.presetId).toBe('2left-1right');
  });

  it('preserves all panels when slot count stays the same', () => {
    const result = applyPreset(base3Col, '1left-2right');
    const allPanels = result.cells.flatMap(c => [c.activePanelId, ...c.stackedPanelIds]).filter(Boolean);
    expect(allPanels).toContain('files');
    expect(allPanels).toContain('shell');
    expect(allPanels).toContain('git');
  });

  it('stacks overflow panels when switching to fewer slots', () => {
    const result = applyPreset(base3Col, 'focus');
    expect(result.cells).toHaveLength(1);
    const allPanels = result.cells.flatMap(c => [c.activePanelId, ...c.stackedPanelIds]).filter(Boolean);
    expect(allPanels).toHaveLength(3);
  });

  it('uses preset defaultSizes', () => {
    const result = applyPreset(base3Col, '2left-1right');
    expect(result.sizes).toEqual(LAYOUT_PRESETS['2left-1right'].structure.defaultSizes);
  });
});

describe('closePanel', () => {
  const config3: LayoutConfig = {
    presetId: 'equal-3col',
    cells: [
      { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
      { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
      { cellId: 'cell-2', activePanelId: 'git', stackedPanelIds: [] },
    ],
    sizes: [33, 34, 33],
  };

  it('removes panel from its cell', () => {
    const result = closePanel(config3, 'git');
    expect(result.cells[2].activePanelId).toBeNull();
  });

  it('blocks closing the last visible panel', () => {
    const singlePanel: LayoutConfig = {
      presetId: 'focus',
      cells: [{ cellId: 'cell-0', activePanelId: 'shell', stackedPanelIds: [] }],
      sizes: [100],
    };
    const result = closePanel(singlePanel, 'shell');
    expect(result.cells[0].activePanelId).toBe('shell');
  });

  it('promotes stacked panel when closing active', () => {
    const withStack: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: ['git'] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = closePanel(withStack, 'files');
    expect(result.cells[0].activePanelId).toBe('git');
    expect(result.cells[0].stackedPanelIds).toHaveLength(0);
  });
});

describe('openPanel', () => {
  it('places in first empty cell', () => {
    const config: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: null, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = openPanel(config, 'git');
    expect(result.cells[1].activePanelId).toBe('git');
  });

  it('stacks in last cell when no empty cells', () => {
    const config: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: 'preview', stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = openPanel(config, 'git');
    expect(result.cells[2].stackedPanelIds).toContain('git');
  });

  it('is no-op if panel already open', () => {
    const config: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = openPanel(config, 'files');
    expect(result).toEqual(config);
  });
});

describe('movePanelToCell', () => {
  it('moves panel to empty cell', () => {
    const config: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = movePanelToCell(config, 'files', 'cell-2');
    expect(result.cells[0].activePanelId).toBeNull();
    expect(result.cells[2].activePanelId).toBe('files');
  });
});
