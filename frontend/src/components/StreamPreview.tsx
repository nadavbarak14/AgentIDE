import { useState, useRef, useCallback, useEffect } from 'react';

interface StreamPreviewProps {
  sessionId: string;
  status: 'disconnected' | 'connected' | 'unavailable';
  frame: { objectUrl: string; width: number; height: number } | null;
  currentUrl: string;
  onNavigate: (url: string) => void;
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
}: StreamPreviewProps) {
  const [addressInput, setAddressInput] = useState(currentUrl);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep address bar in sync when currentUrl changes externally
  useEffect(() => {
    setAddressInput(currentUrl);
  }, [currentUrl]);

  // Notify parent of container resize
  useEffect(() => {
    if (!containerRef.current || !onResize) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) onResize(Math.round(width), Math.round(height));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onResize]);

  /** Scale img-relative coords to Chrome viewport coords */
  const toViewportCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const img = imgRef.current;
    if (!img || !frame || img.clientWidth === 0 || img.clientHeight === 0) {
      return { x: 0, y: 0 };
    }
    const rect = img.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const x = Math.round((relX / img.clientWidth) * frame.width);
    const y = Math.round((relY / img.clientHeight) * frame.height);
    return { x, y };
  }, [frame]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onMouse?.(x, y, buttonName(e.button), 'move');
  }, [toViewportCoords, onMouse]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onMouse?.(x, y, buttonName(e.button), 'click');
  }, [toViewportCoords, onMouse]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = toViewportCoords(e.clientX, e.clientY);
    onScroll?.(x, y, e.deltaX, e.deltaY);
  }, [toViewportCoords, onScroll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    const mods = modifiersBitmask(e);
    onKey?.(e.key, e.key, e.code, 'down', mods);
  }, [onKey]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    const mods = modifiersBitmask(e);
    onKey?.(e.key, e.key, e.code, 'up', mods);
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
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        ) : (
          /* Connected but no frame yet */
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <p className="text-lg">Connecting...</p>
              <p className="text-sm text-gray-600">Waiting for first frame...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
