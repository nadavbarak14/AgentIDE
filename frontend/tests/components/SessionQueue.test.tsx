import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock dependent components to isolate SessionQueue
vi.mock('../../src/components/ProjectPicker', () => ({
  ProjectPicker: ({ onDirectoryChange }: { onDirectoryChange: (v: string) => void }) => (
    <input data-testid="project-picker" onChange={(e) => onDirectoryChange(e.target.value)} />
  ),
}));

vi.mock('../../src/components/WorkerSelector', () => ({
  WorkerSelector: () => <div data-testid="worker-selector" />,
}));

vi.mock('../../src/components/WorkerBadge', () => ({
  WorkerBadge: () => null,
}));

import { SessionQueue } from '../../src/components/SessionQueue';

const defaultProps = {
  activeSessions: [],
  completedSessions: [],
  failedSessions: [],
  workers: [],
  onCreateSession: vi.fn().mockResolvedValue({}),
  onDeleteSession: vi.fn().mockResolvedValue(undefined),
  onFocusSession: vi.fn(),
  onKillSession: vi.fn(),
};

describe('SessionQueue — Predefined Flag Chips', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all predefined flag chips', () => {
    render(<SessionQueue {...defaultProps} />);

    expect(screen.getByText('Skip Permissions')).toBeInTheDocument();
    expect(screen.getByText('Worktree')).toBeInTheDocument();
    expect(screen.getByText('Continue Latest')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('does not render Clean Start chip (removed)', () => {
    render(<SessionQueue {...defaultProps} />);

    expect(screen.queryByText('Clean Start')).not.toBeInTheDocument();
  });

  it('clicking Skip Permissions chip adds flag to text input', () => {
    render(<SessionQueue {...defaultProps} />);

    const chip = screen.getByText('Skip Permissions');
    fireEvent.click(chip);

    const flagsInput = screen.getByPlaceholderText('CLI flags (e.g., --dangerously-skip-permissions)') as HTMLInputElement;
    expect(flagsInput.value).toBe('--dangerously-skip-permissions');
  });

  it('clicking Skip Permissions chip again removes the flag', () => {
    render(<SessionQueue {...defaultProps} />);

    const chip = screen.getByText('Skip Permissions');
    fireEvent.click(chip); // add
    fireEvent.click(chip); // remove

    const flagsInput = screen.getByPlaceholderText('CLI flags (e.g., --dangerously-skip-permissions)') as HTMLInputElement;
    expect(flagsInput.value).toBe('');
  });

  it('shows warning when --dangerously-skip-permissions is active', () => {
    render(<SessionQueue {...defaultProps} />);

    const chip = screen.getByText('Skip Permissions');
    fireEvent.click(chip);

    expect(screen.getByText('All tool actions will execute without permission prompts.')).toBeInTheDocument();
  });

  it('hides warning when --dangerously-skip-permissions is removed', () => {
    render(<SessionQueue {...defaultProps} />);

    const chip = screen.getByText('Skip Permissions');
    fireEvent.click(chip); // add
    fireEvent.click(chip); // remove

    expect(screen.queryByText('All tool actions will execute without permission prompts.')).not.toBeInTheDocument();
  });

  it('renders flags text input for manual entry', () => {
    render(<SessionQueue {...defaultProps} />);

    const flagsInput = screen.getByPlaceholderText('CLI flags (e.g., --dangerously-skip-permissions)');
    expect(flagsInput).toBeInTheDocument();
  });

  it('shows warning when flag is typed manually', () => {
    render(<SessionQueue {...defaultProps} />);

    const flagsInput = screen.getByPlaceholderText('CLI flags (e.g., --dangerously-skip-permissions)');
    fireEvent.change(flagsInput, { target: { value: '--dangerously-skip-permissions' } });

    expect(screen.getByText('All tool actions will execute without permission prompts.')).toBeInTheDocument();
  });

  it('toggling Continue Latest deactivates Resume (mutual exclusion)', () => {
    render(<SessionQueue {...defaultProps} />);

    // Activate Resume first
    fireEvent.click(screen.getByText('Resume'));
    // Now activate Continue Latest
    fireEvent.click(screen.getByText('Continue Latest'));

    // Continue Latest should be active (blue styling), Resume should not
    const continueBtn = screen.getByText('Continue Latest');
    const resumeBtn = screen.getByText('Resume');
    expect(continueBtn.className).toContain('bg-blue-600/30');
    expect(resumeBtn.className).not.toContain('bg-blue-600/30');
  });

  it('toggling Resume deactivates Continue Latest (mutual exclusion)', () => {
    render(<SessionQueue {...defaultProps} />);

    // Activate Continue Latest first
    fireEvent.click(screen.getByText('Continue Latest'));
    // Now activate Resume
    fireEvent.click(screen.getByText('Resume'));

    const continueBtn = screen.getByText('Continue Latest');
    const resumeBtn = screen.getByText('Resume');
    expect(resumeBtn.className).toContain('bg-blue-600/30');
    expect(continueBtn.className).not.toContain('bg-blue-600/30');
  });
});
