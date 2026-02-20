import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectedElement {
  tag: string;
  classes: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  outerHtml?: string;
  computedStyles?: Record<string, string>;
  ancestors?: string[];
  pageUrl?: string;
  pageTitle?: string;
}

export interface UsePreviewBridgeCallbacks {
  onElementSelected?: (element: SelectedElement) => void;
  onElementScreenshot?: (data: { selector: string; dataUrl: string; width: number; height: number }) => void;
  onScreenshotCaptured?: (data: { dataUrl: string; width: number; height: number }) => void;
  onElementsChecked?: (results: Record<string, boolean>) => void;
}

export interface UsePreviewBridgeReturn {
  isReady: boolean;
  inspectMode: boolean;
  selectedElement: SelectedElement | null;
  isRecording: boolean;
  recordingDuration: number;
  recordedEvents: React.MutableRefObject<unknown[]>;
  videoDataUrl: string | null;
  screenshotDataUrl: string | null;
  elementsCheckResult: Record<string, boolean> | null;
  enterInspectMode: () => void;
  exitInspectMode: () => void;
  toggleInspectMode: () => void;
  captureScreenshot: () => void;
  captureElement: (selector: string) => void;
  startRecording: () => void;
  stopRecording: () => void;
  checkElements: (selectors: string[]) => void;
  readPage: () => Promise<Record<string, unknown>>;
  clickElement: (role: string, name: string) => Promise<Record<string, unknown>>;
  typeElement: (role: string, name: string, text: string) => Promise<Record<string, unknown>>;
  navigateTo: (url: string) => Promise<Record<string, unknown>>;
  captureScreenshotWithResult: () => Promise<Record<string, unknown>>;
  stopRecordingWithResult: () => Promise<Record<string, unknown>>;
  sendCommandWithResult: (message: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown>>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePreviewBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  callbacks?: UsePreviewBridgeCallbacks,
): UsePreviewBridgeReturn {
  const [isReady, setIsReady] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [elementsCheckResult, setElementsCheckResult] = useState<Record<string, boolean> | null>(null);

  const recordedEvents = useRef<unknown[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacksRef = useRef(callbacks);

  // Pending bridge command promises (for SessionCard → bridge → result relay)
  const pendingRequests = useRef<Map<string, {
    resolve: (result: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  // Keep callbacks ref in sync without triggering re-renders / effect re-runs
  callbacksRef.current = callbacks;

  // Reset readiness when iframe changes (navigated / reloaded)
  const prevIframeRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const currentIframe = iframeRef.current;
    if (currentIframe !== prevIframeRef.current) {
      prevIframeRef.current = currentIframe;
      setIsReady(false);
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const postMessage = useCallback(
    (message: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(message, '*');
    },
    [iframeRef],
  );

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    setRecordingDuration(0);
    durationTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // ── Message listener ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data.type !== 'string' || !data.type.startsWith('c3:bridge:')) return;

      switch (data.type) {
        case 'c3:bridge:ready':
          setIsReady(true);
          break;

        case 'c3:bridge:elementSelected': {
          const element: SelectedElement = {
            tag: data.tag,
            classes: data.classes,
            selector: data.selector,
            rect: data.rect,
            text: data.text,
            outerHtml: data.outerHtml,
            computedStyles: data.computedStyles,
            ancestors: data.ancestors,
            pageUrl: data.pageUrl,
            pageTitle: data.pageTitle,
          };
          setSelectedElement(element);
          callbacksRef.current?.onElementSelected?.(element);
          break;
        }

        case 'c3:bridge:elementScreenshot':
          callbacksRef.current?.onElementScreenshot?.({
            selector: data.selector,
            dataUrl: data.dataUrl,
            width: data.width,
            height: data.height,
          });
          break;

        case 'c3:bridge:screenshotCaptured':
          setScreenshotDataUrl(data.dataUrl);
          callbacksRef.current?.onScreenshotCaptured?.({
            dataUrl: data.dataUrl,
            width: data.width,
            height: data.height,
          });
          // Also resolve pending request if msgId present
          if (data.msgId && pendingRequests.current.has(data.msgId)) {
            pendingRequests.current.get(data.msgId)!.resolve({
              dataUrl: data.dataUrl,
              width: data.width,
              height: data.height,
            });
            pendingRequests.current.delete(data.msgId);
          }
          break;

        case 'c3:bridge:recordingStarted':
          setIsRecording(true);
          setVideoDataUrl(null);
          startDurationTimer();
          break;

        case 'c3:bridge:recordingEvent':
          recordedEvents.current.push(data.event);
          break;

        case 'c3:bridge:recordingStopped':
        case 'c3:bridge:recordingAutoStopped':
          setIsRecording(false);
          stopDurationTimer();
          if (data.videoDataUrl) {
            setVideoDataUrl(data.videoDataUrl);
          }
          if (data.msgId && pendingRequests.current.has(data.msgId)) {
            pendingRequests.current.get(data.msgId)!.resolve({
              videoDataUrl: data.videoDataUrl,
              durationMs: data.durationMs,
            });
            pendingRequests.current.delete(data.msgId);
          }
          break;

        case 'c3:bridge:pageRead': {
          const msgId = data.msgId;
          if (msgId && pendingRequests.current.has(msgId)) {
            pendingRequests.current.get(msgId)!.resolve({ tree: data.tree });
            pendingRequests.current.delete(msgId);
          }
          break;
        }

        case 'c3:bridge:elementClicked': {
          const msgId = data.msgId;
          if (msgId && pendingRequests.current.has(msgId)) {
            pendingRequests.current.get(msgId)!.resolve({
              ok: data.ok,
              error: data.error,
              available: data.available
            });
            pendingRequests.current.delete(msgId);
          }
          break;
        }

        case 'c3:bridge:elementTyped': {
          const msgId = data.msgId;
          if (msgId && pendingRequests.current.has(msgId)) {
            pendingRequests.current.get(msgId)!.resolve({
              ok: data.ok,
              error: data.error
            });
            pendingRequests.current.delete(msgId);
          }
          break;
        }

        case 'c3:bridge:navigated': {
          const msgId = data.msgId;
          if (msgId && pendingRequests.current.has(msgId)) {
            pendingRequests.current.get(msgId)!.resolve({ ok: data.ok });
            pendingRequests.current.delete(msgId);
          }
          break;
        }

        case 'c3:bridge:elementsChecked':
          setElementsCheckResult(data.results);
          callbacksRef.current?.onElementsChecked?.(data.results);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [startDurationTimer, stopDurationTimer]);

  // ── Cleanup timer on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      // Reject all pending requests
      for (const [, pending] of pendingRequests.current) {
        pending.reject(new Error('Bridge unmounted'));
      }
      pendingRequests.current.clear();
    };
  }, []);

  // ── Command methods ─────────────────────────────────────────────────────

  const enterInspectMode = useCallback(() => {
    postMessage({ type: 'c3:enterInspectMode' });
    setInspectMode(true);
  }, [postMessage]);

  const exitInspectMode = useCallback(() => {
    postMessage({ type: 'c3:exitInspectMode' });
    setInspectMode(false);
    setSelectedElement(null);
  }, [postMessage]);

  const toggleInspectMode = useCallback(() => {
    if (inspectMode) {
      exitInspectMode();
    } else {
      enterInspectMode();
    }
  }, [inspectMode, enterInspectMode, exitInspectMode]);

  const captureScreenshot = useCallback(() => {
    setScreenshotDataUrl(null); // Clear previous so useEffect sees the new one
    postMessage({ type: 'c3:captureScreenshot' });
  }, [postMessage]);

  const captureElement = useCallback(
    (selector: string) => {
      postMessage({ type: 'c3:captureElement', selector });
    },
    [postMessage],
  );

  const startRecording = useCallback(() => {
    recordedEvents.current = [];
    postMessage({ type: 'c3:startRecording' });
  }, [postMessage]);

  const stopRecording = useCallback(() => {
    postMessage({ type: 'c3:stopRecording' });
  }, [postMessage]);

  const checkElements = useCallback(
    (selectors: string[]) => {
      postMessage({ type: 'c3:checkElements', selectors });
    },
    [postMessage],
  );

  /** Send a bridge command and await a Promise-based result (used by SessionCard relay) */
  const sendCommandWithResult = useCallback(
    (message: Record<string, unknown>, timeoutMs = 30000): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const msgId = crypto.randomUUID();
        const timer = setTimeout(() => {
          pendingRequests.current.delete(msgId);
          reject(new Error('Bridge command timed out'));
        }, timeoutMs);

        pendingRequests.current.set(msgId, {
          resolve: (result) => {
            clearTimeout(timer);
            resolve(result);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });

        postMessage({ ...message, msgId });
      });
    },
    [postMessage],
  );

  const readPage = useCallback(
    (): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:readPage' });
    },
    [sendCommandWithResult],
  );

  const clickElement = useCallback(
    (role: string, name: string): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:clickElement', role, name });
    },
    [sendCommandWithResult],
  );

  const typeElement = useCallback(
    (role: string, name: string, text: string): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:typeElement', role, name, text });
    },
    [sendCommandWithResult],
  );

  const navigateTo = useCallback(
    (url: string): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:navigateTo', url }, 15000);
    },
    [sendCommandWithResult],
  );

  /** Capture screenshot and return result as Promise (for board-command relay) */
  const captureScreenshotWithResult = useCallback(
    (): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:captureScreenshot' });
    },
    [sendCommandWithResult],
  );

  /** Stop recording and return result as Promise (for board-command relay) */
  const stopRecordingWithResult = useCallback(
    (): Promise<Record<string, unknown>> => {
      return sendCommandWithResult({ type: 'c3:stopRecording' }, 60000);
    },
    [sendCommandWithResult],
  );

  return {
    isReady,
    inspectMode,
    selectedElement,
    isRecording,
    recordingDuration,
    recordedEvents,
    screenshotDataUrl,
    videoDataUrl,
    elementsCheckResult,
    enterInspectMode,
    exitInspectMode,
    toggleInspectMode,
    captureScreenshot,
    captureElement,
    startRecording,
    stopRecording,
    checkElements,
    readPage,
    clickElement,
    typeElement,
    navigateTo,
    captureScreenshotWithResult,
    stopRecordingWithResult,
    sendCommandWithResult,
  };
}

export default usePreviewBridge;
