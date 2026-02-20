import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionSwitcher } from '../../../src/components/SessionSwitcher';
import { createMockSession } from '../../test-utils';

const mockSessions = [
  createMockSession({ id: 'sess-1', title: 'Build Feature A', status: 'active', workingDirectory: '/home/user/project-a' }),
  createMockSession({ id: 'sess-2', title: 'Fix Bug B', status: 'queued', workingDirectory: '/home/user/project-b' }),
  createMockSession({ id: 'sess-3', title: '', status: 'completed', workingDirectory: '/home/user/project-c' }),
];

describe('SessionSwitcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // Renders nothing when isOpen=false
  // ---------------------------------------------------------------
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={false}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  // ---------------------------------------------------------------
  // Renders overlay when isOpen=true
  // ---------------------------------------------------------------
  it('renders the overlay when isOpen is true', () => {
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Switch Session')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------
  // Shows all sessions with titles
  // ---------------------------------------------------------------
  it('shows all sessions with their titles', () => {
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Build Feature A')).toBeInTheDocument();
    expect(screen.getByText('Fix Bug B')).toBeInTheDocument();
    // Empty title should show "Untitled"
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------
  // Highlighted session has blue border
  // ---------------------------------------------------------------
  it('highlighted session has blue border', () => {
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={1}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const fixBugCard = screen.getByText('Fix Bug B').closest('button');
    expect(fixBugCard).toBeTruthy();
    expect(fixBugCard!.className).toContain('border-blue-500');

    // Non-highlighted card should NOT have blue border
    const buildCard = screen.getByText('Build Feature A').closest('button');
    expect(buildCard).toBeTruthy();
    expect(buildCard!.className).not.toContain('border-blue-500');
  });

  // ---------------------------------------------------------------
  // Click on session card calls onSelect
  // ---------------------------------------------------------------
  it('click on session card calls onSelect with session id', () => {
    const onSelect = vi.fn();
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={0}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const fixBugCard = screen.getByText('Fix Bug B').closest('button');
    fireEvent.click(fixBugCard!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('sess-2');
  });

  // ---------------------------------------------------------------
  // Click on backdrop calls onClose
  // ---------------------------------------------------------------
  it('click on backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    // The backdrop is the outermost fixed div
    const backdrop = screen.getByText('Switch Session').closest('.fixed');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------
  // Click on inner content does not call onClose
  // ---------------------------------------------------------------
  it('click on inner content does not call onClose', () => {
    const onClose = vi.fn();
    render(
      <SessionSwitcher
        sessions={mockSessions}
        currentSessionId="sess-1"
        isOpen={true}
        highlightedIndex={0}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const heading = screen.getByText('Switch Session');
    const panel = heading.closest('.bg-gray-800');
    expect(panel).toBeTruthy();

    fireEvent.click(panel!);

    expect(onClose).not.toHaveBeenCalled();
  });
});
