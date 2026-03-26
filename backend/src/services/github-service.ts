import { spawnSync } from 'node:child_process';
import type { Repository } from '../models/repository.js';
import { logger } from './logger.js';

export interface GhCheckResult {
  available: boolean;
  authenticated: boolean;
  error: string | null;
}

/**
 * Generate a Git branch name from an issue number and title.
 * Format: `issue-{number}-{slugified-title}`, truncated to 60 chars.
 */
export function generateBranchName(issueNumber: number, issueTitle: string): string {
  const slug = issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `issue-${issueNumber}-${slug}`;
}

export class GitHubService {
  constructor(private repo: Repository) {}

  /**
   * Check whether the `gh` CLI is installed and authenticated.
   * Does not require a repo context — just checks global availability.
   */
  checkGhAvailable(): GhCheckResult {
    const result: GhCheckResult = {
      available: false,
      authenticated: false,
      error: null,
    };

    try {
      // Check if gh is installed
      const versionCheck = spawnSync('gh', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
      });

      if (versionCheck.status !== 0) {
        result.error = 'gh CLI is not installed';
        return result;
      }

      result.available = true;

      // Check if gh is authenticated
      const authCheck = spawnSync('gh', ['auth', 'status'], {
        encoding: 'utf8',
        timeout: 10000,
      });

      if (authCheck.status !== 0) {
        result.error = 'gh CLI is not authenticated';
        return result;
      }

      result.authenticated = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.warn({ err }, 'failed to check gh availability');
      result.error = message;
    }

    return result;
  }
}
