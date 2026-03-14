import { useState, useEffect, useRef, useCallback } from 'react';
import { usePreviewBridge, type UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import { PreviewOverlay } from './PreviewOverlay';
import { BRANDS, getPresetsByBrand, getPresetById, DESKTOP_PRESETS, type DevicePreset } from '../constants/devicePresets';

type ViewportMode = 'desktop' | 'mobile' | 'custom';

// Minimum scale floor for desktop/custom viewports to prevent unreadably small previews
const MIN_VIEWPORT_SCALE = 0.35;

interface LivePreviewProps {
  sessionId: string;
  port: number;
  localPort: number;
  detectedPorts?: { port: number; localPort: number }[];
  onClose: () => void;
  refreshKey?: number;
  viewportMode?: ViewportMode | null;
  onViewportChange?: (mode: ViewportMode | null) => void;
  customViewportWidth?: number | null;
  customViewportHeight?: number | null;
  onCustomViewport?: (width: number, height: number) => void;
  selectedDeviceId?: string | null;
  onDevicePresetSelect?: (id: string) => void;
  selectedDesktopId?: string | null;
  onDesktopPresetSelect?: (id: string) => void;
  bridgeRef?: React.MutableRefObject<UsePreviewBridgeReturn | null>;
  /** URL requested externally (e.g. open-preview skill). Takes priority over detected port. */
  requestedUrl?: string;
  /** Bumped each time an external navigation is requested, to force re-nav even for same URL. */
  navCounter?: number;
  /** Callback to save the URL when user navigates (to persist state across sessions) */
  onUrlChange?: (url: string) => void;
  /** When true, the session runs on a local worker (not remote). */
  isLocalSession?: boolean;
  /** When true, force desktop viewport mode and hide viewport toggles */
  isMobile?: boolean;
}

/** Convert a user-facing URL to a proxy URL that the backend can reach */
export function toProxyUrl(sessionId: string, displayUrl: string, isLocalDirect: boolean): string {
  // project:// scheme — serve local files
  if (displayUrl.startsWith('project://')) {
    const filePath = displayUrl.replace('project://', '') || '';
    const servePath = filePath === 'local' || filePath === '' ? '' : filePath;
    return `/api/sessions/${sessionId}/serve/${servePath}`;
  }

  // localhost URLs (case-insensitive — mobile browsers may capitalize "Localhost")
  const localhostMatch = displayUrl.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/i);
  if (localhostMatch) {
    const port = localhostMatch[1];
    const pathPart = localhostMatch[2] || '/';
    // Skip proxy when hub is accessed via localhost and session is local —
    // UNLESS the target port is the hub itself (which sets X-Frame-Options: DENY
    // and would block the iframe if loaded directly).
    const isSelfReferential = port === window.location.port;
    if (isLocalDirect && !isSelfReferential) {
      return displayUrl;
    }
    // Otherwise proxy through backend so the browser can reach them
    return `/api/sessions/${sessionId}/proxy/${port}${pathPart}`;
  }

  // Same-host URLs: when the dashboard is accessed via a non-localhost address (public IP,
  // LAN IP, domain name), the preview URL is constructed as http://<that-host>:<port>.
  // This must use the port-based proxy (which connects to localhost on the server), NOT the
  // proxy-url route (which would try to connect to the external address and may fail due to
  // SSRF protection blocking private IPs, or the dev server not being reachable on that address).
  const currentHost = window.location.hostname;
  if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    const hostEscaped = currentHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sameHostMatch = displayUrl.match(new RegExp(`^https?:\\/\\/${hostEscaped}:(\\d+)(\\/.*)?$`));
    if (sameHostMatch) {
      const port = sameHostMatch[1];
      const pathPart = sameHostMatch[2] || '/';
      return `/api/sessions/${sessionId}/proxy/${port}${pathPart}`;
    }
  }

  // External URLs — proxy to strip X-Frame-Options/CSP so they can embed in iframe
  if (displayUrl.startsWith('http://') || displayUrl.startsWith('https://')) {
    return `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(displayUrl)}`;
  }

  return displayUrl;
}

export function LivePreview({ sessionId, port, localPort, detectedPorts, onClose, refreshKey: _refreshKey = 0, viewportMode = null as ViewportMode | null, onViewportChange, customViewportWidth, customViewportHeight, onCustomViewport, selectedDeviceId, onDevicePresetSelect, selectedDesktopId, onDesktopPresetSelect, bridgeRef, requestedUrl, onUrlChange, navCounter: _navCounter = 0, isLocalSession = true, isMobile: _isMobile = false }: LivePreviewProps) {
  // Skip proxy when hub is accessed via localhost and session is local
  const isLocalDirect = isLocalSession &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [customW, setCustomW] = useState(String(customViewportWidth || 1024));
  const [customH, setCustomH] = useState(String(customViewportHeight || 768));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const deviceDropdownRef = useRef<HTMLDivElement>(null);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const [rotated, setRotated] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Escape key handler for fullscreen exit
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Click-outside and Escape handler for device dropdown
  useEffect(() => {
    if (!deviceDropdownOpen && !desktopDropdownOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (deviceDropdownOpen && deviceDropdownRef.current && !deviceDropdownRef.current.contains(e.target as Node)) {
        setDeviceDropdownOpen(false);
      }
      if (desktopDropdownOpen && desktopDropdownRef.current && !desktopDropdownRef.current.contains(e.target as Node)) {
        setDesktopDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDeviceDropdownOpen(false); setDesktopDropdownOpen(false); }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [deviceDropdownOpen, desktopDropdownOpen]);

  // Resolve the active device preset
  const brandGroups = getPresetsByBrand();
  const activeDevice: DevicePreset = (selectedDeviceId ? getPresetById(selectedDeviceId) : null) || brandGroups[BRANDS[0]][0];

  // Resolve the active desktop preset
  const activeDesktop: DevicePreset = (selectedDesktopId ? getPresetById(selectedDesktopId) : null) || DESKTOP_PRESETS[3]; // default 1080p

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

  // Listen for URL change messages from injected proxy client script
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'c3:proxy:urlchange') return;
      const path = event.data.path as string;
      if (!path) return;

      // Reconstruct the display URL from the clean path
      const portMatch = currentDisplayUrlRef.current.match(/:(\d+)/);
      const urlPort = portMatch ? portMatch[1] : String(port);
      const realUrl = `http://localhost:${urlPort}${path}`;

      setDisplayUrl((prev) => prev === realUrl ? prev : realUrl);
      setAddressInput((prev) => prev === realUrl ? prev : realUrl);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [port]);

  // displayUrl is what the user sees. Empty string = no content loaded yet.
  const currentHost = window.location.hostname;
  const detectedUrl = (localPort || port) > 0 ? `http://${currentHost}:${localPort || port}` : '';
  const [displayUrl, setDisplayUrl] = useState(detectedUrl);
  const [addressInput, setAddressInput] = useState(detectedUrl || `http://${currentHost}:24880`);

  // Compute the iframe URL from displayUrl
  const iframeUrl = displayUrl ? toProxyUrl(sessionId, displayUrl, isLocalDirect) : '';
  // Keep a ref so effects/callbacks can read current value without re-triggering
  const iframeUrlRef = useRef(iframeUrl);
  iframeUrlRef.current = iframeUrl;

  // Track the last requested URL to avoid re-navigating to the same URL
  // This prevents infinite loops when user navigation updates requestedUrl prop
  const lastRequestedUrlRef = useRef<string>('');
  const currentDisplayUrlRef = useRef(displayUrl);
  currentDisplayUrlRef.current = displayUrl;

  // Navigate the iframe to a URL (sets both state and iframe.src directly)
  const navigateTo = useCallback((url: string) => {
    setDisplayUrl(url);
    setAddressInput(url);
    setLoading(true);
    setError(false);
    setStopped(false);

    // Directly set iframe src — don't rely on React re-render
    const targetUrl = toProxyUrl(sessionId, url, isLocalDirect);
    if (iframeRef.current) {
      iframeRef.current.src = targetUrl;
    }
  }, [sessionId, isLocalDirect]);

  // Update when detected port changes
  useEffect(() => {
    if (localPort > 0 || port > 0) {
      navigateTo(`http://${currentHost}:${localPort || port}`);
    }
  }, [port, localPort, navigateTo, currentHost]);

  // Navigate when requestedUrl changes (from saved panel state or board command)
  // BUT: only navigate if it's different from what we just navigated to (prevents infinite loops)
  useEffect(() => {
    if (requestedUrl && requestedUrl !== lastRequestedUrlRef.current) {
      lastRequestedUrlRef.current = requestedUrl;
      navigateTo(requestedUrl);
    }
  }, [requestedUrl, navigateTo]);

  // File change auto-reload disabled — use the reload button instead.
  // Auto-reload was causing constant refreshing during active development,
  // breaking login sessions and user interactions inside the preview.

  // When the iframe navigates (internal link clicks, redirects), update the address bar.
  // Uses functional state updates to avoid unnecessary re-renders.
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // For local direct mode, try to read the iframe location
    if (isLocalDirect) {
      try {
        const iframeLoc = iframeRef.current?.contentWindow?.location;
        if (iframeLoc) {
          const realUrl = iframeLoc.href;
          if (realUrl && realUrl !== 'about:blank') {
            setDisplayUrl((prev) => prev === realUrl ? prev : realUrl);
            setAddressInput((prev) => prev === realUrl ? prev : realUrl);
          }
        }
      } catch (_e) {
        // Cross-origin — URL sync handled by postMessage
      }
    }
    // For proxy mode: URL sync handled by postMessage from injected client script
  }, [isLocalDirect]);

  const handleReload = useCallback(() => {
    const url = iframeUrlRef.current;
    if (iframeRef.current && url) {
      setLoading(true);
      setError(false);
      const cleanUrl = url.replace(/[?&]_t=\d+/g, '');
      const separator = cleanUrl.includes('?') ? '&' : '?';
      iframeRef.current.src = `${cleanUrl}${separator}_t=${Date.now()}`;
    }
  }, []);

  const handleNavigate = useCallback(() => {
    if (!addressInput.trim()) return;
    let url = addressInput.trim();
    if (!url.startsWith('http') && !url.startsWith('project://') && !url.startsWith('/')) {
      url = `http://${url}`;
    }
    navigateTo(url);
    // Save to panel state only for user-initiated navigation
    onUrlChange?.(url);
  }, [addressInput, navigateTo, onUrlChange]);

  const handlePortChange = useCallback((newPort: number) => {
    const url = `http://${currentHost}:${newPort}`;
    navigateTo(url);
    // Save to panel state when user picks a port
    onUrlChange?.(url);
  }, [currentHost, navigateTo, onUrlChange]);

  const handleLocalPreview = useCallback(() => {
    const url = 'project://index.html';
    navigateTo(url);
    // Save to panel state for local preview
    onUrlChange?.(url);
  }, [navigateTo, onUrlChange]);

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
            placeholder={`http://${currentHost}:24880 or project://index.html`}
            spellCheck={false}
          />
        </div>
        {/* Viewport toggle — hidden on mobile (phone IS the device) */}
        <div className="flex rounded border border-gray-700">
          {/* Fill / responsive mode — iframe fills available space */}
          <button
            onClick={() => onViewportChange?.(null)}
            className={`px-1.5 py-0.5 text-xs rounded-l ${
              viewportMode === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Fill available space"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2" ry="2" />
            </svg>
          </button>
          <div className="relative" ref={desktopDropdownRef}>
            <button
              onClick={() => { setDesktopDropdownOpen((prev) => !prev); setDeviceDropdownOpen(false); }}
              className={`px-1.5 py-0.5 text-xs ${
                viewportMode === 'desktop'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={viewportMode === 'desktop' ? `Desktop: ${activeDesktop.name}` : 'Desktop viewport'}
            >
              🖥
            </button>
            {desktopDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 max-h-80 overflow-y-auto">
                {/* Group by brand: Laptop, Monitor */}
                {['Laptop', 'Monitor'].map((brand, bi) => {
                  const presets = DESKTOP_PRESETS.filter((p) => p.brand === brand);
                  if (presets.length === 0) return null;
                  return (
                    <div key={brand}>
                      {bi > 0 && <div className="border-t border-gray-700 my-0.5" />}
                      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{brand}</div>
                      {presets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            onDesktopPresetSelect?.(preset.id);
                            onViewportChange?.('desktop');
                            setDesktopDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-xs text-left flex justify-between items-center ${
                            viewportMode === 'desktop' && activeDesktop.id === preset.id
                              ? 'bg-blue-600/20 text-blue-300'
                              : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <span>{preset.name}</span>
                          <span className="text-gray-500 text-[10px]">{preset.width}x{preset.height}{preset.inches ? ` ${preset.inches}"` : ''}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative" ref={deviceDropdownRef}>
            <button
              onClick={() => { setDeviceDropdownOpen((prev) => !prev); setDesktopDropdownOpen(false); }}
              className={`px-1.5 py-0.5 text-xs ${
                viewportMode === 'mobile'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={viewportMode === 'mobile' ? `Mobile: ${activeDevice.name}` : 'Mobile viewport'}
            >
              📱
            </button>
            {deviceDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-gray-800 border border-gray-600 rounded shadow-lg py-1 max-h-80 overflow-y-auto">
                {BRANDS.map((brand, bi) => (
                  <div key={brand}>
                    {bi > 0 && <div className="border-t border-gray-700 my-0.5" />}
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{brand}</div>
                    {brandGroups[brand].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          onDevicePresetSelect?.(preset.id);
                          onViewportChange?.('mobile');
                          setDeviceDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-xs text-left flex justify-between items-center ${
                          viewportMode === 'mobile' && activeDevice.id === preset.id
                            ? 'bg-blue-600/20 text-blue-300'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <span>{preset.name}</span>
                        <span className="text-gray-500 text-[10px]">{preset.width}x{preset.height}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {viewportMode === 'mobile' && (
            <button
              onClick={() => setRotated((r) => !r)}
              className={`px-1.5 py-0.5 text-xs flex items-center gap-1 ${
                rotated
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={rotated ? 'Switch to portrait' : 'Switch to landscape'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" />
                <path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              <span>{rotated ? 'Landscape' : 'Portrait'}</span>
            </button>
          )}
          <button
            onClick={() => viewportMode === 'custom' ? onViewportChange?.(null) : handleApplyCustom()}
            className={`px-1.5 py-0.5 text-xs rounded-r ${
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
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen((f) => !f)}
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
                {(() => {
                  const dev = activeDevice;
                  const isPhone = dev.category === 'phone';
                  const devW = rotated ? dev.height : dev.width;
                  const devH = rotated ? dev.width : dev.height;
                  const phoneLandscape = isPhone && rotated;
                  const tabletLandscape = !isPhone && rotated;
                  const isLandscape = phoneLandscape || tabletLandscape;
                  const sidePad = isPhone ? 32 : 48;
                  const topBottomPad = isPhone ? 32 : 48;
                  const frameW = isLandscape ? devW + sidePad : devW;
                  const frameH = isLandscape ? devH : devH + topBottomPad;
                  const scale = contentSize.width > 0 && frameW > contentSize.width - 32
                    ? Math.min((contentSize.width - 32) / frameW, (contentSize.height - 32) / frameH)
                    : contentSize.height > 0 && frameH > contentSize.height - 32
                      ? Math.min(1, (contentSize.height - 32) / frameH)
                      : 1;
                  return (
                    <div
                      className={`shadow-2xl overflow-hidden bg-black flex-shrink-0 ${
                        phoneLandscape
                          ? 'flex flex-row border-2 border-gray-500 rounded-xl'
                          : tabletLandscape
                            ? 'flex flex-row border-[3px] border-gray-600 rounded-2xl'
                            : isPhone
                              ? 'flex flex-col border-2 border-gray-500 rounded-[2rem]'
                              : 'flex flex-col border-[3px] border-gray-600 rounded-2xl'
                      }`}
                      style={{ width: frameW, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top center' }}
                    >
                      {phoneLandscape ? (
                        <>
                          {/* Left bezel with notch (rotated) */}
                          <div className="w-7 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-4 h-20 bg-black rounded-full" />
                          </div>
                          <iframe
                            ref={iframeRef}
                            src={iframeUrl}
                            className="border-0 bg-white flex-shrink-0"
                            style={{ width: devW, height: devH }}
                            onLoad={handleIframeLoad}
                            onError={() => { setError(true); setLoading(false); }}
                          />
                          {/* Right bezel with home indicator (rotated) */}
                          <div className="w-5 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-1 h-24 bg-gray-600 rounded-full" />
                          </div>
                        </>
                      ) : isPhone ? (
                        <>
                          {/* Portrait phone — top notch */}
                          <div className="h-7 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-20 h-4 bg-black rounded-full" />
                          </div>
                          <iframe
                            ref={iframeRef}
                            src={iframeUrl}
                            className="border-0 bg-white flex-shrink-0"
                            style={{ width: devW, height: devH }}
                            onLoad={handleIframeLoad}
                            onError={() => { setError(true); setLoading(false); }}
                          />
                          {/* Bottom home indicator */}
                          <div className="h-5 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-24 h-1 bg-gray-600 rounded-full" />
                          </div>
                        </>
                      ) : tabletLandscape ? (
                        <>
                          {/* Left bezel with camera */}
                          <div className="w-6 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 bg-gray-700 rounded-full" />
                          </div>
                          <iframe
                            ref={iframeRef}
                            src={iframeUrl}
                            className="border-0 bg-white flex-shrink-0"
                            style={{ width: devW, height: devH }}
                            onLoad={handleIframeLoad}
                            onError={() => { setError(true); setLoading(false); }}
                          />
                          {/* Right bezel */}
                          <div className="w-6 bg-gray-900 flex-shrink-0" />
                        </>
                      ) : (
                        <>
                          {/* Tablet portrait — top bezel with camera */}
                          <div className="h-6 bg-gray-900 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 bg-gray-700 rounded-full" />
                          </div>
                          <iframe
                            ref={iframeRef}
                            src={iframeUrl}
                            className="border-0 bg-white flex-shrink-0"
                            style={{ width: devW, height: devH }}
                            onLoad={handleIframeLoad}
                            onError={() => { setError(true); setLoading(false); }}
                          />
                          {/* Bottom bezel */}
                          <div className="h-6 bg-gray-900 flex-shrink-0" />
                        </>
                      )}
                    </div>
                  );
                })()}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-600">
                  {activeDevice.name} ({rotated ? activeDevice.height : activeDevice.width}x{rotated ? activeDevice.width : activeDevice.height})
                </div>
              </div>
            ) : viewportMode === 'custom' && customViewportWidth && customViewportHeight ? (
              <div className="flex justify-center items-start h-full bg-gray-950 p-2 overflow-auto">
                <div className="relative flex-shrink-0" style={{
                  width: customViewportWidth,
                  height: customViewportHeight,
                  transform: contentSize.width > 0 && customViewportWidth > contentSize.width
                    ? `scale(${Math.max(Math.min(contentSize.width / customViewportWidth, (contentSize.height - 24) / customViewportHeight), MIN_VIEWPORT_SCALE)})`
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
                  />
                  <div className="text-center text-xs text-gray-500 mt-1">
                    {customViewportWidth} x {customViewportHeight}
                  </div>
                </div>
              </div>
            ) : viewportMode === 'desktop' ? (
              <div className="flex justify-center items-start h-full bg-gray-950 p-2 overflow-auto">
                {(() => {
                  const deskW = activeDesktop.width;
                  const deskH = activeDesktop.height;
                  const scaleX = contentSize.width > 0 ? (contentSize.width - 16) / deskW : 1;
                  const scaleY = contentSize.height > 0 ? (contentSize.height - 32) / deskH : 1;
                  const scale = Math.max(Math.min(scaleX, scaleY, 1), MIN_VIEWPORT_SCALE);
                  return (
                    <div className="relative flex-shrink-0" style={{
                      width: deskW,
                      height: deskH,
                      transform: scale < 1 ? `scale(${scale})` : undefined,
                      transformOrigin: 'top center',
                    }}>
                      <iframe
                        ref={iframeRef}
                        src={iframeUrl}
                        className="border border-gray-600 bg-white rounded"
                        style={{ width: deskW, height: deskH }}
                        onLoad={handleIframeLoad}
                        onError={() => { setError(true); setLoading(false); }}
                      />
                    </div>
                  );
                })()}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-600">
                  {activeDesktop.name} ({activeDesktop.width}x{activeDesktop.height}{activeDesktop.inches ? ` / ${activeDesktop.inches}"` : ''})
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={iframeUrl}
                className="w-full h-full border-0"
                onLoad={handleIframeLoad}
                onError={() => { setError(true); setLoading(false); }}
              />
            )}
          </>
        )}
      </div>

      {/* Fullscreen overlay — iframe fills entire viewport */}
      {isFullscreen && iframeUrl && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0 bg-white"
            onLoad={handleIframeLoad}
            onError={() => { setError(true); setLoading(false); }}
          />
          {/* Floating exit button */}
          <button
            onClick={() => setIsFullscreen(false)}
            className="fixed top-3 right-3 z-[61] w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm border border-white/20"
            title="Exit fullscreen (Escape)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
