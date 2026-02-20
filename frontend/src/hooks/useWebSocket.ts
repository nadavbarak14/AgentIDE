import { useEffect, useRef, useCallback, useState } from 'react';
import { SessionWebSocket, type WsServerMessage } from '../services/ws';

interface UseWebSocketOptions {
  sessionId: string;
  enabled?: boolean;
  onBinaryData?: (data: ArrayBuffer) => void;
  onMessage?: (msg: WsServerMessage) => void;
  onReconnect?: () => void;
}

export function useWebSocket({ sessionId, enabled = true, onBinaryData, onMessage, onReconnect }: UseWebSocketOptions) {
  const wsRef = useRef<SessionWebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const ws = new SessionWebSocket({
      sessionId,
      onBinaryData: (data) => onBinaryData?.(data),
      onMessage: (msg) => onMessage?.(msg),
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onReconnect: () => onReconnect?.(),
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
      wsRef.current = null;
      setConnected(false);
    };
  }, [sessionId, enabled]); // intentionally not including callbacks to avoid reconnections

  const sendInput = useCallback((data: string) => {
    wsRef.current?.sendInput(data);
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer | Uint8Array) => {
    wsRef.current?.sendBinary(data);
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    wsRef.current?.sendResize(cols, rows);
  }, []);

  return { connected, sendInput, sendBinary, sendResize };
}
