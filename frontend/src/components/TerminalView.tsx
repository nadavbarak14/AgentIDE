import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { useWebSocket } from '../hooks/useWebSocket';

export interface TerminalViewHandle {
  sendInput: (data: string) => void;
  isScrolledUp: boolean;
  scrollToBottom: () => void;
}

interface TerminalViewProps {
  sessionId: string;
  active: boolean;
  fontSize?: number;
  onWsMessage?: (msg: import('../services/ws').WsServerMessage) => void;
  onBinaryData?: (data: ArrayBuffer) => void;
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView({ sessionId, active, fontSize = 14, onWsMessage, onBinaryData }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs so the terminal onData callback always calls the latest functions
  const sendInputRef = useRef<(data: string) => void>(() => {});
  const sendResizeRef = useRef<(cols: number, rows: number) => void>(() => {});
  const inputDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { initTerminal, write, fit, nudge, setFontSize, scrollToBottom, isScrolledUp, terminal: terminalRef2 } = useTerminal({
    onData: (data) => {
      sendInputRef.current(data);
      // Detect Enter key — triggers auto-switch in Dashboard
      if (data.includes('\r') || data.includes('\n')) {
        if (!inputDebounceRef.current) {
          window.dispatchEvent(new CustomEvent('c3:input-sent', { detail: { sessionId } }));
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

  const onBinaryDataRef = useRef(onBinaryData);
  onBinaryDataRef.current = onBinaryData;

  const { connected, sendInput, sendResize } = useWebSocket({
    sessionId,
    enabled: active,
    onBinaryData: useCallback((data: ArrayBuffer) => {
      write(data);
      onBinaryDataRef.current?.(data);
    }, [write]),
    onMessage: useCallback((msg: import('../services/ws').WsServerMessage) => {
      onWsMessageRef.current?.(msg);
    }, []),
  });

  // Keep refs pointing to latest functions
  sendInputRef.current = sendInput;
  sendResizeRef.current = sendResize;

  // Expose handle for parent components (ClaudeActionBar, ScrollToBottomButton)
  useImperativeHandle(ref, () => ({
    sendInput,
    isScrolledUp,
    scrollToBottom,
  }), [sendInput, isScrolledUp, scrollToBottom]);

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
    fit();
    sendResize(terminalRef2.current.cols, terminalRef2.current.rows);

    // After scrollback settles, final fit + nudge + scroll
    const timer = setTimeout(() => {
      if (!terminalRef2.current) return;
      nudge();
      terminalRef2.current.scrollToBottom();
    }, 300);
    return () => clearTimeout(timer);
  }, [connected, fit, sendResize, nudge]);

  useEffect(() => {
    return () => {
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
    };
  }, []);

  // Nudge on grid/layout changes (panel resize, session switch, etc.)
  useEffect(() => {
    const handler = () => setTimeout(() => nudge(), 200);
    window.addEventListener('c3:grid-changed', handler);
    window.addEventListener('c3:panel-resized', handler);
    return () => {
      window.removeEventListener('c3:grid-changed', handler);
      window.removeEventListener('c3:panel-resized', handler);
    };
  }, [nudge]);

  // Update terminal font size when prop changes
  useEffect(() => {
    setFontSize(fontSize);
  }, [fontSize, setFontSize]);


  // tmux copy-mode scroll state
  const [inCopyMode, setInCopyMode] = useState(false);

  const enterCopyMode = useCallback(() => {
    sendInput('\x02['); // Ctrl+B [ → tmux copy mode
    setInCopyMode(true);
  }, [sendInput]);

  const scrollUp = useCallback(() => {
    if (!inCopyMode) {
      sendInput('\x02['); // enter copy mode first
      setInCopyMode(true);
      // Small delay to let tmux process the mode switch before sending PageUp
      setTimeout(() => sendInput('\x1b[5~'), 50); // PageUp
    } else {
      sendInput('\x1b[5~'); // PageUp
    }
  }, [sendInput, inCopyMode]);

  const scrollDown = useCallback(() => {
    if (inCopyMode) {
      sendInput('\x1b[6~'); // PageDown
    }
  }, [sendInput, inCopyMode]);

  const exitCopyMode = useCallback(() => {
    if (inCopyMode) {
      sendInput('q'); // exit tmux copy mode
      setInCopyMode(false);
    }
  }, [sendInput, inCopyMode]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full overscroll-contain"
        style={{ backgroundColor: '#1a1b26' }}
      />
      {/* Scroll controls — tmux copy-mode based.
          Sized for touch on mobile (min 44px tap targets). */}
      <div className="absolute top-1 right-1 z-10 flex gap-1">
        {inCopyMode ? (
          <>
            <button
              onClick={scrollUp}
              title="Scroll up (Page Up)"
              className="p-2 md:p-1 rounded-lg md:rounded bg-blue-600/90 hover:bg-blue-500 active:bg-blue-400 text-white transition-colors shadow-lg md:shadow-none"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10M4 7l4-4 4 4" />
              </svg>
            </button>
            <button
              onClick={scrollDown}
              title="Scroll down (Page Down)"
              className="p-2 md:p-1 rounded-lg md:rounded bg-blue-600/90 hover:bg-blue-500 active:bg-blue-400 text-white transition-colors shadow-lg md:shadow-none"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 13V3M4 9l4 4 4-4" />
              </svg>
            </button>
            <button
              onClick={exitCopyMode}
              title="Exit scroll mode"
              className="p-2 md:p-1 rounded-lg md:rounded bg-amber-600/90 hover:bg-amber-500 active:bg-amber-400 text-white text-sm md:text-xs font-bold transition-colors shadow-lg md:shadow-none"
            >
              ×
            </button>
          </>
        ) : (
          <button
            onClick={scrollUp}
            title="Scroll history (tmux copy mode)"
            className="p-2 md:p-1 rounded-lg md:rounded bg-gray-800/80 hover:bg-gray-700 active:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v10M4 7l4-4 4 4" />
            </svg>
          </button>
        )}
        <button
          onClick={() => nudge()}
          title="Refresh terminal view"
          className="p-2 md:p-1 rounded-lg md:rounded bg-gray-800/80 hover:bg-gray-700 active:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2v4h-4" />
            <path d="M2 14v-4h4" />
            <path d="M13.5 6A6 6 0 0 0 3.8 3.8L2 6" />
            <path d="M2.5 10a6 6 0 0 0 9.7 2.2L14 10" />
          </svg>
        </button>
      </div>
    </div>
  );
});
