import { useState, useRef, useCallback, useEffect } from 'react';
import { PHONE_PRESETS, TABLET_PRESETS, DESKTOP_PRESETS, getPresetById } from '../constants/devicePresets';
import { AnnotationCanvas } from './AnnotationCanvas';

interface StreamPreviewProps {
  sessionId: string;
  status: 'disconnected' | 'connected' | 'unavailable';
  frame: { objectUrl: string; width: number; height: number } | null;
  currentUrl: string;
  onNavigate: (url: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  onClose: () => void;
  onMouse?: (x: number, y: number, button: string, action: string) => void;
  onKey?: (key: string, text: string, code: string, action: string, modifiers?: number) => void;
  onScroll?: (x: number, y: number, deltaX: number, deltaY: number) => void;
  onTouch?: (x: number, y: number, action: string) => void;
  onResize?: (width: number, height: number) => void;
  onScreenshot?: () => void;
  detectedPorts?: { port: number; localPort: number }[];
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  viewport?: 'desktop' | 'mobile' | 'custom' | null;
  selectedDeviceId?: string | null;
  onViewportChange?: (viewport: 'desktop' | 'mobile' | 'custom' | null, deviceId?: string) => void;
}

/** Translate a project:// URL to a server-side serve path */
function toServeUrl(sessionId: string, url: string): string {
  if (url.startsWith('project://')) {
    const filePath = url.replace('project://', '') || '';
    const servePath = filePath === 'local' || filePath === '' ? '' : filePath;
    return `/api/sessions/${sessionId}/serve/${servePath}`;
  }
  return url;
}

/** Map mouse button number to string name */
function buttonName(button: number): string {
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return 'left';
}

/** Compute modifier bitmask: alt=1, ctrl=2, meta=4, shift=8 */
function modifiersBitmask(e: React.KeyboardEvent): number {
  let mods = 0;
  if (e.altKey) mods |= 1;
  if (e.ctrlKey) mods |= 2;
  if (e.metaKey) mods |= 4;
  if (e.shiftKey) mods |= 8;
  return mods;
}

export function StreamPreview({
  sessionId,
  status,
  frame,
  currentUrl,
  onNavigate,
  onBack,
  onForward,
  onClose,
  onMouse,
  onKey,
  onScroll,
  onTouch,
  onResize,
  onScreenshot,
  detectedPorts,
  isFullscreen = false,
  onToggleFullscreen,
  viewport,
  selectedDeviceId,
  onViewportChange,
}: StreamPreviewProps) {
  const [addressInput, setAddressInput] = useState(currentUrl);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const recordingStartRef = useRef<number>(0);
  const [annotating, setAnnotating] = useState(false);
  const [annotationImage, setAnnotationImage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep address bar in sync when currentUrl changes externally
  useEffect(() => {
    setAddressInput(currentUrl);
  }, [currentUrl]);

  // Notify parent of container resize — only in responsive mode (no device preset active)
  useEffect(() => {
    if (!containerRef.current || !onResize || viewport) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) onResize(Math.round(width), Math.round(height));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResize, viewport]);

  // Close device menu when clicking outside
  useEffect(() => {
    if (!showDeviceMenu) return;
    const handleClick = () => setShowDeviceMenu(false);
    // Defer so the opening click doesn't immediately close the menu
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
  }, [showDeviceMenu]);

  /** Scale img-relative coords to Chrome viewport coords, accounting for object-contain */
  const toViewportCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const img = imgRef.current;
    if (!img || !frame || img.clientWidth === 0 || img.clientHeight === 0) {
      return { x: 0, y: 0 };
    }
    const rect = img.getBoundingClientRect();
    // With object-contain, the image may be letterboxed. Calculate the actual rendered image bounds.
    const elemW = rect.width;
    const elemH = rect.height;
    const imgAspect = frame.width / frame.height;
    const elemAspect = elemW / elemH;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (imgAspect > elemAspect) {
      // Image wider than element — horizontal fit, vertical letterbox
      renderW = elemW;
      renderH = elemW / imgAspect;
      offsetX = 0;
      offsetY = (elemH - renderH) / 2;
    } else {
      // Image taller than element — vertical fit, horizontal letterbox
      renderH = elemH;
      renderW = elemH * imgAspect;
      offsetX = (elemW - renderW) / 2;
      offsetY = 0;
    }
    const relX = clientX - rect.left - offsetX;
    const relY = clientY - rect.top - offsetY;
    const x = Math.round((relX / renderW) * frame.width);
    const y = Math.round((relY / renderH) * frame.height);
    return { x: Math.max(0, Math.min(frame.width, x)), y: Math.max(0, Math.min(frame.height, y)) };
  }, [frame]);

  // Throttle mouse move to avoid flooding the WebSocket
  const lastMoveRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    overlayRef.current?.focus();
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onMouse?.(x, y, buttonName(e.button), 'down');
  }, [toViewportCoords, onMouse]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onMouse?.(x, y, buttonName(e.button), 'up');
  }, [toViewportCoords, onMouse]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Throttle to ~30fps to avoid flooding
    const now = Date.now();
    if (now - lastMoveRef.current < 33) return;
    lastMoveRef.current = now;
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    // Send which button is held during drag (needed for text selection)
    const btn = e.buttons === 1 ? 'left' : e.buttons === 2 ? 'right' : 'none';
    onMouse?.(x, y, btn, 'move');
  }, [toViewportCoords, onMouse]);

  // Don't send separate click — mouseDown+mouseUp already handles it in CDP
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onScroll?.(x, y, e.deltaX, e.deltaY);
  }, [toViewportCoords, onScroll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const mods = modifiersBitmask(e);
    // CDP text should only be the printable character, empty for special keys
    const text = e.key.length === 1 ? e.key : '';
    onKey?.(e.key, text, e.code, 'down', mods);
  }, [onKey]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const mods = modifiersBitmask(e);
    onKey?.(e.key, '', e.code, 'up', mods);
  }, [onKey]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = toViewportCoords(touch.clientX, touch.clientY);
    onTouch?.(x, y, 'start');
  }, [toViewportCoords, onTouch]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const { x, y } = toViewportCoords(touch.clientX, touch.clientY);
    onTouch?.(x, y, 'move');
  }, [toViewportCoords, onTouch]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;
    const { x, y } = toViewportCoords(touch.clientX, touch.clientY);
    onTouch?.(x, y, 'end');
  }, [toViewportCoords, onTouch]);

  // ── Recording ──
  const startRecording = useCallback(() => {
    if (!frame) return;
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvasRef.current = canvas;
    recordingStartRef.current = Date.now();
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      const durationMs = Date.now() - recordingStartRef.current;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const videoDataUrl = reader.result as string;
        try {
          const resp = await fetch(`/api/sessions/${sessionId}/recordings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoDataUrl,
              durationMs,
              pageUrl: currentUrl,
              viewportWidth: frame?.width,
              viewportHeight: frame?.height,
            }),
          });
          if (resp.ok) {
            const { id: recordingId } = await resp.json();
            await fetch(`/api/sessions/${sessionId}/recordings/${recordingId}/deliver`, { method: 'POST' });
          }
        } catch { /* ignore save errors */ }
      };
      reader.readAsDataURL(blob);
      canvasRef.current = null;
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    recordingStartRef.current = Date.now();
  }, [frame, sessionId, currentUrl]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  // Paint frames to recording canvas continuously via rAF
  useEffect(() => {
    if (!recording) return;
    let rafId: number;
    const paint = () => {
      if (!canvasRef.current || !imgRef.current) { rafId = requestAnimationFrame(paint); return; }
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        try { ctx.drawImage(imgRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height); } catch { /* cross-origin */ }
      }
      rafId = requestAnimationFrame(paint);
    };
    rafId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(rafId);
  }, [recording]);

  // ── Annotation ──
  const startAnnotation = useCallback(async () => {
    if (!frame) return;
    try {
      const resp = await fetch(frame.objectUrl);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setAnnotationImage(reader.result as string);
        setAnnotating(true);
      };
      reader.readAsDataURL(blob);
    } catch { /* ignore */ }
  }, [frame]);

  const handleAnnotationSave = useCallback(async (annotatedDataUrl: string) => {
    setAnnotating(false);
    setAnnotationImage(null);
    try {
      const resp = await fetch(`/api/sessions/${sessionId}/preview-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText: 'See this annotated screenshot — please review and address the marked areas.',
          screenshotDataUrl: annotatedDataUrl,
          pageUrl: currentUrl,
          pinX: 0,
          pinY: 0,
          viewportWidth: frame?.width,
          viewportHeight: frame?.height,
        }),
      });
      if (resp.ok) {
        // Auto-deliver all pending comments to the agent
        await fetch(`/api/sessions/${sessionId}/preview-comments/deliver`, { method: 'POST' });
      }
    } catch { /* ignore */ }
  }, [sessionId, currentUrl, frame]);

  const handleAnnotationCancel = useCallback(() => {
    setAnnotating(false);
    setAnnotationImage(null);
  }, []);

  const handleNavigate = useCallback(() => {
    let url = addressInput.trim();
    if (!url) return;
    if (!url.startsWith('http') && !url.startsWith('project://') && !url.startsWith('/')) {
      url = `http://${url}`;
    }
    const resolved = toServeUrl(sessionId, url);
    onNavigate(resolved === url ? url : resolved);
  }, [addressInput, sessionId, onNavigate]);

  const handlePortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const port = Number(e.target.value);
    if (!port) return;
    const url = `http://localhost:${port}`;
    onNavigate(url);
  }, [onNavigate]);

  const handleReload = useCallback(() => {
    if (currentUrl) onNavigate(currentUrl);
  }, [currentUrl, onNavigate]);

  return (
    <div className="flex flex-col h-full">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-700 bg-gray-800 flex-shrink-0">
        {/* Back button */}
        <button
          onClick={onBack}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Back"
          disabled={!onBack}
        >
          &#9664;
        </button>
        {/* Forward button */}
        <button
          onClick={onForward}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Forward"
          disabled={!onForward}
        >
          &#9654;
        </button>
        {/* Reload button */}
        <button
          onClick={handleReload}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Reload"
        >
          &#8635;
        </button>

        {/* Address bar */}
        <div className="flex-1 flex items-center bg-gray-900 border border-gray-600 rounded-md px-2 py-0.5 min-w-0 focus-within:border-blue-500">
          <span className="text-gray-500 text-xs mr-1 flex-shrink-0">
            {addressInput.startsWith('project://') ? '\uD83D\uDCC1' : '\uD83D\uDD12'}
          </span>
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            className="flex-1 bg-transparent text-xs text-gray-300 outline-none min-w-0"
            placeholder="http://localhost:3000 or project://index.html"
            spellCheck={false}
          />
        </div>

        {/* Port selector */}
        {detectedPorts && detectedPorts.length > 1 && (
          <select
            value=""
            onChange={handlePortChange}
            className="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300"
          >
            <option value="" disabled>Port</option>
            {detectedPorts.map((p) => (
              <option key={p.localPort} value={p.localPort}>
                :{p.port}
              </option>
            ))}
          </select>
        )}

        {/* Screenshot button */}
        {onScreenshot && (
          <button
            onClick={onScreenshot}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
            title="Take screenshot"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        )}

        {/* Record button */}
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`w-6 h-6 flex items-center justify-center rounded text-sm ${
            recording ? 'text-red-400 bg-red-500/20 animate-pulse' : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title={recording ? 'Stop recording' : 'Start recording'}
          disabled={!frame}
        >
          {recording ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>
          )}
        </button>

        {/* Annotate button */}
        <button
          onClick={startAnnotation}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Annotate screenshot"
          disabled={!frame}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>

        {/* Fullscreen toggle */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        )}

        {/* Device selector */}
        <div className="relative">
          <button
            onClick={() => setShowDeviceMenu(!showDeviceMenu)}
            className={`h-6 flex items-center gap-0.5 px-1 text-xs rounded ${
              viewport === 'mobile' ? 'text-blue-400 bg-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="Device viewport"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            {viewport === 'mobile' && selectedDeviceId && (
              <span className="max-w-[60px] truncate">{getPresetById(selectedDeviceId)?.name?.split(' ').slice(-1)[0] || ''}</span>
            )}
          </button>
          {showDeviceMenu && (
            <div className="absolute right-0 top-7 z-50 w-52 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 max-h-72 overflow-y-auto">
              <button
                onClick={() => { onViewportChange?.(null); setShowDeviceMenu(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 ${!viewport ? 'text-blue-400' : 'text-gray-300'}`}
              >
                Responsive (fit)
              </button>
              <div className="border-t border-gray-700 my-1" />
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Phones</div>
              {PHONE_PRESETS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { onViewportChange?.('mobile', d.id); setShowDeviceMenu(false); }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-700 ${selectedDeviceId === d.id ? 'text-blue-400' : 'text-gray-300'}`}
                >
                  {d.name} <span className="text-gray-500">{d.width}x{d.height}</span>
                </button>
              ))}
              <div className="border-t border-gray-700 my-1" />
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Tablets</div>
              {TABLET_PRESETS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { onViewportChange?.('mobile', d.id); setShowDeviceMenu(false); }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-700 ${selectedDeviceId === d.id ? 'text-blue-400' : 'text-gray-300'}`}
                >
                  {d.name} <span className="text-gray-500">{d.width}x{d.height}</span>
                </button>
              ))}
              <div className="border-t border-gray-700 my-1" />
              <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Desktop</div>
              {DESKTOP_PRESETS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { onViewportChange?.('desktop', d.id); setShowDeviceMenu(false); }}
                  className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-700 ${selectedDeviceId === d.id ? 'text-blue-400' : 'text-gray-300'}`}
                >
                  {d.name} <span className="text-gray-500">{d.width}x{d.height}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Viewport content */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-950">
        {status === 'unavailable' ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <p className="text-lg">No browser active</p>
              <p className="text-sm text-gray-600">Chrome is not running in this session</p>
            </div>
          </div>
        ) : status === 'disconnected' ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <p className="text-lg">Connecting...</p>
              <p className="text-sm text-gray-600">Waiting for preview connection</p>
            </div>
          </div>
        ) : frame ? (
          /* Streaming frame */
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              ref={imgRef}
              src={frame.objectUrl}
              alt="Browser preview"
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
            {/* Input overlay — covers the img for capturing mouse/keyboard/touch */}
            <div
              ref={overlayRef}
              tabIndex={0}
              className="absolute inset-0 outline-none cursor-default"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              onWheel={handleWheel}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onContextMenu={(e) => {
                e.preventDefault();
                // Forward right-click to Chrome
                const { x, y } = toViewportCoords(e.clientX, e.clientY);
                onMouse?.(x, y, 'right', 'down');
                onMouse?.(x, y, 'right', 'up');
              }}
            />
          </div>
        ) : (
          /* Connected but no frame yet */
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <p className="text-lg">Browser ready</p>
              <p className="text-sm text-gray-600">Enter a URL in the address bar above to start browsing</p>
            </div>
          </div>
        )}

        {/* Annotation overlay */}
        {annotating && annotationImage && (
          <div className="absolute inset-0 z-50 bg-gray-950">
            <AnnotationCanvas
              imageDataUrl={annotationImage}
              onSave={handleAnnotationSave}
              onCancel={handleAnnotationCancel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
