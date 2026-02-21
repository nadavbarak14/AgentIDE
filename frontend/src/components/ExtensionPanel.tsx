import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { LoadedExtension, HostToExtensionMessage } from '../services/extension-types';
import { usePostMessageBridge } from '../hooks/usePostMessageBridge';

export interface ExtensionPanelHandle {
  sendToExtension: (message: HostToExtensionMessage) => void;
}

interface ExtensionPanelProps {
  extension: LoadedExtension;
  sessionId: string;
  onClose: () => void;
  onBoardCommand?: (command: string, params: Record<string, string>) => void;
  onSendComment?: (text: string, context: Record<string, string>) => void;
}

export const ExtensionPanel = forwardRef<ExtensionPanelHandle, ExtensionPanelProps>(
  function ExtensionPanel({ extension, sessionId, onClose, onBoardCommand, onSendComment }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { sendToExtension } = usePostMessageBridge({
      iframeRef,
      extensionName: extension.name,
      sessionId,
      onBoardCommand,
      onSendComment,
    });

    // Expose sendToExtension to parent via ref
    useImperativeHandle(ref, () => ({
      sendToExtension,
    }), [sendToExtension]);

    // Listen for ready message to update status
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
        const msg = event.data;
        if (msg?.type === 'ready') {
          console.debug(`[extensions] ${extension.name}: received ready`);
          setStatus('ready');
          if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
          }
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [extension.name]);

    // On iframe load, send a ping so extension re-sends ready (handles race condition)
    const handleIframeLoad = useCallback(() => {
      console.debug(`[extensions] ${extension.name}: iframe onload fired`);
      // Small delay to let iframe scripts initialize
      setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: 'ping' }, '*');
          console.debug(`[extensions] ${extension.name}: sent ping to iframe`);
        }
      }, 100);
    }, [extension.name]);

    // Load timeout
    useEffect(() => {
      if (status !== 'loading') return;
      loadTimeoutRef.current = setTimeout(() => {
        if (status === 'loading') {
          console.warn(`[extensions] ${extension.name}: load timeout (5s)`);
          setStatus('error');
        }
      }, 5000);
      return () => {
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      };
    }, [extension.name, status]);

    const handleRetry = useCallback(() => {
      setStatus('loading');
      if (iframeRef.current && extension.panelUrl) {
        iframeRef.current.src = extension.panelUrl;
      }
    }, [extension.panelUrl]);

    if (!extension.panelUrl) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          This extension has no UI panel
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {status === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <p className="text-sm">Failed to load {extension.displayName}</p>
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Close panel
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={extension.panelUrl}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            title={extension.displayName}
            onLoad={handleIframeLoad}
          />
        )}
      </div>
    );
  },
);
