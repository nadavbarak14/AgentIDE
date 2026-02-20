import { useState, useEffect, useRef, useCallback } from 'react';
import { usePreviewBridge, type UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import { PreviewOverlay } from './PreviewOverlay';

type ViewportMode = 'desktop' | 'mobile' | 'custom';

interface LivePreviewProps {
  sessionId: string;
  port: number;
  localPort: number;
  detectedPorts?: { port: number; localPort: number }[];
  onClose: () => void;
  refreshKey?: number;
  viewportMode?: ViewportMode;
  onViewportChange?: (mode: ViewportMode) => void;
  customViewportWidth?: number | null;
  customViewportHeight?: number | null;
  onCustomViewport?: (width: number, height: number) => void;
  bridgeRef?: React.MutableRefObject<UsePreviewBridgeReturn | null>;
}

/** Convert a user-facing URL to a proxy URL that the backend can reach */
function toProxyUrl(sessionId: string, displayUrl: string): string {
  // project:// scheme — serve local files
  if (displayUrl.startsWith('project://')) {
    const filePath = displayUrl.replace('project://', '') || '';
    const servePath = filePath === 'local' || filePath === '' ? '' : filePath;
    return `/api/sessions/${sessionId}/serve/${servePath}`;
  }

  // localhost URLs — proxy through backend so browser can reach them
  const localhostMatch = displayUrl.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/);
  if (localhostMatch) {
    const port = localhostMatch[1];
    const pathPart = localhostMatch[2] || '/';
    return `/api/sessions/${sessionId}/proxy/${port}${pathPart}`;
  }

  // External URLs — proxy to strip X-Frame-Options/CSP so they can embed in iframe
  if (displayUrl.startsWith('http://') || displayUrl.startsWith('https://')) {
    return `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(displayUrl)}`;
  }

  return displayUrl;
}

export function LivePreview({ sessionId, port, localPort, detectedPorts, onClose, refreshKey = 0, viewportMode = 'desktop', onViewportChange, customViewportWidth, customViewportHeight, onCustomViewport, bridgeRef }: LivePreviewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [customW, setCustomW] = useState(String(customViewportWidth || 1024));
  const [customH, setCustomH] = useState(String(customViewportHeight || 768));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });

  // Preview bridge for inspect mode, screenshots, and recordings
  const bridge = usePreviewBridge(iframeRef);

  // Expose bridge to parent via ref (for board command relay in SessionCard)
  useEffect(() => {
    if (bridgeRef) bridgeRef.current = bridge;
    return () => { if (bridgeRef) bridgeRef.current = null; };
  }, [bridge, bridgeRef]);

  // Track content area size for overlay positioning
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  // displayUrl is what the user sees. Empty string = no content loaded yet.
  const detectedUrl = (localPort || port) > 0 ? `http://localhost:${localPort || port}` : '';
  const [displayUrl, setDisplayUrl] = useState(detectedUrl);
  const [addressInput, setAddressInput] = useState(detectedUrl || 'http://localhost:3000');

  // Compute the iframe URL from displayUrl
  const iframeUrl = displayUrl ? toProxyUrl(sessionId, displayUrl) : '';

  // Navigate the iframe to a URL (sets both state and iframe.src directly)
  const navigateTo = useCallback((url: string) => {
    setDisplayUrl(url);
    setAddressInput(url);
    setLoading(true);
    setError(false);
    setStopped(false);

    // Directly set iframe src — don't rely on React re-render
    const proxyUrl = toProxyUrl(sessionId, url);
    if (iframeRef.current) {
      iframeRef.current.src = proxyUrl;
    }
  }, [sessionId]);

  // Update when detected port changes
  useEffect(() => {
    if (localPort > 0 || port > 0) {
      navigateTo(`http://localhost:${localPort || port}`);
    }
  }, [port, localPort, navigateTo]);

  // Handle file changes — reload iframe
  useEffect(() => {
    if (refreshKey > 0 && iframeRef.current && iframeUrl) {
      const separator = iframeUrl.includes('?') ? '&' : '?';
      iframeRef.current.src = `${iframeUrl}${separator}_t=${Date.now()}`;
    }
  }, [refreshKey, iframeUrl]);

  // When the iframe navigates (internal link clicks, redirects), update the address bar
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    try {
      const iframeLoc = iframeRef.current?.contentWindow?.location;
      if (!iframeLoc) return;
      const path = iframeLoc.pathname;
      // Extract the real path from proxy URL: /api/sessions/{id}/proxy/{port}/path...
      const proxyMatch = path.match(/\/api\/sessions\/[^/]+\/proxy\/(\d+)(\/.*)?$/);
      if (proxyMatch) {
        const proxyPort = proxyMatch[1];
        const pagePath = proxyMatch[2] || '/';
        const search = iframeLoc.search || '';
        const hash = iframeLoc.hash || '';
        const realUrl = `http://localhost:${proxyPort}${pagePath}${search}${hash}`;
        setDisplayUrl(realUrl);
        setAddressInput(realUrl);
      }
    } catch (_e) {
      // Cross-origin — can't read iframe location, ignore
    }
  }, []);

  const handleReload = useCallback(() => {
    if (iframeRef.current && iframeUrl) {
      setLoading(true);
      setError(false);
      const separator = iframeUrl.includes('?') ? '&' : '?';
      iframeRef.current.src = `${iframeUrl}${separator}_t=${Date.now()}`;
    }
  }, [iframeUrl]);

  const handleNavigate = useCallback(() => {
    if (!addressInput.trim()) return;
    let url = addressInput.trim();
    if (!url.startsWith('http') && !url.startsWith('project://') && !url.startsWith('/')) {
      url = `http://${url}`;
    }
    navigateTo(url);
  }, [addressInput, navigateTo]);

  const handlePortChange = useCallback((newPort: number) => {
    navigateTo(`http://localhost:${newPort}`);
  }, [navigateTo]);

  const handleLocalPreview = useCallback(() => {
    navigateTo('project://index.html');
  }, [navigateTo]);

  const handleApplyCustom = useCallback(() => {
    const w = parseInt(customW, 10);
    const h = parseInt(customH, 10);
    if (w > 0 && w <= 4096 && h > 0 && h <= 4096) {
      onCustomViewport?.(w, h);
    }
  }, [customW, customH, onCustomViewport]);

  const noContent = !displayUrl;

  return (
    <div className="flex flex-col h-full">
      {/* Browser chrome — address bar + controls */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-700 bg-gray-800 flex-shrink-0">
        {/* Reload */}
        <button
          onClick={handleReload}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Reload"
        >
          ↻
        </button>
        {/* Address bar */}
        <div className="flex-1 flex items-center bg-gray-900 border border-gray-600 rounded-md px-2 py-0.5 min-w-0 focus-within:border-blue-500">
          <span className="text-gray-500 text-xs mr-1 flex-shrink-0">
            {addressInput.startsWith('project://') ? '📁' : '🔒'}
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
        {/* Viewport toggle */}
        <div className="flex rounded overflow-hidden border border-gray-700">
          <button
            onClick={() => onViewportChange?.('desktop')}
            className={`px-1.5 py-0.5 text-xs ${
              viewportMode === 'desktop'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Desktop viewport"
          >
            🖥
          </button>
          <button
            onClick={() => onViewportChange?.('mobile')}
            className={`px-1.5 py-0.5 text-xs ${
              viewportMode === 'mobile'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Mobile viewport (375px)"
          >
            📱
          </button>
          <button
            onClick={() => viewportMode === 'custom' ? onViewportChange?.('desktop') : handleApplyCustom()}
            className={`px-1.5 py-0.5 text-xs ${
              viewportMode === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Custom viewport"
          >
            ⊞
          </button>
        </div>
        {/* Custom resolution inputs */}
        {viewportMode === 'custom' && (
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyCustom()}
              className="w-12 text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center"
              min={100}
              max={4096}
            />
            <span className="text-gray-500 text-xs">x</span>
            <input
              type="number"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyCustom()}
              className="w-12 text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center"
              min={100}
              max={4096}
            />
          </div>
        )}
        {/* Port selector */}
        {detectedPorts && detectedPorts.length > 1 && (
          <select
            value=""
            onChange={(e) => handlePortChange(Number(e.target.value))}
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
        <a
          href={iframeUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm"
          title="Open in new tab"
        >
          ↗
        </a>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 rounded text-sm">×</button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 relative overflow-hidden">
        {stopped ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <div className="text-center">
              <p className="text-lg">Server stopped</p>
              <p className="text-sm mt-1">The dev server is no longer running</p>
            </div>
          </div>
        ) : noContent ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <div className="text-center space-y-3">
              <p className="text-lg">No server detected</p>
              <p className="text-sm">Enter a URL in the address bar and press Enter</p>
              <p className="text-xs text-gray-600">localhost URLs are proxied through the server automatically</p>
              <button
                onClick={handleLocalPreview}
                className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
              >
                Preview project files
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Preview overlay for inspect mode and comment pins */}
            {!noContent && !stopped && contentSize.width > 0 && (
              <PreviewOverlay
                sessionId={sessionId}
                bridge={bridge}
                containerWidth={contentSize.width}
                containerHeight={contentSize.height}
              />
            )}
            {loading && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 z-10">
                Loading preview...
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 z-10">
                <div className="text-center">
                  <p className="text-lg">Unable to load preview</p>
                  <p className="text-sm mt-1">The server may have stopped or the page blocks embedding</p>
                  <a
                    href={iframeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-2 inline-block"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>
            )}
            {viewportMode === 'mobile' ? (
              <div className="flex justify-center items-start h-full bg-gray-950 p-4 overflow-auto">
                <div className="border-2 border-gray-500 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col bg-black flex-shrink-0" style={{ width: 360 }}>
                  {/* Notch */}
                  <div className="h-7 bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <div className="w-20 h-4 bg-black rounded-full" />
                  </div>
                  <iframe
                    ref={iframeRef}
                    src={iframeUrl}
                    className="border-0 bg-white flex-shrink-0"
                    style={{ width: 360, height: 640 }}
                    onLoad={handleIframeLoad}
                    onError={() => { setError(true); setLoading(false); }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  {/* Home indicator */}
                  <div className="h-5 bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <div className="w-24 h-1 bg-gray-600 rounded-full" />
                  </div>
                </div>
              </div>
            ) : viewportMode === 'custom' && customViewportWidth && customViewportHeight ? (
              <div className="flex justify-center items-start h-full bg-gray-950 p-2 overflow-auto">
                <div className="relative flex-shrink-0" style={{
                  width: customViewportWidth,
                  height: customViewportHeight,
                  transform: contentSize.width > 0 && customViewportWidth > contentSize.width
                    ? `scale(${Math.min(contentSize.width / customViewportWidth, (contentSize.height - 24) / customViewportHeight)})`
                    : undefined,
                  transformOrigin: 'top center',
                }}>
                  <iframe
                    ref={iframeRef}
                    src={iframeUrl}
                    className="border border-gray-600 bg-white"
                    style={{ width: customViewportWidth, height: customViewportHeight }}
                    onLoad={handleIframeLoad}
                    onError={() => { setError(true); setLoading(false); }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  <div className="text-center text-xs text-gray-500 mt-1">
                    {customViewportWidth} x {customViewportHeight}
                  </div>
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={iframeUrl}
                className="w-full h-full border-0"
                onLoad={handleIframeLoad}
                onError={() => { setError(true); setLoading(false); }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
