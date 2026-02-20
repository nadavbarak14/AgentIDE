import { useEffect, useRef, useState } from 'react';
import { useShellTerminal } from '../hooks/useShellTerminal';

interface ShellTerminalProps {
  sessionId: string;
  active: boolean;
  fontSize?: number;
  onClose?: () => void;
}

export function ShellTerminal({ sessionId, active, fontSize = 14, onClose }: ShellTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(false);

  const {
    initTerminal,
    status,
    shellName,
    connected,
    openShell,
    closeShell,
    setFontSize,
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
