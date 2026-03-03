/**
 * Pure utility functions for panel layout calculations.
 * Extracted from SessionCard.tsx to enable unit testing and prevent
 * the resize calculation bugs identified in research.md.
 */

export const HANDLE_WIDTH_PX = 4; // w-1 = 0.25rem = 4px
export const MIN_PANEL_PX = 200;
export const MIN_TERMINAL_PX = 300;
export const MIN_TOP_PX = 200;
export const MIN_BOTTOM_PX = 150;

export interface PanelWidthsInput {
  containerWidth: number;
  leftPercent: number;
  rightPercent: number;
  showLeft: boolean;
  showRight: boolean;
  terminalInTopZone: boolean;
  handleWidth?: number;
  minPanelPx?: number;
  minTerminalPx?: number;
}

export interface PanelWidthsResult {
  leftWidth: number;   // percentage (0-100)
  rightWidth: number;  // percentage (0-100)
  terminalWidth: number; // percentage (0-100)
}

/**
 * Calculate effective panel widths, accounting for handle widths,
 * minimum sizes, and clamping to prevent negative terminal width.
 */
export function calculatePanelWidths(input: PanelWidthsInput): PanelWidthsResult {
  const {
    containerWidth,
    leftPercent,
    rightPercent,
    showLeft,
    showRight,
    terminalInTopZone,
    handleWidth = HANDLE_WIDTH_PX,
    minPanelPx = MIN_PANEL_PX,
    minTerminalPx = MIN_TERMINAL_PX,
  } = input;

  if (containerWidth <= 0) {
    return { leftWidth: 0, rightWidth: 0, terminalWidth: 100 };
  }

  // Count active handles
  const handleCount =
    (showLeft && terminalInTopZone ? 1 : 0) +
    (showRight && terminalInTopZone ? 1 : 0) +
    (showLeft && showRight && !terminalInTopZone ? 1 : 0);

  // Subtract handle widths from available space
  const totalHandleWidth = handleCount * handleWidth;
  const availablePx = containerWidth - totalHandleWidth;
  const handlePercent = (totalHandleWidth / containerWidth) * 100;

  const minPanelPercent = (minPanelPx / containerWidth) * 100;
  const minTerminalPercent = terminalInTopZone ? (minTerminalPx / containerWidth) * 100 : 0;

  if (!showLeft && !showRight) {
    // No panels — terminal gets everything
    return { leftWidth: 0, rightWidth: 0, terminalWidth: 100 };
  }

  if (terminalInTopZone) {
    // Three-zone mode: left | terminal | right
    let left = showLeft ? Math.max(leftPercent, minPanelPercent) : 0;
    let right = showRight ? Math.max(rightPercent, minPanelPercent) : 0;

    // Ensure terminal has at least minimum width
    const maxPanelSpace = 100 - handlePercent - minTerminalPercent;
    const totalPanels = left + right;
    if (totalPanels > maxPanelSpace && totalPanels > 0) {
      // Scale down proportionally
      const scale = maxPanelSpace / totalPanels;
      left = showLeft ? Math.max(left * scale, minPanelPercent) : 0;
      right = showRight ? Math.max(right * scale, minPanelPercent) : 0;
      // Re-check after enforcing minimums
      if (left + right > maxPanelSpace) {
        // Last resort: give each panel its minimum
        if (showLeft && showRight) {
          left = minPanelPercent;
          right = Math.max(maxPanelSpace - minPanelPercent, minPanelPercent);
        }
      }
    }

    const terminal = Math.max(100 - handlePercent - left - right, minTerminalPercent);
    return { leftWidth: left, rightWidth: right, terminalWidth: terminal };
  } else {
    // Two-zone mode: panels only (terminal is in bottom zone)
    if (showLeft && !showRight) {
      return { leftWidth: 100, rightWidth: 0, terminalWidth: 0 };
    }
    if (!showLeft && showRight) {
      return { leftWidth: 0, rightWidth: 100, terminalWidth: 0 };
    }
    // Both panels open — distribute proportionally
    const total = leftPercent + rightPercent;
    const available = 100 - handlePercent;
    if (total <= 0) {
      return { leftWidth: available / 2, rightWidth: available / 2, terminalWidth: 0 };
    }
    let left = (leftPercent / total) * available;
    let right = (rightPercent / total) * available;
    // Enforce minimums
    if (left < minPanelPercent && availablePx >= minPanelPx * 2) {
      left = minPanelPercent;
      right = available - left;
    }
    if (right < minPanelPercent && availablePx >= minPanelPx * 2) {
      right = minPanelPercent;
      left = available - right;
    }
    return { leftWidth: left, rightWidth: right, terminalWidth: 0 };
  }
}

export interface VerticalSplitInput {
  containerHeight: number;
  bottomPercent: number;
  minTopPx?: number;
  minBottomPx?: number;
}

export interface VerticalSplitResult {
  topPercent: number;
  bottomPercent: number;
}

/**
 * Calculate vertical split between top and bottom zones,
 * enforcing minimum heights.
 */
export function calculateVerticalSplit(input: VerticalSplitInput): VerticalSplitResult {
  const {
    containerHeight,
    bottomPercent,
    minTopPx = MIN_TOP_PX,
    minBottomPx = MIN_BOTTOM_PX,
  } = input;

  if (containerHeight <= 0) {
    return { topPercent: 60, bottomPercent: 40 };
  }

  const minTopPercent = (minTopPx / containerHeight) * 100;
  const minBottomPercent = (minBottomPx / containerHeight) * 100;

  const clampedBottom = Math.max(minBottomPercent, Math.min(100 - minTopPercent, bottomPercent));
  const clampedTop = 100 - clampedBottom;

  return { topPercent: clampedTop, bottomPercent: clampedBottom };
}

/**
 * Check if a panel can be opened without violating minimum size constraints.
 */
export function canOpenPanel(
  containerWidth: number,
  side: 'left' | 'right',
  otherPanelOpen: boolean,
  terminalInTopZone: boolean,
  minPanelPx = MIN_PANEL_PX,
  minTerminalPx = MIN_TERMINAL_PX,
  handleWidth = HANDLE_WIDTH_PX,
): boolean {
  if (containerWidth <= 0) return false;

  const handles = (otherPanelOpen ? 1 : 0) + (terminalInTopZone ? 1 : 0);
  const handleSpace = handles * handleWidth;
  const neededWidth = minPanelPx + (terminalInTopZone ? minTerminalPx : 0) + (otherPanelOpen ? minPanelPx : 0) + handleSpace;
  return containerWidth >= neededWidth;
}

/**
 * Clamp a resize drag value to ensure it stays within valid bounds.
 */
export function clampResizePercent(
  dragPercent: number,
  side: 'left' | 'right',
  containerWidth: number,
  otherPanelPercent: number,
  otherPanelOpen: boolean,
  terminalInTopZone: boolean,
  minPanelPx = MIN_PANEL_PX,
  minTerminalPx = MIN_TERMINAL_PX,
  handleWidth = HANDLE_WIDTH_PX,
): number {
  if (containerWidth <= 0) return dragPercent;

  const minPercent = (minPanelPx / containerWidth) * 100;
  const handles = (terminalInTopZone ? 2 : 0) + (!terminalInTopZone && otherPanelOpen ? 1 : 0);
  const handlePercent = (handles * handleWidth / containerWidth) * 100;

  let maxPercent: number;
  if (terminalInTopZone) {
    const minTermPercent = (minTerminalPx / containerWidth) * 100;
    maxPercent = 100 - handlePercent - minTermPercent - (otherPanelOpen ? otherPanelPercent : 0);
  } else {
    maxPercent = otherPanelOpen ? 100 - handlePercent - minPercent : 100;
  }

  return Math.max(minPercent, Math.min(maxPercent, dragPercent));
}
