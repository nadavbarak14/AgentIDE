import { useState, useCallback, useRef, useEffect } from 'react';
import { PreviewWebSocket, type PreviewServerMessage } from '../services/preview-ws';

interface FrameState {
  objectUrl: string;
  width: number;
  height: number;
}

export function useStreamPreview(sessionId: string, enabled: boolean) {
  const wsRef = useRef<PreviewWebSocket | null>(null);
  const [frame, setFrame] = useState<FrameState | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'unavailable'>('disconnected');
  const [currentUrl, setCurrentUrl] = useState('');
  const prevObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const ws = new PreviewWebSocket(sessionId, {
      onFrame: (data: ArrayBuffer) => {
        if (data.byteLength < 8) return;
        const view = new DataView(data);
        const width = view.getUint32(0);
        const height = view.getUint32(4);
        const jpegBytes = data.slice(8);
        const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(blob);
        if (prevObjectUrl.current) URL.revokeObjectURL(prevObjectUrl.current);
        prevObjectUrl.current = objectUrl;
        setFrame({ objectUrl, width, height });
      },
      onMessage: (msg: PreviewServerMessage) => {
        if (msg.type === 'preview:status') setStatus(msg.status);
        else if (msg.type === 'preview:url') setCurrentUrl(msg.url);
      },
      onOpen: () => {
        ws.sendJson({ type: 'preview:start' });
      },
      onClose: () => setStatus('disconnected'),
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.sendJson({ type: 'preview:stop' });
      ws.disconnect();
      wsRef.current = null;
      if (prevObjectUrl.current) URL.revokeObjectURL(prevObjectUrl.current);
      prevObjectUrl.current = null;
      setFrame(null);
      setStatus('disconnected');
    };
  }, [sessionId, enabled]);

  const navigate = useCallback((url: string) => {
    wsRef.current?.sendJson({ type: 'preview:navigate', url });
    setCurrentUrl(url);
  }, []);

  const sendMouse = useCallback((x: number, y: number, button: string, action: string) => {
    wsRef.current?.sendJson({ type: 'preview:mouse', x, y, button, action });
  }, []);

  const sendKey = useCallback((key: string, text: string, code: string, action: string, modifiers?: number) => {
    wsRef.current?.sendJson({ type: 'preview:key', key, text, code, action, modifiers });
  }, []);

  const sendScroll = useCallback((x: number, y: number, deltaX: number, deltaY: number) => {
    wsRef.current?.sendJson({ type: 'preview:scroll', x, y, deltaX, deltaY });
  }, []);

  const sendResize = useCallback((width: number, height: number) => {
    wsRef.current?.sendJson({ type: 'preview:resize', width, height });
  }, []);

  const sendTouch = useCallback((x: number, y: number, action: string) => {
    wsRef.current?.sendJson({ type: 'preview:touch', x, y, action });
  }, []);

  return { frame, status, currentUrl, navigate, sendMouse, sendKey, sendScroll, sendResize, sendTouch };
}
