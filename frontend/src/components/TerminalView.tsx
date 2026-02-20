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

  const { initTerminal, write, fit, setFontSize } = useTerminal({
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

  const { sendInput, sendResize } = useWebSocket({
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

  useEffect(() => {
    fit();
  }, [fit]);

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
