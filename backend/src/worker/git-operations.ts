import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../services/logger.js';

export interface DiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface DiffResult {
  diff: string;
  stats: DiffStats;
}

/**
 * Check whether a directory is inside a git repository.
 */
function isGitRepository(directory: string): boolean {
  try {
    const gitDir = path.join(directory, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Run a git command in the given directory and return stdout.
 * Returns null if the command fails.
 */
function runGitCommand(directory: string, args: string): string | null {
  try {
    const result = execSync(`git ${args}`, {
      cwd: directory,
      encoding: 'utf-8',
      timeout: 10000, // 10 second timeout
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result;
  } catch (err) {
    logger.debug({ err, directory, args }, 'git command failed');
    return null;
  }
}

/**
 * Parse the summary line from `git diff --stat` output.
 * Example: " 3 files changed, 10 insertions(+), 5 deletions(-)"
 */
function parseDiffStats(statOutput: string): DiffStats {
  const stats: DiffStats = {
    filesChanged: 0,
    additions: 0,
    deletions: 0,
  };

  if (!statOutput.trim()) return stats;

  // The summary is typically the last non-empty line
  const lines = statOutput.trim().split('\n');
  const summaryLine = lines[lines.length - 1];

  const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
  if (filesMatch) stats.filesChanged = parseInt(filesMatch[1], 10);

  const addMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
  if (addMatch) stats.additions = parseInt(addMatch[1], 10);

  const delMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);
  if (delMatch) stats.deletions = parseInt(delMatch[1], 10);

  return stats;
}

/**
 * Get the combined diff (unstaged + staged) for a git repository.
 * Handles non-git directories gracefully by returning an empty diff.
 * @param directory - The working directory to diff
 */
export function getDiff(directory: string): DiffResult {
  const emptyResult: DiffResult = {
    diff: '',
    stats: { filesChanged: 0, additions: 0, deletions: 0 },
  };

  if (!isGitRepository(directory)) {
    logger.debug({ directory }, 'not a git repository, returning empty diff');
    return emptyResult;
  }

  // Get unstaged changes
  const unstagedDiff = runGitCommand(directory, 'diff') || '';
  const unstagedStat = runGitCommand(directory, 'diff --stat') || '';

  // Get staged changes
  const stagedDiff = runGitCommand(directory, 'diff --cached') || '';
  const stagedStat = runGitCommand(directory, 'diff --cached --stat') || '';

  // Combine diffs
  const parts: string[] = [];
  if (stagedDiff.trim()) {
    parts.push('# Staged changes\n' + stagedDiff);
  }
  if (unstagedDiff.trim()) {
    parts.push('# Unstaged changes\n' + unstagedDiff);
  }
  const combinedDiff = parts.join('\n');

  // Combine stats from both
  const unstagedStats = parseDiffStats(unstagedStat);
  const stagedStats = parseDiffStats(stagedStat);

  const stats: DiffStats = {
    filesChanged: unstagedStats.filesChanged + stagedStats.filesChanged,
    additions: unstagedStats.additions + stagedStats.additions,
    deletions: unstagedStats.deletions + stagedStats.deletions,
  };

  return {
    diff: combinedDiff,
    stats,
  };
}
