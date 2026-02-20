import { useEffect, useRef, useCallback, useState } from 'react';
import { useTerminal } from './useTerminal';
import { shell as shellApi, type ShellStatus } from '../services/api';

interface ShellWebSocketState {
  connected: boolean;
  status: ShellStatus;
  shellName: string | null;
}

interface UseShellTerminalOptions {
  sessionId: string;
  enabled?: boolean;
}

export function useShellTerminal({ sessionId, enabled = true }: UseShellTerminalOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const closedRef = useRef(false);

  const [wsState, setWsState] = useState<ShellWebSocketState>({
    connected: false,
    status: 'none',
    shellName: null,
  });

  // Refs for terminal callbacks (avoid reconnections when callbacks change)
  const sendBinaryRef = useRef<(data: ArrayBuffer | Uint8Array) => void>(() => {});
  const sendResizeRef = useRef<(cols: number, rows: number) => void>(() => {});

  const { initTerminal, write, fit, clear, focus, setFontSize } = useTerminal({
    onData: (data) => {
      // Send keyboard input as binary to the shell WebSocket
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        ws.send(encoder.encode(data));
      }
    },
    onResize: (cols, rows) => sendResizeRef.current(cols, rows),
  });

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);
  sendResizeRef.current = sendResize;

  // WebSocket connection to /ws/sessions/:id/shell
  const connectWs = useCallback(() => {
    if (closedRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sessions/${sessionId}/shell`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      reconnectDelayRef.current = 1000;
      setWsState((prev) => ({ ...prev, connected: true }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary: PTY output
        write(event.data);
      } else {
        // JSON: control message
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'shell_status') {
            setWsState((prev) => ({
              ...prev,
              status: msg.status,
              shellName: msg.shell ? msg.shell.split('/').pop() : prev.shellName,
            }));
          }
        } catch {
          // Ignore malformed JSON
        }
      }
    };

    ws.onclose = () => {
      setWsState((prev) => ({ ...prev, connected: false }));
      if (!closedRef.current) {
        // Reconnect with exponential backoff
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
          connectWs();
        }, reconnectDelayRef.current);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    wsRef.current = ws;
  }, [sessionId, write]);

  const disconnectWs = useCallback(() => {
    closedRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Connect/disconnect shell WebSocket based on enabled state
  useEffect(() => {
    if (!enabled || !sessionId) return;

    closedRef.current = false;
    connectWs();

    return () => {
      disconnectWs();
      setWsState({ connected: false, status: 'none', shellName: null });
    };
  }, [sessionId, enabled, connectWs, disconnectWs]);

  // Shell lifecycle API calls
  const openShell = useCallback(async (cols?: number, rows?: number) => {
    const info = await shellApi.open(sessionId, { cols, rows });
    setWsState((prev) => ({
      ...prev,
      status: info.status,
      shellName: info.shell ? info.shell.split('/').pop()! : prev.shellName,
    }));
    return info;
  }, [sessionId]);

  const closeShell = useCallback(async () => {
    await shellApi.close(sessionId);
    setWsState((prev) => ({ ...prev, status: 'killed' }));
  }, [sessionId]);

  return {
    // Terminal
    initTerminal,
    write,
    fit,
    clear,
    focus,
    setFontSize,
    // Shell WebSocket state
    connected: wsState.connected,
    status: wsState.status,
    shellName: wsState.shellName,
    // Shell lifecycle
    openShell,
    closeShell,
  };
}
