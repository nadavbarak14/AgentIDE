import { useMemo } from 'react';

export type ClaudeMode = 'permission' | 'generating' | 'input' | 'idle';

export interface UseClaudeModeReturn {
  mode: ClaudeMode;
}

// Matches common Claude Code permission prompt patterns
const PERMISSION_RE = /\(y\/n\)|\(Y\/n\)|\(yes\/no\)|Allow\?|Deny\?|approve|reject|permission|Do you want to proceed/i;

/**
 * Detect the current Claude Code interaction mode from session state + terminal output.
 *
 * @param needsInput - session.needsInput from polling/WebSocket
 * @param status - session.status ('active', 'completed', 'failed', 'crashed')
 * @param outputBuffer - last N lines of decoded terminal output
 */
export function useClaudeMode(
  needsInput: boolean,
  status: string,
  outputBuffer: string[],
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

    // Waiting for input — check if it's a permission prompt
    // Scan last 5 lines for permission patterns
    const tail = outputBuffer.slice(-5);
    const hasPermission = tail.some(line => PERMISSION_RE.test(line));

    if (hasPermission) {
      return 'permission';
    }

    // Waiting for text input (prompt)
    return 'input';
  }, [needsInput, status, outputBuffer]);

  return { mode };
}
