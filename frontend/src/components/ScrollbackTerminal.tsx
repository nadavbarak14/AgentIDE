import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { sessions as sessionsApi } from '../services/api';

interface ScrollbackTerminalProps {
  sessionId: string;
  fontSize?: number;
}

export function ScrollbackTerminal({ sessionId, fontSize = 14 }: ScrollbackTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#1a1b26', // hide cursor
        selectionBackground: '#33467c',
      },
      scrollback: 50000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Fetch scrollback content
    sessionsApi.scrollback(sessionId)
      .then(({ scrollback, truncated }) => {
        terminal.write(scrollback);
        if (truncated) {
          terminal.write('\r\n\x1b[33m--- Scrollback truncated (showing last 1MB) ---\x1b[0m\r\n');
        }
        terminal.write('\r\n\x1b[31m--- Session crashed ---\x1b[0m\r\n');
        // Scroll to bottom
        terminal.scrollToBottom();
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load scrollback');
        setLoading(false);
      });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, fontSize]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-lg text-amber-400">Crashed</p>
          <p className="text-xs mt-1 text-gray-500">No scrollback available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
          <p className="text-gray-400 text-sm">Loading scrollback...</p>
        </div>
      )}
      <div className="absolute top-1 right-2 px-2 py-0.5 bg-amber-500/20 border border-amber-500/50 rounded text-xs text-amber-400">
        Read-only (crashed)
      </div>
    </div>
  );
}
