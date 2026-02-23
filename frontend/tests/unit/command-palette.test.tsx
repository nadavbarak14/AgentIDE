import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette, BUTTON_ONLY_COMMANDS } from '../../src/components/CommandPalette';

describe('CommandPalette', () => {
  const mockOnClose = vi.fn();
  const mockOnAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any custom keybindings
    localStorage.removeItem('c3-keybindings');
  });

  it('renders when open is true', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<CommandPalette open={false} onClose={mockOnClose} onAction={mockOnAction} />);
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
  });

  it('search input is auto-focused on mount', async () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    // Wait for requestAnimationFrame
    await new Promise((r) => requestAnimationFrame(r));
    const input = screen.getByTestId('command-palette-input');
    expect(document.activeElement).toBe(input);
  });

  it('typing in search filters the command list (case-insensitive)', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'files' } });
    // Should match "Toggle Files" and "Search Files"
    expect(screen.getByTestId('command-item-toggle_files')).toBeInTheDocument();
    expect(screen.getByTestId('command-item-search_files')).toBeInTheDocument();
    // Should not match unrelated commands
    expect(screen.queryByTestId('command-item-toggle_git')).not.toBeInTheDocument();
  });

  it('filters by category', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'panels' } });
    // All panel commands should match
    expect(screen.getByTestId('command-item-toggle_files')).toBeInTheDocument();
    expect(screen.getByTestId('command-item-toggle_git')).toBeInTheDocument();
  });

  it('Up/Down arrow keys move selected index', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const palette = screen.getByTestId('command-palette');
    // First item should be selected by default (blue bg)
    const firstItem = screen.getByTestId('command-item-toggle_files');
    expect(firstItem.className).toContain('bg-blue-600');

    // Arrow down → second item selected
    fireEvent.keyDown(palette, { key: 'ArrowDown' });
    const secondItem = screen.getByTestId('command-item-toggle_git');
    expect(secondItem.className).toContain('bg-blue-600');
    expect(firstItem.className).not.toContain('bg-blue-600');
  });

  it('Enter executes the selected command and calls onClose', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const palette = screen.getByTestId('command-palette');
    // Press Enter on first item (toggle_files)
    fireEvent.keyDown(palette, { key: 'Enter' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnAction).toHaveBeenCalledWith('toggle_files');
  });

  it('Escape calls onClose without executing', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const palette = screen.getByTestId('command-palette');
    fireEvent.keyDown(palette, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnAction).not.toHaveBeenCalled();
  });

  it('empty filter shows all commands', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const list = screen.getByTestId('command-palette-list');
    // Should have multiple command buttons (at least the shortcut-bound ones)
    const buttons = list.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(10);
  });

  it('no-match filter shows empty state', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'xyznonexistent' } });
    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('clicking outside closes the palette', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const backdrop = screen.getByTestId('command-palette-backdrop');
    fireEvent.click(backdrop);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a command item executes it', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const item = screen.getByTestId('command-item-toggle_git');
    fireEvent.click(item);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnAction).toHaveBeenCalledWith('toggle_git');
  });

  it('shortcut key badges are displayed', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    // The toggle_files command should show 'e' as its key badge
    const item = screen.getByTestId('command-item-toggle_files');
    const kbd = item.querySelector('kbd');
    expect(kbd).toBeInTheDocument();
    expect(kbd?.textContent).toBe('e');
  });

  it('deduplicates actions (e.g., ArrowRight/ArrowDown both map to focus_next)', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    // focus_next should appear only once
    const items = screen.getAllByTestId('command-item-focus_next');
    expect(items).toHaveLength(1);
  });

  it('arrow key wraps around at boundaries', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} onAction={mockOnAction} />);
    const palette = screen.getByTestId('command-palette');
    // Press ArrowUp from index 0 → should wrap to last item
    fireEvent.keyDown(palette, { key: 'ArrowUp' });
    // The last item in the list should now be selected
    const list = screen.getByTestId('command-palette-list');
    const lastButton = list.querySelectorAll('button')[list.querySelectorAll('button').length - 1];
    expect(lastButton.className).toContain('bg-blue-600');
  });
});

describe('CommandPalette — Full Registry (US3)', () => {
  const mockOnClose = vi.fn();
  const mockOnAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('c3-keybindings');
  });

  it('all commands appear when filter is empty (shortcut + button-only)', () => {
    render(
      <CommandPalette
        open={true}
        onClose={mockOnClose}
        onAction={mockOnAction}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />,
    );
    const list = screen.getByTestId('command-palette-list');
    const buttons = list.querySelectorAll('button');
    // 12 deduplicated shortcut actions + 9 button-only = 21
    // (16 entries minus 4 duplicates: ArrowDown=focus_next, ArrowUp=focus_prev, ArrowLeft=focus_prev, ArrowRight already counted)
    expect(buttons.length).toBeGreaterThanOrEqual(20);
  });

  it('button-only commands show no shortcut badge', () => {
    render(
      <CommandPalette
        open={true}
        onClose={mockOnClose}
        onAction={mockOnAction}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />,
    );
    const item = screen.getByTestId('command-item-open_settings');
    const kbd = item.querySelector('kbd');
    expect(kbd).not.toBeInTheDocument();
  });

  it('executing a button-only command calls onAction with correct action string', () => {
    render(
      <CommandPalette
        open={true}
        onClose={mockOnClose}
        onAction={mockOnAction}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />,
    );
    const item = screen.getByTestId('command-item-open_settings');
    fireEvent.click(item);
    expect(mockOnAction).toHaveBeenCalledWith('open_settings');
  });

  it('shortcut-bound commands still show their key badge', () => {
    render(
      <CommandPalette
        open={true}
        onClose={mockOnClose}
        onAction={mockOnAction}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />,
    );
    const item = screen.getByTestId('command-item-toggle_git');
    const kbd = item.querySelector('kbd');
    expect(kbd).toBeInTheDocument();
    expect(kbd?.textContent).toBe('g');
  });

  it('BUTTON_ONLY_COMMANDS has exactly 7 entries', () => {
    expect(BUTTON_ONLY_COMMANDS).toHaveLength(7);
  });

  it('all 7 button-only commands are present in the list', () => {
    render(
      <CommandPalette
        open={true}
        onClose={mockOnClose}
        onAction={mockOnAction}
        extraCommands={BUTTON_ONLY_COMMANDS}
      />,
    );
    const expectedActions = [
      'open_settings', 'toggle_terminal_position',
      'font_size_decrease', 'font_size_increase',
      'continue_session', 'new_session', 'toggle_file_search',
    ];
    for (const action of expectedActions) {
      expect(screen.getByTestId(`command-item-${action}`)).toBeInTheDocument();
    }
  });
});
