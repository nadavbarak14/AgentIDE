import { useMemo } from 'react';

export type ClaudeMode = 'permission' | 'generating' | 'input' | 'idle';

export interface UseClaudeModeReturn {
  mode: ClaudeMode;
}

/**
 * Detect the current Claude Code interaction mode from session state + server-provided waitReason.
 *
 * @param needsInput - session.needsInput from polling/WebSocket
 * @param status - session.status ('active', 'completed', 'failed', 'crashed')
 * @param waitReason - session.waitReason from server ('permission', 'question', 'stopped', or null)
 */
export function useClaudeMode(
  needsInput: boolean,
  status: string,
  waitReason: string | null,
): UseClaudeModeReturn {
  const mode = useMemo<ClaudeMode>(() => {
    // Idle: session is done
    if (status === 'completed' || status === 'failed') {
      return 'idle';
    }

    // Not waiting for input → Claude is generating
    if (!needsInput) {
      return 'generating';
    }

    // Waiting for input — check waitReason from server
    if (waitReason === 'permission') {
      return 'permission';
    }

    // All other waiting states (question, stopped, null/unknown) → input mode
    return 'input';
  }, [needsInput, status, waitReason]);

  return { mode };
}
