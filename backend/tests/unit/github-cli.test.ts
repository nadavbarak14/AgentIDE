import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpawnSyncReturns } from 'node:child_process';

// Use vi.hoisted so the mock fn is available inside hoisted vi.mock factories
const { mockSpawnSync } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}));

import { checkGhStatus, listIssues, getIssueDetail } from '../../src/worker/github-cli.js';

const mockedSpawnSync = mockSpawnSync;

/** Helper to build a SpawnSyncReturns-like object. */
function fakeSpawn(overrides: {
  stdout?: string;
  stderr?: string;
  status?: number | null;
}): SpawnSyncReturns<string> {
  return {
    pid: 12345,
    output: [],
    stdout: overrides.stdout ?? '',
    stderr: overrides.stderr ?? '',
    status: 'status' in overrides ? overrides.status : 0,
    signal: null,
  };
}

describe('github-cli', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ─── checkGhStatus ────────────────────────────────────────────

  describe('checkGhStatus', () => {
    it('returns ghInstalled=false when gh --version returns null exit code', () => {
      mockedSpawnSync.mockReturnValue(fakeSpawn({ status: null }));

      const result = checkGhStatus('/tmp/repo');

      expect(result.ghInstalled).toBe(false);
      expect(result.ghAuthenticated).toBe(false);
      expect(result.repoDetected).toBe(false);
      expect(result.error).toContain('gh CLI not found');
    });

    it('returns ghAuthenticated=false when exit code is 4', () => {
      // First call: gh --version succeeds
      mockedSpawnSync.mockReturnValueOnce(fakeSpawn({ status: 0, stdout: 'gh version 2.40.0' }));
      // Second call: gh auth token returns exit code 4
      mockedSpawnSync.mockReturnValueOnce(fakeSpawn({ status: 4, stderr: 'not authenticated' }));

      const result = checkGhStatus('/tmp/repo');

      expect(result.ghInstalled).toBe(true);
      expect(result.ghAuthenticated).toBe(false);
      expect(result.repoDetected).toBe(false);
      expect(result.error).toContain('not authenticated');
    });

    it('returns full status with owner/name when all checks pass', () => {
      // gh --version
      mockedSpawnSync.mockReturnValueOnce(fakeSpawn({ status: 0, stdout: 'gh version 2.40.0' }));
      // gh auth token
      mockedSpawnSync.mockReturnValueOnce(fakeSpawn({ status: 0, stdout: 'gho_abc123' }));
      // gh repo view --json nameWithOwner
      mockedSpawnSync.mockReturnValueOnce(
        fakeSpawn({
          status: 0,
          stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }),
        }),
      );

      const result = checkGhStatus('/tmp/repo');

      expect(result.ghInstalled).toBe(true);
      expect(result.ghAuthenticated).toBe(true);
      expect(result.repoDetected).toBe(true);
      expect(result.repoOwner).toBe('acme');
      expect(result.repoName).toBe('widgets');
      expect(result.error).toBeNull();
    });
  });

  // ─── listIssues ────────────────────────────────────────────────

  describe('listIssues', () => {
    it('returns parsed issues array on success', () => {
      const issues = [
        {
          number: 1,
          title: 'Bug report',
          state: 'OPEN',
          labels: [],
          assignees: [],
          author: { login: 'alice', name: 'Alice' },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
          url: 'https://github.com/acme/widgets/issues/1',
        },
        {
          number: 2,
          title: 'Feature request',
          state: 'OPEN',
          labels: [{ name: 'enhancement', color: '0075ca', description: '' }],
          assignees: [{ login: 'bob', name: 'Bob' }],
          author: { login: 'alice', name: 'Alice' },
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-04T00:00:00Z',
          url: 'https://github.com/acme/widgets/issues/2',
        },
      ];

      mockedSpawnSync.mockReturnValue(fakeSpawn({ status: 0, stdout: JSON.stringify(issues) }));

      const result = listIssues('/tmp/repo');

      expect(result.issues).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.error).toBeUndefined();
      expect(result.issues[0].number).toBe(1);
      expect(result.issues[0].title).toBe('Bug report');
      expect(result.issues[1].number).toBe(2);
    });

    it('returns error when gh returns non-zero exit code', () => {
      mockedSpawnSync.mockReturnValue(
        fakeSpawn({ status: 1, stderr: 'no repository detected' }),
      );

      const result = listIssues('/tmp/repo');

      expect(result.issues).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.error).toBe('no repository detected');
    });

    it('passes --assignee and --state flags correctly', () => {
      mockedSpawnSync.mockReturnValue(fakeSpawn({ status: 0, stdout: '[]' }));

      listIssues('/tmp/repo', { assignee: 'alice', state: 'closed' });

      expect(mockedSpawnSync).toHaveBeenCalledOnce();
      const args = mockedSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('--assignee');
      expect(args[args.indexOf('--assignee') + 1]).toBe('alice');
      expect(args).toContain('--state');
      expect(args[args.indexOf('--state') + 1]).toBe('closed');
    });
  });

  // ─── getIssueDetail ────────────────────────────────────────────

  describe('getIssueDetail', () => {
    it('returns parsed issue on success', () => {
      const issue = {
        number: 42,
        title: 'Critical bug',
        body: 'Steps to reproduce...',
        state: 'OPEN',
        labels: [{ name: 'bug', color: 'd73a4a', description: '' }],
        assignees: [],
        author: { login: 'alice', name: 'Alice' },
        comments: [
          {
            author: { login: 'bob', name: 'Bob' },
            body: 'I can reproduce this.',
            createdAt: '2026-01-05T00:00:00Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-05T00:00:00Z',
        url: 'https://github.com/acme/widgets/issues/42',
      };

      mockedSpawnSync.mockReturnValue(fakeSpawn({ status: 0, stdout: JSON.stringify(issue) }));

      const result = getIssueDetail('/tmp/repo', 42);

      expect(result.issue).not.toBeNull();
      expect(result.error).toBeUndefined();
      expect(result.issue!.number).toBe(42);
      expect(result.issue!.title).toBe('Critical bug');
      expect(result.issue!.body).toBe('Steps to reproduce...');
      expect(result.issue!.comments).toHaveLength(1);
      expect(result.issue!.comments[0].author.login).toBe('bob');
    });

    it('returns error on failure', () => {
      mockedSpawnSync.mockReturnValue(
        fakeSpawn({ status: 1, stderr: 'issue 999 not found' }),
      );

      const result = getIssueDetail('/tmp/repo', 999);

      expect(result.issue).toBeNull();
      expect(result.error).toBe('issue 999 not found');
    });
  });
});
