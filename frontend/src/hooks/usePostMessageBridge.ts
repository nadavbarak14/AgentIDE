import { useEffect, useCallback, useRef } from 'react';
import type {
  HostToExtensionMessage,
  ExtensionToHostMessage,
} from '../services/extension-types';

interface UsePostMessageBridgeOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  extensionName: string;
  sessionId: string;
  onBoardCommand?: (command: string, params: Record<string, string>) => void;
  onSendComment?: (text: string, context: Record<string, string>) => void;
}

export function usePostMessageBridge({
  iframeRef,
  extensionName,
  sessionId,
  onBoardCommand,
  onSendComment,
}: UsePostMessageBridgeOptions) {
  const readyRef = useRef(false);

  const sendToExtension = useCallback((message: HostToExtensionMessage) => {
    if (!iframeRef.current?.contentWindow) {
      console.warn(`[extensions] ${extensionName}: cannot send — iframe not available`);
      return;
    }
    iframeRef.current.contentWindow.postMessage(message, '*');
    console.debug(`[extensions] ${extensionName}: sent`, message.type);
  }, [iframeRef, extensionName]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate source is our iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      const msg = event.data as ExtensionToHostMessage;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        console.warn(`[extensions] ${extensionName}: malformed message`, event.data);
        return;
      }

      switch (msg.type) {
        case 'ready':
          readyRef.current = true;
          // Send init message
          sendToExtension({
            type: 'init',
            sessionId,
            extensionName,
          });
          console.debug(`[extensions] ${extensionName}: ready, sent init`);
          break;

        case 'board-command':
          if (typeof msg.command === 'string' && msg.params && typeof msg.params === 'object') {
            console.debug(`[extensions] ${extensionName}: board-command`, msg.command);
            onBoardCommand?.(msg.command, msg.params);
          } else {
            console.warn(`[extensions] ${extensionName}: malformed board-command`, msg);
          }
          break;

        case 'send-comment':
          if (typeof msg.text === 'string') {
            console.debug(`[extensions] ${extensionName}: send-comment`);
            onSendComment?.(msg.text, msg.context ?? {});
          } else {
            console.warn(`[extensions] ${extensionName}: malformed send-comment`, msg);
          }
          break;

        default:
          // Unknown message type — ignore silently
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      readyRef.current = false;
    };
  }, [iframeRef, extensionName, sessionId, sendToExtension, onBoardCommand, onSendComment]);

  return { sendToExtension, isReady: readyRef };
}
