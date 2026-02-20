import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { github } from '../../src/services/api';
import type { GitHubStatus, GitHubIssueList, GitHubIssueDetail } from '../../src/services/api';

// Mock the api service
vi.mock('../../src/services/api', () => ({
  github: {
    status: vi.fn(),
    issues: vi.fn(),
    issueDetail: vi.fn(),
  },
}));

import { GitHubIssues } from '../../src/components/GitHubIssues';

const statusMock = vi.mocked(github.status);
const issuesMock = vi.mocked(github.issues);
const issueDetailMock = vi.mocked(github.issueDetail);

const OK_STATUS: GitHubStatus = {
  ghInstalled: true,
  ghAuthenticated: true,
  repoDetected: true,
  repoOwner: 'acme',
  repoName: 'widgets',
  error: null,
};

const SAMPLE_ISSUES: GitHubIssueList = {
  issues: [
    {
      number: 42,
      title: 'Fix login bug',
      state: 'OPEN',
      labels: [{ name: 'bug', color: 'd73a4a', description: 'Something is broken' }],
      assignees: [{ login: 'alice', name: 'Alice' }],
      author: { login: 'bob', name: 'Bob' },
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
      url: 'https://github.com/acme/widgets/issues/42',
    },
    {
      number: 99,
      title: 'Add dark mode',
      state: 'OPEN',
      labels: [{ name: 'enhancement', color: 'a2eeef', description: 'New feature' }],
      assignees: [],
      author: { login: 'carol', name: 'Carol' },
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-05T00:00:00Z',
      url: 'https://github.com/acme/widgets/issues/99',
    },
  ],
  totalCount: 2,
};

const SAMPLE_DETAIL: GitHubIssueDetail = {
  number: 42,
  title: 'Fix login bug',
  state: 'OPEN',
  labels: [{ name: 'bug', color: 'd73a4a', description: 'Something is broken' }],
  assignees: [{ login: 'alice', name: 'Alice' }],
  author: { login: 'bob', name: 'Bob' },
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
  url: 'https://github.com/acme/widgets/issues/42',
  body: 'Users cannot log in after password reset.',
  comments: [
    {
      author: { login: 'dave', name: 'Dave' },
      body: 'I can reproduce this on Chrome.',
      createdAt: '2026-01-12T00:00:00Z',
    },
  ],
};

describe('GitHubIssues', () => {
  const defaultProps = {
    sessionId: 'sess-1',
    onSendToClaude: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows "Checking GitHub CLI..." while loading status', () => {
    // Never resolve the status promise so we stay in loading state
    statusMock.mockReturnValue(new Promise(() => {}));

    render(<GitHubIssues {...defaultProps} />);

    expect(screen.getByText('Checking GitHub CLI...')).toBeInTheDocument();
  });

  it('shows "GitHub CLI not found" when ghInstalled=false', async () => {
    statusMock.mockResolvedValue({
      ghInstalled: false,
      ghAuthenticated: false,
      repoDetected: false,
      repoOwner: null,
      repoName: null,
      error: null,
    });

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub CLI not found')).toBeInTheDocument();
    });
    expect(screen.getByText('brew install gh')).toBeInTheDocument();
  });

  it('shows "Not authenticated" when ghAuthenticated=false', async () => {
    statusMock.mockResolvedValue({
      ghInstalled: true,
      ghAuthenticated: false,
      repoDetected: false,
      repoOwner: null,
      repoName: null,
      error: null,
    });

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
    expect(screen.getByText('gh auth login')).toBeInTheDocument();
  });

  it('shows "No repository detected" when repoDetected=false', async () => {
    statusMock.mockResolvedValue({
      ghInstalled: true,
      ghAuthenticated: true,
      repoDetected: false,
      repoOwner: null,
      repoName: null,
      error: null,
    });

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No repository detected')).toBeInTheDocument();
    });
  });

  it('shows issue list when status is OK and issues are loaded', async () => {
    statusMock.mockResolvedValue(OK_STATUS);
    issuesMock.mockResolvedValue(SAMPLE_ISSUES);

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    expect(screen.getByText('Add dark mode')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('#99')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('enhancement')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    // Repo info in header
    expect(screen.getByText('acme/widgets')).toBeInTheDocument();
  });

  it('shows "No issues found" when issues array is empty', async () => {
    statusMock.mockResolvedValue(OK_STATUS);
    issuesMock.mockResolvedValue({ issues: [], totalCount: 0 });

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('No issues found')).toBeInTheDocument();
    });
  });

  it('"Send" button calls onSendToClaude with correct text', async () => {
    statusMock.mockResolvedValue(OK_STATUS);
    issuesMock.mockResolvedValue(SAMPLE_ISSUES);
    const onSendToClaude = vi.fn();

    await act(async () => {
      render(<GitHubIssues {...defaultProps} onSendToClaude={onSendToClaude} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    // There are "Send" buttons per issue row
    const sendButtons = screen.getAllByTitle('Send to Claude');
    expect(sendButtons.length).toBe(2);

    // Click the first Send button (issue #42)
    await act(async () => {
      fireEvent.click(sendButtons[0]);
    });

    expect(onSendToClaude).toHaveBeenCalledTimes(1);
    expect(onSendToClaude).toHaveBeenCalledWith(
      'Please work on GitHub issue #42: Fix login bug\n\nURL: https://github.com/acme/widgets/issues/42',
    );
  });

  it('clicking an issue loads and shows issue detail', async () => {
    statusMock.mockResolvedValue(OK_STATUS);
    issuesMock.mockResolvedValue(SAMPLE_ISSUES);
    issueDetailMock.mockResolvedValue(SAMPLE_DETAIL);

    await act(async () => {
      render(<GitHubIssues {...defaultProps} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    // Click the issue row (the title text)
    await act(async () => {
      fireEvent.click(screen.getByText('Fix login bug'));
    });

    // Wait for detail to load
    await waitFor(() => {
      expect(screen.getByText('Users cannot log in after password reset.')).toBeInTheDocument();
    });

    // Verify detail view elements
    expect(issueDetailMock).toHaveBeenCalledWith('sess-1', 42);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('Comments (1)')).toBeInTheDocument();
    expect(screen.getByText('I can reproduce this on Chrome.')).toBeInTheDocument();
    expect(screen.getByText('dave')).toBeInTheDocument();

    // Back button is present
    const backButton = screen.getByText(/Back/);
    expect(backButton).toBeInTheDocument();

    // Click back to return to issue list
    await act(async () => {
      fireEvent.click(backButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Add dark mode')).toBeInTheDocument();
    });
  });
});
