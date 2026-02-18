import { useState } from 'react';

interface LivePreviewProps {
  port: number;
  localPort: number;
  onClose: () => void;
}

export function LivePreview({ localPort, onClose }: LivePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const src = `http://localhost:${localPort}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Live Preview</span>
          <span className="text-xs text-gray-400">:{localPort}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setLoading(true);
              setError(false);
              // Force iframe reload by remounting
              const iframe = document.querySelector(`iframe[src="${src}"]`) as HTMLIFrameElement;
              if (iframe) iframe.src = src;
            }}
            className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-600 rounded"
          >
            Reload
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
      </div>
      <div className="flex-1 relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            Loading preview...
          </div>
        )}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
            <div className="text-center">
              <p className="text-lg">Server stopped</p>
              <p className="text-sm">The dev server is no longer running</p>
            </div>
          </div>
        ) : (
          <iframe
            src={src}
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
