import { describe, it, expect } from 'vitest';
import { buildDefaultLayoutConfig } from '../../src/constants/layoutPresets';

describe('buildDefaultLayoutConfig (legacy migration)', () => {
  it('maps files to cell-0 when leftPanel=files', () => {
    const config = buildDefaultLayoutConfig('files', 'none', true);
    expect(config.cells[0].activePanelId).toBe('files');
    expect(config.cells[1].activePanelId).toBe('shell');
    expect(config.presetId).toBe('equal-3col');
  });

  it('maps git to cell-2 when rightPanel=git', () => {
    const config = buildDefaultLayoutConfig('files', 'git', true);
    expect(config.cells[2].activePanelId).toBe('git');
  });

  it('excludes shell when terminalVisible=false', () => {
    const config = buildDefaultLayoutConfig('files', 'none', false);
    const shellCell = config.cells.find(c => c.activePanelId === 'shell');
    expect(shellCell).toBeUndefined();
  });

  it('handles none/none state gracefully', () => {
    const config = buildDefaultLayoutConfig('none', 'none', true);
    expect(config.presetId).toBe('equal-3col');
    expect(config.cells).toHaveLength(3);
  });
});
