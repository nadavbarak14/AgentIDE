import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { logger } from './logger.js';

export interface PrerequisiteResult {
  tool: string;
  available: boolean;
}

const TOOLS: { tool: string; package: string }[] = [
  { tool: 'grep', package: 'grep' },
  { tool: 'lsof', package: 'lsof' },
  { tool: 'curl', package: 'curl' },
  { tool: 'python3', package: 'python3' },
];

/**
 * Check for optional system tools and log warnings for missing ones.
 * Does not block startup — features degrade gracefully.
 */
export function checkPrerequisites(): PrerequisiteResult[] {
  const results: PrerequisiteResult[] = [];

  for (const { tool, package: pkg } of TOOLS) {
    let available = false;
    try {
      execFileSync('which', [tool], { encoding: 'utf-8', timeout: 3000 });
      available = true;
    } catch {
      logger.warn(`Optional tool '${tool}' not found. Install with: sudo apt-get install -y ${pkg}`);
    }
    results.push({ tool, available });
  }

  return results;
}

/**
 * Detect WSL version by reading /proc/version.
 * Returns 'wsl2', 'wsl1', or 'none'.
 *
 * @param procVersionPath - Path to /proc/version (overridable for testing)
 */
export function detectWSLVersion(procVersionPath = '/proc/version'): 'wsl2' | 'wsl1' | 'none' {
  try {
    const content = fs.readFileSync(procVersionPath, 'utf-8');
    // WSL kernels contain "microsoft" (case varies between WSL1 and WSL2)
    if (!/microsoft/i.test(content)) {
      return 'none';
    }
    // WSL2 kernels contain "WSL2" in the version string
    if (/WSL2/i.test(content)) {
      return 'wsl2';
    }
    // Microsoft present but no WSL2 → WSL1
    logger.warn('WSL1 detected. AgentIDE requires WSL2. Please upgrade: wsl --set-version <distro> 2');
    return 'wsl1';
  } catch {
    // /proc/version doesn't exist (e.g., macOS) or not readable
    return 'none';
  }
}
