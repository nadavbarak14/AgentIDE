import { describe, it, expect } from 'vitest';
import {
  calculatePanelWidths,
  calculateVerticalSplit,
  canOpenPanel,
  clampResizePercent,
  MIN_PANEL_PX,
  MIN_TERMINAL_PX,
  HANDLE_WIDTH_PX,
} from '../../src/utils/panelLayout';

describe('calculatePanelWidths', () => {
  const baseInput = {
    containerWidth: 1920,
    leftPercent: 25,
    rightPercent: 35,
    showLeft: false,
    showRight: false,
    terminalInTopZone: true,
  };

  it('returns 100% terminal when no panels are shown', () => {
    const result = calculatePanelWidths(baseInput);
    expect(result.leftWidth).toBe(0);
    expect(result.rightWidth).toBe(0);
    expect(result.terminalWidth).toBe(100);
  });

  it('handles left-only panel in terminal-top-zone mode', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      showLeft: true,
    });
    expect(result.leftWidth).toBeGreaterThanOrEqual((MIN_PANEL_PX / 1920) * 100);
    expect(result.rightWidth).toBe(0);
    expect(result.terminalWidth).toBeGreaterThan(0);
    // Total should not exceed 100%
    expect(result.leftWidth + result.terminalWidth).toBeLessThanOrEqual(100.1);
  });

  it('handles both panels in terminal-top-zone mode', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      showLeft: true,
      showRight: true,
    });
    expect(result.leftWidth).toBeGreaterThanOrEqual((MIN_PANEL_PX / 1920) * 100);
    expect(result.rightWidth).toBeGreaterThanOrEqual((MIN_PANEL_PX / 1920) * 100);
    expect(result.terminalWidth).toBeGreaterThanOrEqual((MIN_TERMINAL_PX / 1920) * 100);
    // Total should not exceed 100%
    expect(result.leftWidth + result.rightWidth + result.terminalWidth).toBeLessThanOrEqual(100.1);
  });

  it('subtracts handle widths correctly', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      showLeft: true,
      showRight: true,
    });
    // With 2 handles (left-terminal and terminal-right) at 4px each = 8px
    // Handle percent = 8/1920 * 100 ≈ 0.42%
    const handlePercent = (2 * HANDLE_WIDTH_PX / 1920) * 100;
    const total = result.leftWidth + result.rightWidth + result.terminalWidth;
    expect(total).toBeLessThanOrEqual(100 - handlePercent + 0.1);
  });

  it('prevents negative terminal width', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      showLeft: true,
      showRight: true,
      leftPercent: 60,
      rightPercent: 50, // total 110% — would make terminal negative
    });
    expect(result.terminalWidth).toBeGreaterThanOrEqual((MIN_TERMINAL_PX / 1920) * 100 - 0.1);
  });

  it('handles narrow container (< 1024px) gracefully', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      containerWidth: 800,
      showLeft: true,
      showRight: true,
    });
    // Should still produce valid layout
    expect(result.leftWidth).toBeGreaterThanOrEqual(0);
    expect(result.rightWidth).toBeGreaterThanOrEqual(0);
    expect(result.terminalWidth).toBeGreaterThanOrEqual(0);
  });

  it('handles zero container width', () => {
    const result = calculatePanelWidths({
      ...baseInput,
      containerWidth: 0,
    });
    expect(result.terminalWidth).toBe(100);
  });

  describe('two-zone mode (terminal in bottom)', () => {
    it('gives 100% to single left panel', () => {
      const result = calculatePanelWidths({
        ...baseInput,
        showLeft: true,
        terminalInTopZone: false,
      });
      expect(result.leftWidth).toBe(100);
      expect(result.rightWidth).toBe(0);
      expect(result.terminalWidth).toBe(0);
    });

    it('gives 100% to single right panel', () => {
      const result = calculatePanelWidths({
        ...baseInput,
        showRight: true,
        terminalInTopZone: false,
      });
      expect(result.leftWidth).toBe(0);
      expect(result.rightWidth).toBe(100);
      expect(result.terminalWidth).toBe(0);
    });

    it('distributes proportionally with both panels', () => {
      const result = calculatePanelWidths({
        ...baseInput,
        showLeft: true,
        showRight: true,
        leftPercent: 25,
        rightPercent: 75,
        terminalInTopZone: false,
      });
      // Should be roughly 25:75 ratio minus handle space
      expect(result.leftWidth).toBeGreaterThan(0);
      expect(result.rightWidth).toBeGreaterThan(result.leftWidth);
      expect(result.terminalWidth).toBe(0);
    });
  });
});

describe('calculateVerticalSplit', () => {
  it('clamps bottom to minimum height', () => {
    const result = calculateVerticalSplit({
      containerHeight: 800,
      bottomPercent: 5, // Too small
    });
    const minBottomPercent = (150 / 800) * 100;
    expect(result.bottomPercent).toBeGreaterThanOrEqual(minBottomPercent - 0.1);
  });

  it('clamps top to minimum height', () => {
    const result = calculateVerticalSplit({
      containerHeight: 800,
      bottomPercent: 95, // Would make top too small
    });
    const minTopPercent = (200 / 800) * 100;
    expect(result.topPercent).toBeGreaterThanOrEqual(minTopPercent - 0.1);
  });

  it('preserves valid split', () => {
    const result = calculateVerticalSplit({
      containerHeight: 800,
      bottomPercent: 40,
    });
    expect(result.bottomPercent).toBe(40);
    expect(result.topPercent).toBe(60);
  });

  it('handles zero container height', () => {
    const result = calculateVerticalSplit({
      containerHeight: 0,
      bottomPercent: 40,
    });
    expect(result.topPercent).toBe(60);
    expect(result.bottomPercent).toBe(40);
  });

  it('top + bottom always equals 100', () => {
    const result = calculateVerticalSplit({
      containerHeight: 600,
      bottomPercent: 55,
    });
    expect(result.topPercent + result.bottomPercent).toBeCloseTo(100);
  });
});

describe('canOpenPanel', () => {
  it('allows panel on wide screen', () => {
    expect(canOpenPanel(1920, 'left', false, true)).toBe(true);
  });

  it('rejects panel on narrow screen when space is insufficient', () => {
    // Need: 200 (panel) + 300 (terminal) + 4 (handle) = 504
    expect(canOpenPanel(400, 'left', false, true)).toBe(false);
  });

  it('accounts for other panel being open', () => {
    // Need: 200 (new) + 200 (existing) + 300 (terminal) + 8 (2 handles) = 708
    expect(canOpenPanel(600, 'left', true, true)).toBe(false);
    expect(canOpenPanel(800, 'left', true, true)).toBe(true);
  });

  it('allows panel when terminal is not in top zone', () => {
    // Need: 200 (panel) only (terminal is in bottom zone)
    expect(canOpenPanel(250, 'left', false, false)).toBe(true);
  });
});

describe('clampResizePercent', () => {
  it('enforces minimum panel width', () => {
    const result = clampResizePercent(
      5, // Too narrow
      'left',
      1920,
      35,
      true,
      true,
    );
    expect(result).toBeGreaterThanOrEqual((MIN_PANEL_PX / 1920) * 100 - 0.1);
  });

  it('prevents panel from exceeding max (terminal minimum preserved)', () => {
    const result = clampResizePercent(
      90, // Too wide — would squeeze terminal
      'left',
      1920,
      35,
      true,
      true,
    );
    // Terminal needs at least MIN_TERMINAL_PX = 300 → 300/1920 ≈ 15.6%
    // Plus right panel at 35% and handles
    expect(result).toBeLessThan(90);
  });
});
