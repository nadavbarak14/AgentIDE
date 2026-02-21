import { useEffect, useRef, useState, useCallback } from 'react';
import { useShellTerminal } from '../hooks/useShellTerminal';

interface ShellTerminalProps {
  sessionId: string;
  active: boolean;
  fontSize?: number;
  onClose?: () => void;
  onSendToClaude?: (text: string) => void;
}

export function ShellTerminal({ sessionId, active, fontSize = 14, onClose, onSendToClaude }: ShellTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const {
    initTerminal,
    status,
    shellName,
    connected,
    openShell,
    closeShell,
    setFontSize,
    getSelection,
  } = useShellTerminal({
    sessionId,
    enabled: active,
  });

  useEffect(() => {
    if (containerRef.current && (status === 'running' || connected)) {
      const cleanup = initTerminal(containerRef.current);
      return cleanup;
    }
  }, [initTerminal, status, connected]);

  useEffect(() => {
    setFontSize(fontSize);
  }, [fontSize, setFontSize]);

  // Track selection changes in the terminal container
  useEffect(() => {
    if (status !== 'running') return;

    const handleSelectionChange = () => {
      const sel = getSelection();
      setHasSelection(sel.length > 0);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    // Also check on mouseup for xterm's internal selection
    const container = containerRef.current;
    const handleMouseUp = () => {
      // Small delay to let xterm finalize selection
      setTimeout(() => {
        const sel = getSelection();
        setHasSelection(sel.length > 0);
      }, 50);
    };
    container?.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      container?.removeEventListener('mouseup', handleMouseUp);
    };
  }, [status, getSelection]);

  const handleOpen = async () => {
    setOpening(true);
    try {
      await openShell();
    } catch {
      // Error handled by status update
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async () => {
    try {
      await closeShell();
    } catch {
      // Ignore close errors
    }
  };

  const handleSendToClaude = useCallback(() => {
    const text = getSelection();
    if (text && onSendToClaude) {
      onSendToClaude(text);
      setHasSelection(false);
    }
  }, [getSelection, onSendToClaude]);

  // Shell not running — show open button
  if (status === 'none' || status === 'stopped' || status === 'killed') {
    return (
      <div className="flex flex-col h-full bg-gray-900">
        <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 flex-shrink-0">
          <span>Shell{shellName ? ` (${shellName})` : ''}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 px-1"
              title="Close panel"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          {(status === 'stopped' || status === 'killed') && (
            <span className="text-xs text-gray-500">
              Shell {status === 'killed' ? 'was terminated' : 'exited'}
            </span>
          )}
          <button
            onClick={handleOpen}
            disabled={opening}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50"
          >
            {opening ? 'Opening...' : status === 'none' ? 'Open Shell' : 'Restart Shell'}
          </button>
        </div>
      </div>
    );
  }

  // Shell running — show terminal
  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 flex-shrink-0">
        <span>
          Shell{shellName ? ` (${shellName})` : ''}
          {!connected && <span className="ml-2 text-yellow-500">reconnecting...</span>}
        </span>
        <div className="flex items-center gap-1">
          {hasSelection && onSendToClaude && (
            <button
              onClick={handleSendToClaude}
              className="text-blue-400 hover:text-blue-300 px-1.5 py-0.5 bg-blue-900/30 hover:bg-blue-900/50 rounded text-[11px] transition-colors"
              title="Send selected text to Claude"
            >
              Send to Claude
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-red-400 px-1"
            title="Kill shell"
          >
            Stop
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 px-1"
              title="Close panel"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-[100px]"
        style={{ backgroundColor: '#1a1b26' }}
      />
    </div>
  );
}
