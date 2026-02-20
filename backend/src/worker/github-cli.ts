import { spawnSync } from 'node:child_process';
import { logger } from '../services/logger.js';
import type { GitHubStatus, GitHubIssue, GitHubIssueDetail, GitHubIssueList } from '../models/types.js';

const SPAWN_OPTIONS = {
  encoding: 'utf8' as const,
  timeout: 15000,
};

/**
 * Run `gh` with the given arguments in the specified working directory.
 * Returns { stdout, stderr, exitCode }.
 */
function runGh(
  workingDir: string,
  args: string[],
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = spawnSync('gh', args, {
    ...SPAWN_OPTIONS,
    cwd: workingDir,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
}

/**
 * Check whether the `gh` CLI is installed, authenticated, and inside a GitHub repo.
 */
export function checkGhStatus(workingDir: string): GitHubStatus {
  const status: GitHubStatus = {
    ghInstalled: false,
    ghAuthenticated: false,
    repoDetected: false,
    repoOwner: null,
    repoName: null,
    error: null,
  };

  // 1. Check gh is installed
  const version = runGh(workingDir, ['--version']);
  if (version.exitCode === null) {
    status.error = 'gh CLI not found — install from https://cli.github.com';
    return status;
  }
  status.ghInstalled = true;

  // 2. Check authentication
  const auth = runGh(workingDir, ['auth', 'token']);
  if (auth.exitCode === 4) {
    status.error = 'gh CLI not authenticated — run `gh auth login`';
    return status;
  }
  if (auth.exitCode !== 0) {
    status.error = `gh auth check failed (exit ${auth.exitCode}): ${auth.stderr.trim()}`;
    return status;
  }
  status.ghAuthenticated = true;

  // 3. Detect repo
  const repo = runGh(workingDir, ['repo', 'view', '--json', 'nameWithOwner']);
  if (repo.exitCode !== 0) {
    status.error = 'Not a GitHub repository or no remote configured';
    return status;
  }

  try {
    const parsed = JSON.parse(repo.stdout);
    const nameWithOwner: string = parsed.nameWithOwner || '';
    const parts = nameWithOwner.split('/');
    if (parts.length === 2) {
      status.repoDetected = true;
      status.repoOwner = parts[0];
      status.repoName = parts[1];
    } else {
      status.error = `Unexpected nameWithOwner format: ${nameWithOwner}`;
    }
  } catch {
    status.error = `Failed to parse repo info: ${repo.stdout.trim()}`;
  }

  return status;
}

/**
 * List GitHub issues for the repo in the given working directory.
 */
export function listIssues(
  workingDir: string,
  params: {
    assignee?: string;
    state?: string;
    limit?: number;
    labels?: string[];
    search?: string;
  } = {},
): GitHubIssueList {
  const fields = 'number,title,state,labels,assignees,author,createdAt,updatedAt,url';
  const args: string[] = ['issue', 'list', '--json', fields];

  // State filter (default: open)
  const state = params.state || 'open';
  args.push('--state', state);

  // Limit (default: 50)
  const limit = params.limit || 50;
  args.push('--limit', String(limit));

  // Assignee filter
  if (params.assignee) {
    args.push('--assignee', params.assignee);
  }

  // Labels filter
  if (params.labels && params.labels.length > 0) {
    for (const label of params.labels) {
      args.push('--label', label);
    }
  }

  // Search filter
  if (params.search) {
    args.push('--search', params.search);
  }

  const result = runGh(workingDir, args);

  if (result.exitCode === 4) {
    return { issues: [], totalCount: 0, error: 'gh CLI not authenticated — run `gh auth login`' };
  }

  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || `gh issue list failed (exit ${result.exitCode})`;
    logger.warn({ workingDir, exitCode: result.exitCode, stderr: result.stderr }, 'gh issue list failed');
    return { issues: [], totalCount: 0, error: msg };
  }

  if (result.exitCode === null) {
    return { issues: [], totalCount: 0, error: 'gh command timed out' };
  }

  try {
    const issues: GitHubIssue[] = JSON.parse(result.stdout || '[]');
    return { issues, totalCount: issues.length };
  } catch {
    logger.warn({ stdout: result.stdout }, 'failed to parse gh issue list output');
    return { issues: [], totalCount: 0, error: 'Failed to parse issue list output' };
  }
}

/**
 * Get detailed information about a single GitHub issue, including body and comments.
 */
export function getIssueDetail(
  workingDir: string,
  issueNumber: number,
): { issue: GitHubIssueDetail | null; error?: string } {
  const fields = 'number,title,body,comments,labels,assignees,author,state,url,createdAt,updatedAt';
  const args: string[] = ['issue', 'view', String(issueNumber), '--json', fields];

  const result = runGh(workingDir, args);

  if (result.exitCode === 4) {
    return { issue: null, error: 'gh CLI not authenticated — run `gh auth login`' };
  }

  if (result.exitCode === null) {
    return { issue: null, error: 'gh command timed out' };
  }

  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || `gh issue view failed (exit ${result.exitCode})`;
    logger.warn({ workingDir, issueNumber, exitCode: result.exitCode, stderr: result.stderr }, 'gh issue view failed');
    return { issue: null, error: msg };
  }

  try {
    const issue: GitHubIssueDetail = JSON.parse(result.stdout);
    return { issue };
  } catch {
    logger.warn({ stdout: result.stdout }, 'failed to parse gh issue view output');
    return { issue: null, error: 'Failed to parse issue detail output' };
  }
}
