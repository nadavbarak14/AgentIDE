import { useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MobilePreviewSheetProps {
  sessionId: string;
  port: number;
  localPort: number;
  detectedPorts?: Array<{ port: number; localPort: number }>;
  isLocalSession?: boolean;
  onClose: () => void;
}

export function MobilePreviewSheet({
  sessionId,
  port,
  localPort,
  detectedPorts: _detectedPorts,
  isLocalSession,
  onClose,
}: MobilePreviewSheetProps) {
  const effectivePort = localPort || port;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const buildUrl = useCallback((portNum: number, path: string = '/') => {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalhost && isLocalSession) {
      return `http://localhost:${portNum}${path}`;
    }

    return `/api/sessions/${sessionId}/proxy/${portNum}${path}`;
  }, [sessionId, isLocalSession]);

  const initialUrl = useMemo(() => buildUrl(effectivePort), [buildUrl, effectivePort]);

  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [urlInput, setUrlInput] = useState(() => {
    // Show user-friendly URL in input
    if (isLocalSession) return `localhost:${effectivePort}/`;
    return `proxy/${effectivePort}/`;
  });
  const [iframeSrc, setIframeSrc] = useState(initialUrl);

  const displayBaseUrl = useMemo(() => {
    if (isLocalSession) return `localhost:${effectivePort}`;
    return `proxy/${effectivePort}`;
  }, [effectivePort, isLocalSession]);

  const handleNavigate = useCallback(() => {
    let url = urlInput.trim();
    // If user typed a full URL, use it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      setIframeSrc(url);
      setCurrentUrl(url);
      return;
    }
    // If it starts with localhost: parse the port
    if (url.startsWith('localhost:')) {
      const rest = url.replace('localhost:', '');
      const portMatch = rest.match(/^(\d+)(\/.*)?$/);
      if (portMatch) {
        const p = parseInt(portMatch[1]);
        const path = portMatch[2] || '/';
        const newUrl = buildUrl(p, path);
        setIframeSrc(newUrl);
        setCurrentUrl(newUrl);
        return;
      }
    }
    // If starts with proxy/ parse it
    if (url.startsWith('proxy/')) {
      const rest = url.replace('proxy/', '');
      const portMatch = rest.match(/^(\d+)(\/.*)?$/);
      if (portMatch) {
        const p = parseInt(portMatch[1]);
        const path = portMatch[2] || '/';
        const newUrl = buildUrl(p, path);
        setIframeSrc(newUrl);
        setCurrentUrl(newUrl);
        return;
      }
    }
    // Otherwise treat as path on current port
    if (!url.startsWith('/')) url = '/' + url;
    const newUrl = buildUrl(effectivePort, url);
    setIframeSrc(newUrl);
    setCurrentUrl(newUrl);
  }, [urlInput, buildUrl, effectivePort]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNavigate();
      (e.target as HTMLInputElement).blur();
    }
  }, [handleNavigate]);

  const handleRefresh = useCallback(() => {
    // Force iframe reload by toggling src
    const src = iframeSrc;
    setIframeSrc('about:blank');
    requestAnimationFrame(() => setIframeSrc(src));
  }, [iframeSrc]);

  const handleOpenExternal = () => {
    window.open(currentUrl, '_blank', 'noopener');
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Top bar - browser-like with URL input */}
      <div className="flex items-center h-[40px] px-1.5 border-b border-gray-700 bg-gray-800 flex-shrink-0 gap-1">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors flex-shrink-0"
          aria-label="Close preview"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Refresh button */}
        <button
          type="button"
          onClick={handleRefresh}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors flex-shrink-0"
          aria-label="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2v4h-4" />
            <path d="M2 14v-4h4" />
            <path d="M13.5 6A6 6 0 0 0 3.8 3.8L2 6" />
            <path d="M2.5 10a6 6 0 0 0 9.7 2.2L14 10" />
          </svg>
        </button>

        {/* URL input bar */}
        <div className="flex-1 flex items-center h-7 bg-gray-700 rounded px-2 gap-1 min-w-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-500 flex-shrink-0"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            className="flex-1 bg-transparent text-xs text-gray-300 outline-none placeholder-gray-500 min-w-0"
            placeholder={displayBaseUrl}
          />
          {/* Go button */}
          <button
            type="button"
            onClick={handleNavigate}
            className="text-blue-400 hover:text-blue-300 text-xs font-medium flex-shrink-0"
          >
            Go
          </button>
        </div>

        {/* Open external button */}
        <button
          type="button"
          onClick={handleOpenExternal}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors flex-shrink-0"
          aria-label="Open in new tab"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      </div>

      {/* iframe fills remaining space */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Preview"
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>,
    document.body,
  );
}
