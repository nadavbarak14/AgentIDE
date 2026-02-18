import { useState, useEffect, useRef } from 'react';

interface LivePreviewProps {
  port: number;
  localPort: number;
  detectedPorts?: { port: number; localPort: number }[];
  onClose: () => void;
  refreshKey?: number;
}

export function LivePreview({ port, localPort, detectedPorts, onClose, refreshKey = 0 }: LivePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [activePort, setActivePort] = useState(localPort || port);
  const [stopped, setStopped] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const src = activePort > 0 ? `http://localhost:${activePort}` : '';

  // Reset state when port changes
  useEffect(() => {
    if (localPort > 0 || port > 0) {
      setActivePort(localPort || port);
      setStopped(false);
      setError(false);
      setLoading(true);
    }
  }, [port, localPort]);

  // Handle file changes — reload iframe
  useEffect(() => {
    if (refreshKey > 0 && iframeRef.current && src) {
      const separator = src.includes('?') ? '&' : '?';
      iframeRef.current.src = `${src}${separator}_t=${Date.now()}`;
    }
  }, [refreshKey, src]);

  const handleReload = () => {
    if (iframeRef.current && src) {
      setLoading(true);
      setError(false);
      const separator = src.includes('?') ? '&' : '?';
      iframeRef.current.src = `${src}${separator}_t=${Date.now()}`;
    }
  };

  const handleLoadManualUrl = () => {
    if (!manualUrl.trim()) return;
    let url = manualUrl.trim();
    if (!url.startsWith('http')) url = `http://${url}`;
    setActivePort(0); // Clear port-based URL
    if (iframeRef.current) {
      iframeRef.current.src = url;
      setLoading(true);
      setError(false);
    }
  };

  const noServer = activePort === 0 && !src;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">Preview</span>
          {/* Port selector */}
          {detectedPorts && detectedPorts.length > 1 ? (
            <select
              value={activePort}
              onChange={(e) => {
                setActivePort(Number(e.target.value));
                setStopped(false);
                setError(false);
                setLoading(true);
              }}
              className="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300"
            >
              {detectedPorts.map((p) => (
                <option key={p.localPort} value={p.localPort}>
                  :{p.port}
                </option>
              ))}
            </select>
          ) : activePort > 0 ? (
            <span className="text-xs text-gray-400">:{activePort}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {src && (
            <>
              <button
                onClick={handleReload}
                className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-700 rounded"
                title="Reload"
              >
                Reload
              </button>
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-700 rounded"
                title="Open in new tab"
              >
                Open
              </a>
            </>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {stopped ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <div className="text-center">
              <p className="text-lg">Server stopped</p>
              <p className="text-sm mt-1">The dev server is no longer running</p>
              {src && (
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline mt-2 inline-block"
                >
                  Try opening {src} in a new tab
                </a>
              )}
            </div>
          </div>
        ) : noServer ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <div className="text-center space-y-3">
              <p className="text-lg">No server detected</p>
              <p className="text-sm">Enter a URL manually to preview</p>
              <div className="flex gap-2 justify-center">
                <input
                  type="text"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoadManualUrl()}
                  placeholder="http://localhost:3000"
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 w-48"
                />
                <button
                  onClick={handleLoadManualUrl}
                  className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
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
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-2 inline-block"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={src}
              className="w-full h-full border-0"
              onLoad={() => setLoading(false)}
              onError={() => { setError(true); setLoading(false); }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </>
        )}
      </div>
    </div>
  );
}
