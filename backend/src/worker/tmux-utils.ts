import { execFileSync } from 'node:child_process';
import { logger } from '../services/logger.js';

/**
 * Escape a string for safe use as a shell argument.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Get the tmux session name for a given session ID.
 * Uses first 8 chars to keep it readable.
 */
export function getTmuxSessionName(sessionId: string): string {
  return `c3-${sessionId.substring(0, 8)}`;
}

/**
 * Check if tmux is available and return its version, or null if not found.
 */
export function checkTmuxAvailable(): string | null {
  try {
    const version = execFileSync('tmux', ['-V'], { encoding: 'utf-8', timeout: 3000 }).trim();
    return version;
  } catch {
    return null;
  }
}

/**
 * Check if a tmux session is alive.
 */
export function isTmuxSessionAlive(tmuxName: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', tmuxName], { encoding: 'utf-8', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a tmux session by name.
 */
export function killTmuxSession(tmuxName: string): void {
  try {
    execFileSync('tmux', ['kill-session', '-t', tmuxName], { encoding: 'utf-8', timeout: 3000 });
  } catch {
    // Session may already be dead
  }
}

/**
 * List all c3-* tmux sessions (returns session names).
 */
export function listC3TmuxSessions(): string[] {
  try {
    const output = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    if (!output) return [];
    return output.split('\n').filter(name => name.startsWith('c3-'));
  } catch {
    // tmux server not running or no sessions
    return [];
  }
}

/**
 * Kill all orphaned c3-* tmux sessions that are not in the tracked set.
 */
export function cleanupOrphanedTmuxSessions(trackedNames: Set<string>): number {
  const allC3Sessions = listC3TmuxSessions();
  let killed = 0;
  for (const name of allC3Sessions) {
    if (!trackedNames.has(name)) {
      logger.info({ tmuxSession: name }, 'killing orphaned tmux session');
      killTmuxSession(name);
      killed++;
    }
  }
  return killed;
}
