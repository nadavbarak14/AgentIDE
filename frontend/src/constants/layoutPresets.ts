import type { LayoutPreset, LayoutPresetId, LayoutConfig, PanelId } from '../types/layout';

export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPreset> = {
  'equal-3col': {
    id: 'equal-3col',
    label: 'Equal 3 Columns',
    description: 'Three equal panels side by side',
    slotCount: 3,
    structure: {
      orientation: 'horizontal',
      children: ['cell', 'cell', 'cell'],
      defaultSizes: [33, 34, 33],
    },
  },
  '2left-1right': {
    id: '2left-1right',
    label: '2 Left + 1 Right',
    description: 'Two stacked panels on left, one wide on right',
    slotCount: 3,
    structure: {
      orientation: 'horizontal',
      children: [
        { orientation: 'vertical', children: ['cell', 'cell'], defaultSizes: [50, 50] },
        'cell',
      ],
      defaultSizes: [40, 60],
    },
  },
  '1left-2right': {
    id: '1left-2right',
    label: '1 Left + 2 Right',
    description: 'One wide panel on left, two stacked on right',
    slotCount: 3,
    structure: {
      orientation: 'horizontal',
      children: [
        'cell',
        { orientation: 'vertical', children: ['cell', 'cell'], defaultSizes: [50, 50] },
      ],
      defaultSizes: [60, 40],
    },
  },
  '2top-1bottom': {
    id: '2top-1bottom',
    label: '2 Top + 1 Bottom',
    description: 'Two side-by-side panels on top, one full-width below',
    slotCount: 3,
    structure: {
      orientation: 'vertical',
      children: [
        { orientation: 'horizontal', children: ['cell', 'cell'], defaultSizes: [50, 50] },
        'cell',
      ],
      defaultSizes: [60, 40],
    },
  },
  '1top-2bottom': {
    id: '1top-2bottom',
    label: '1 Top + 2 Bottom',
    description: 'One full-width panel on top, two side-by-side below',
    slotCount: 3,
    structure: {
      orientation: 'vertical',
      children: [
        'cell',
        { orientation: 'horizontal', children: ['cell', 'cell'], defaultSizes: [50, 50] },
      ],
      defaultSizes: [40, 60],
    },
  },
  'focus': {
    id: 'focus',
    label: 'Focus',
    description: 'Single full-width panel',
    slotCount: 1,
    structure: {
      orientation: 'horizontal',
      children: ['cell'],
      defaultSizes: [100],
    },
  },
};

export const PRESET_IDS: LayoutPresetId[] = [
  'equal-3col',
  '2left-1right',
  '1left-2right',
  '2top-1bottom',
  '1top-2bottom',
  'focus',
];

/** Build a default LayoutConfig from existing legacy panel state */
export function buildDefaultLayoutConfig(
  leftPanel: string,
  rightPanel: string,
  terminalVisible: boolean,
): LayoutConfig {
  const panels: Array<PanelId | null> = [];

  if (leftPanel && leftPanel !== 'none') panels.push(leftPanel as PanelId);
  // Terminal (shell) always goes in the middle
  if (terminalVisible) panels.push('shell');
  if (rightPanel && rightPanel !== 'none') panels.push(rightPanel as PanelId);

  // Pad to 3 cells
  while (panels.length < 3) panels.push(null);
  const cells = panels.slice(0, 3).map((p, i) => ({
    cellId: `cell-${i}`,
    activePanelId: p,
    stackedPanelIds: [],
  }));

  return {
    presetId: 'equal-3col',
    cells,
    sizes: [33, 34, 33],
  };
}

/** Apply a new preset to an existing layout, redistributing panels */
export function applyPreset(
  current: LayoutConfig,
  newPresetId: LayoutPresetId,
): LayoutConfig {
  const preset = LAYOUT_PRESETS[newPresetId];

  // Collect all current panels in order (active first, then stacked)
  const allPanels: PanelId[] = [];
  for (const cell of current.cells) {
    if (cell.activePanelId) allPanels.push(cell.activePanelId);
    allPanels.push(...cell.stackedPanelIds);
  }

  // Build new cells
  const newCells = Array.from({ length: preset.slotCount }, (_, i) => ({
    cellId: `cell-${i}`,
    activePanelId: allPanels[i] ?? null,
    stackedPanelIds: [] as PanelId[],
  }));

  // Stack overflow panels in last cell
  const overflowPanels = allPanels.slice(preset.slotCount);
  if (overflowPanels.length > 0 && newCells.length > 0) {
    newCells[newCells.length - 1].stackedPanelIds = overflowPanels;
  }

  // Build sizes: top-level structure defaultSizes
  const sizes = [...preset.structure.defaultSizes];

  return {
    presetId: newPresetId,
    cells: newCells,
    sizes,
  };
}

/** Move a panel from its current cell to a target cell */
export function movePanelToCell(
  config: LayoutConfig,
  panelId: PanelId,
  targetCellId: string,
): LayoutConfig {
  const cells = config.cells.map(cell => ({ ...cell, stackedPanelIds: [...cell.stackedPanelIds] }));

  // Find source cell and remove panel
  for (const cell of cells) {
    if (cell.activePanelId === panelId) {
      cell.activePanelId = cell.stackedPanelIds.length > 0 ? cell.stackedPanelIds.shift()! : null;
      break;
    }
    const idx = cell.stackedPanelIds.indexOf(panelId);
    if (idx !== -1) {
      cell.stackedPanelIds.splice(idx, 1);
      break;
    }
  }

  // Place in target cell
  const targetCell = cells.find(c => c.cellId === targetCellId);
  if (targetCell) {
    if (targetCell.activePanelId !== null) {
      // Push existing active to stack
      targetCell.stackedPanelIds.unshift(targetCell.activePanelId);
    }
    targetCell.activePanelId = panelId;
  }

  return { ...config, cells };
}

/** Swap two panels between cells */
export function swapPanels(
  config: LayoutConfig,
  panelA: PanelId,
  panelB: PanelId,
): LayoutConfig {
  const cells = config.cells.map(cell => ({ ...cell, stackedPanelIds: [...cell.stackedPanelIds] }));

  for (const cell of cells) {
    if (cell.activePanelId === panelA) cell.activePanelId = panelB;
    else if (cell.activePanelId === panelB) cell.activePanelId = panelA;
  }

  return { ...config, cells };
}

/** Close a panel (remove from all cells) */
export function closePanel(
  config: LayoutConfig,
  panelId: PanelId,
): LayoutConfig {
  // Count visible panels (non-null activePanelId)
  const visibleCount = config.cells.filter(c => c.activePanelId !== null).length;

  // Never close the last visible panel
  if (visibleCount <= 1) {
    const lastVisible = config.cells.find(c => c.activePanelId !== null);
    if (lastVisible?.activePanelId === panelId) return config;
  }

  const cells = config.cells.map(cell => {
    const c = { ...cell, stackedPanelIds: [...cell.stackedPanelIds] };
    if (c.activePanelId === panelId) {
      c.activePanelId = c.stackedPanelIds.length > 0 ? c.stackedPanelIds.shift()! : null;
    }
    c.stackedPanelIds = c.stackedPanelIds.filter(p => p !== panelId);
    return c;
  });

  return { ...config, cells };
}

/** Open (or reopen) a panel - place in first empty cell or stack in cell-0 */
export function openPanel(
  config: LayoutConfig,
  panelId: PanelId,
): LayoutConfig {
  // Already open? No-op
  for (const cell of config.cells) {
    if (cell.activePanelId === panelId || cell.stackedPanelIds.includes(panelId)) {
      return config;
    }
  }

  const cells = config.cells.map(cell => ({ ...cell, stackedPanelIds: [...cell.stackedPanelIds] }));

  // Find first empty cell
  const emptyCell = cells.find(c => c.activePanelId === null);
  if (emptyCell) {
    emptyCell.activePanelId = panelId;
    return { ...config, cells };
  }

  // No empty cell: stack in last cell
  cells[cells.length - 1].stackedPanelIds.push(panelId);
  return { ...config, cells };
}

/** Update sizes for the layout */
export function updateSizes(
  config: LayoutConfig,
  newSizes: number[],
): LayoutConfig {
  return { ...config, sizes: newSizes };
}

/** Check if a panelId is currently visible (active in any cell) */
export function isPanelVisible(config: LayoutConfig, panelId: PanelId): boolean {
  return config.cells.some(c => c.activePanelId === panelId);
}

/** Count visible panels */
export function visiblePanelCount(config: LayoutConfig): number {
  return config.cells.filter(c => c.activePanelId !== null).length;
}
