import { useState, useEffect } from 'react';
import { files as filesApi, type DiffResult } from '../services/api';

interface DiffViewerProps {
  sessionId: string;
  onClose: () => void;
}

export function DiffViewer({ sessionId, onClose }: DiffViewerProps) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    filesApi.diff(sessionId)
      .then(setDiff)
      .catch(() => setDiff(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Changes</span>
          {diff && (
            <span className="text-xs text-gray-400">
              {diff.filesChanged} files · 
              <span className="text-green-400">+{diff.additions}</span> 
              <span className="text-red-400">-{diff.deletions}</span>
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
      </div>
      <div className="flex-1 overflow-auto bg-gray-900 p-3">
        {loading ? (
          <p className="text-gray-500">Loading diff...</p>
        ) : !diff || !diff.diff ? (
          <p className="text-gray-500">No uncommitted changes</p>
        ) : (
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {diff.diff.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'bg-green-500/10 text-green-400'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'bg-red-500/10 text-red-400'
                      : line.startsWith('@@')
                        ? 'text-blue-400'
                        : 'text-gray-400'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
