import { useEffect, useRef, useCallback } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { useWebSocket } from '../hooks/useWebSocket';

interface TerminalViewProps {
  sessionId: string;
  active: boolean;
  fontSize?: number;
  onWsMessage?: (msg: import('../services/ws').WsServerMessage) => void;
}

export function TerminalView({ sessionId, active, fontSize = 14, onWsMessage }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs so the terminal onData callback always calls the latest functions
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const sendResizeRef = useRef<(cols: number, rows: number) => void>(() => {});
  const inputDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { initTerminal, write, fit, setFontSize, terminal: terminalRef2 } = useTerminal({
    onData: (data) => {
      sendInputRef.current(data);
      // Detect Enter key — triggers auto-switch in Dashboard
      if (data.includes('\r') || data.includes('\n')) {
        if (!inputDebounceRef.current) {
          window.dispatchEvent(new CustomEvent('c3:input-sent'));
          inputDebounceRef.current = setTimeout(() => {
            inputDebounceRef.current = null;
          }, 500);
        }
      }
    },
    onResize: (cols, rows) => sendResizeRef.current(cols, rows),
  });

  const onWsMessageRef = useRef(onWsMessage);
  onWsMessageRef.current = onWsMessage;

  const { connected, sendInput, sendResize } = useWebSocket({
    sessionId,
    enabled: active,
    onBinaryData: useCallback((data: ArrayBuffer) => write(data), [write]),
    onMessage: useCallback((msg: import('../services/ws').WsServerMessage) => {
      onWsMessageRef.current?.(msg);
    }, []),
  });

  // Keep refs pointing to latest functions
  sendInputRef.current = sendInput;
  sendResizeRef.current = sendResize;

  useEffect(() => {
    if (containerRef.current) {
      const cleanup = initTerminal(containerRef.current);
      return cleanup;
    }
  }, [initTerminal]);

  // Multi-pass settle: after mount, run fit + scroll several times to handle
  // layout settling, scrollback arrival, and container dimension changes.
  // This is more reliable than trying to guess the exact right moment.
  useEffect(() => {
    const settle = () => {
      fit();
      terminalRef2.current?.scrollToBottom();
    };
    const timers = [50, 200, 500].map((ms) => setTimeout(settle, ms));
    return () => timers.forEach(clearTimeout);
  }, [fit]); // runs once on mount since fit is stable

  // When WebSocket connects, sync PTY dimensions and do a final settle pass
  // after scrollback has arrived.
  useEffect(() => {
    if (!connected || !terminalRef2.current) return;

    // Send current dimensions so PTY matches
    sendResize(terminalRef2.current.cols, terminalRef2.current.rows);

    // After scrollback settles, final fit + resize + scroll
    const timer = setTimeout(() => {
      if (!terminalRef2.current) return;
      fit();
      sendResize(terminalRef2.current.cols, terminalRef2.current.rows);
      terminalRef2.current.scrollToBottom();
    }, 150);
    return () => clearTimeout(timer);
  }, [connected, fit, sendResize]);

  useEffect(() => {
    return () => {
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
    };
  }, []);

  // Update terminal font size when prop changes
  useEffect(() => {
    setFontSize(fontSize);
  }, [fontSize, setFontSize]);


  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[200px]"
      style={{ backgroundColor: '#1a1b26' }}
    />
  );
}
