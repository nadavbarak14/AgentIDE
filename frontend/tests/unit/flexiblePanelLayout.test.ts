import { describe, it, expect } from 'vitest';
import { applyPreset, closePanel, openPanel, movePanelToCell, swapPanels } from '../../src/constants/layoutPresets';
import type { LayoutConfig } from '../../src/types/layout';

const baseConfig: LayoutConfig = {
  presetId: 'equal-3col',
  cells: [
    { cellId: 'cell-0', activePanelId: 'files', stackedPanelIds: [] },
    { cellId: 'cell-1', activePanelId: 'shell', stackedPanelIds: [] },
    { cellId: 'cell-2', activePanelId: 'git', stackedPanelIds: [] },
  ],
  sizes: [33, 34, 33],
};

describe('FlexiblePanelLayout integration', () => {
  it('drag panel to new position (US1)', () => {
    const result = movePanelToCell(baseConfig, 'files', 'cell-2');
    // files moved from cell-0 to cell-2, git now at cell-0 via swap logic
    expect(result.cells[0].activePanelId).toBeNull();
    expect(result.cells[2].activePanelId).toBe('files');
  });

  it('swap panels between cells (US1)', () => {
    const result = swapPanels(baseConfig, 'files', 'git');
    expect(result.cells[0].activePanelId).toBe('git');
    expect(result.cells[2].activePanelId).toBe('files');
  });

  it('switch layout preset (US3)', () => {
    const result = applyPreset(baseConfig, '2left-1right');
    expect(result.presetId).toBe('2left-1right');
    expect(result.cells).toHaveLength(3);
    // All panels preserved
    const allPanels = result.cells.flatMap(c => [c.activePanelId, ...c.stackedPanelIds]).filter(Boolean);
    expect(allPanels).toContain('files');
    expect(allPanels).toContain('shell');
    expect(allPanels).toContain('git');
  });

  it('close panel and prevent closing last panel (US4)', () => {
    const onePanel: LayoutConfig = {
      presetId: 'focus',
      cells: [{ cellId: 'cell-0', activePanelId: 'shell', stackedPanelIds: [] }],
      sizes: [100],
    };
    const result = closePanel(onePanel, 'shell');
    expect(result.cells[0].activePanelId).toBe('shell'); // protected
  });

  it('open panel in empty cell (US4)', () => {
    const withEmpty: LayoutConfig = {
      presetId: 'equal-3col',
      cells: [
        { cellId: 'cell-0', activePanelId: 'shell', stackedPanelIds: [] },
        { cellId: 'cell-1', activePanelId: null, stackedPanelIds: [] },
        { cellId: 'cell-2', activePanelId: null, stackedPanelIds: [] },
      ],
      sizes: [33, 34, 33],
    };
    const result = openPanel(withEmpty, 'git');
    expect(result.cells[1].activePanelId).toBe('git');
  });

  it('preset switch persists all panels including overflow (US3)', () => {
    const result = applyPreset(baseConfig, 'focus');
    expect(result.cells).toHaveLength(1);
    // cell-0 has one active + two stacked
    const cell = result.cells[0];
    expect(cell.activePanelId).toBeTruthy();
    expect(cell.stackedPanelIds).toHaveLength(2);
  });
});
