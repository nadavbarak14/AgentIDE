import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsHelp } from '../../../src/components/ShortcutsHelp';
import { DEFAULT_SHORTCUT_MAP } from '../../../src/hooks/useKeyboardShortcuts';

describe('ShortcutsHelp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('c3-keybindings');
  });

  // ---------------------------------------------------------------
  // Renders when open=true, does not render when open=false
  // ---------------------------------------------------------------
  describe('open / closed state', () => {
    it('renders the overlay when open is true', () => {
      render(<ShortcutsHelp open={true} onClose={vi.fn()} />);

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('does not render anything when open is false', () => {
      const { container } = render(
        <ShortcutsHelp open={false} onClose={vi.fn()} />,
      );

      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
      expect(container.innerHTML).toBe('');
    });
  });

  // ---------------------------------------------------------------
  // All shortcuts from DEFAULT_SHORTCUT_MAP are displayed
  // ---------------------------------------------------------------
  describe('shortcut list completeness', () => {
    it('displays shortcut descriptions from DEFAULT_SHORTCUT_MAP', () => {
      render(<ShortcutsHelp open={true} onClose={vi.fn()} />);

      // Deduplicate descriptions (arrow keys share descriptions)
      const uniqueDescriptions = new Set(DEFAULT_SHORTCUT_MAP.map((s) => s.description));
      for (const desc of uniqueDescriptions) {
        expect(screen.getAllByText(desc).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('shows "Ctrl+." prefix for each shortcut', () => {
      render(<ShortcutsHelp open={true} onClose={vi.fn()} />);

      const ctrlDotLabels = screen.getAllByText('Ctrl+.');
      expect(ctrlDotLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('displays all category headings', () => {
      render(<ShortcutsHelp open={true} onClose={vi.fn()} />);

      const categories = new Set(DEFAULT_SHORTCUT_MAP.map((s) => s.category));
      for (const category of categories) {
        expect(screen.getByText(category)).toBeInTheDocument();
      }
    });
  });

  // ---------------------------------------------------------------
  // Escape closes the overlay
  // ---------------------------------------------------------------
  describe('Escape key closes overlay', () => {
    it('calls onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      render(<ShortcutsHelp open={true} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose for non-Escape keys', () => {
      const onClose = vi.fn();
      render(<ShortcutsHelp open={true} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Enter' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Clicking backdrop closes the overlay
  // ---------------------------------------------------------------
  describe('backdrop click closes overlay', () => {
    it('calls onClose when backdrop (outer div) is clicked', () => {
      const onClose = vi.fn();
      render(<ShortcutsHelp open={true} onClose={onClose} />);

      // The backdrop is the outermost fixed div
      const backdrop = screen.getByText('Keyboard Shortcuts').closest('.fixed');
      expect(backdrop).toBeTruthy();

      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when inner content panel is clicked', () => {
      const onClose = vi.fn();
      render(<ShortcutsHelp open={true} onClose={onClose} />);

      // Click the inner modal panel (has stopPropagation)
      const heading = screen.getByText('Keyboard Shortcuts');
      const panel = heading.closest('.bg-gray-800');
      expect(panel).toBeTruthy();

      fireEvent.click(panel!);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Close button
  // ---------------------------------------------------------------
  describe('close button', () => {
    it('renders a close button that calls onClose', () => {
      const onClose = vi.fn();
      render(<ShortcutsHelp open={true} onClose={onClose} />);

      // The close button contains the times character
      const closeButton = screen.getByText('\u00D7');
      expect(closeButton.tagName).toBe('BUTTON');

      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
