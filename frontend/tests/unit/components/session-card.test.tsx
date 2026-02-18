import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionCard } from '../../../src/components/SessionCard';
import { createMockSession } from '../../test-utils';

// Mock the usePanel hook — it makes API calls and manages complex state
vi.mock('../../../src/hooks/usePanel', () => ({
  usePanel: () => ({
    leftPanel: 'none',
    rightPanel: 'none',
    leftWidthPercent: 25,
    rightWidthPercent: 35,
    activePanel: 'none',
    fileTabs: [],
    activeTabIndex: 0,
    tabScrollPositions: {},
    gitScrollPosition: 0,
    previewUrl: '',
    panelWidthPercent: 40,
    setLeftWidth: vi.fn(),
    setRightWidth: vi.fn(),
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    addFileTab: vi.fn(),
    removeFileTab: vi.fn(),
    setActiveTab: vi.fn(),
    updateScrollPosition: vi.fn(),
    setGitScrollPosition: vi.fn(),
    setPreviewUrl: vi.fn(),
    setPanelWidth: vi.fn(),
    getState: vi.fn(),
    scheduleSave: vi.fn(),
  }),
}));

// Mock heavy child components that depend on browser APIs (xterm, monaco, etc.)
vi.mock('../../../src/components/TerminalView', () => ({
  TerminalView: () => <div data-testid="terminal-view" />,
}));
vi.mock('../../../src/components/FileTree', () => ({
  FileTree: () => <div data-testid="file-tree" />,
}));
vi.mock('../../../src/components/FileViewer', () => ({
  FileViewer: () => <div data-testid="file-viewer" />,
}));
vi.mock('../../../src/components/DiffViewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
}));
vi.mock('../../../src/components/LivePreview', () => ({
  LivePreview: () => <div data-testid="live-preview" />,
}));

describe('SessionCard', () => {
  it('renders session title', () => {
    render(<SessionCard session={createMockSession({ title: 'My Session' })} />);
    expect(screen.getByText('My Session')).toBeInTheDocument();
  });

  it('renders "Untitled" when title is empty', () => {
    render(<SessionCard session={createMockSession({ title: '' })} />);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('renders working directory in footer', () => {
    render(<SessionCard session={createMockSession({ workingDirectory: '/home/user/project' })} />);
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('shows status text for active session', () => {
    render(<SessionCard session={createMockSession({ status: 'active' })} />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('shows status text for queued session', () => {
    render(<SessionCard session={createMockSession({ status: 'queued' })} />);
    expect(screen.getByText('queued')).toBeInTheDocument();
  });

  it('shows needs_input indicator when needsInput is true', () => {
    render(<SessionCard session={createMockSession({ needsInput: true })} />);
    expect(screen.getByTitle('Needs input')).toBeInTheDocument();
    expect(screen.getByTitle('Needs input').textContent).toBe('!');
  });

  it('does not show needs_input indicator when needsInput is false', () => {
    render(<SessionCard session={createMockSession({ needsInput: false })} />);
    expect(screen.queryByTitle('Needs input')).not.toBeInTheDocument();
  });

  it('shows pin indicator when session is locked', () => {
    render(<SessionCard session={createMockSession({ lock: true })} />);
    expect(screen.getByTitle('Pinned')).toBeInTheDocument();
  });

  it('does not show pin indicator when session is unlocked', () => {
    render(<SessionCard session={createMockSession({ lock: false })} />);
    expect(screen.queryByTitle('Pinned')).not.toBeInTheDocument();
  });

  it('shows PID in footer when pid is set', () => {
    render(<SessionCard session={createMockSession({ pid: 42000 })} />);
    expect(screen.getByText('PID 42000')).toBeInTheDocument();
  });

  it('shows Kill button for active sessions', () => {
    render(<SessionCard session={createMockSession({ status: 'active' })} />);
    expect(screen.getByTitle('Kill session')).toBeInTheDocument();
  });

  it('shows Continue button for completed sessions with claudeSessionId', () => {
    render(
      <SessionCard
        session={createMockSession({ status: 'completed', claudeSessionId: 'abc123' })}
      />,
    );
    expect(screen.getByTitle('Continue with claude -c')).toBeInTheDocument();
  });

  it('does not show Continue button for completed sessions without claudeSessionId', () => {
    render(
      <SessionCard
        session={createMockSession({ status: 'completed', claudeSessionId: null })}
      />,
    );
    expect(screen.queryByTitle('Continue with claude -c')).not.toBeInTheDocument();
  });

  it('shows Delete button for non-active sessions', () => {
    render(<SessionCard session={createMockSession({ status: 'completed' })} />);
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('does not show Delete button for active sessions', () => {
    render(<SessionCard session={createMockSession({ status: 'active' })} />);
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });
});
