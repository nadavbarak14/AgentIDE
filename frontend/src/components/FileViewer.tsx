import { useState, useEffect } from 'react';
import { files as filesApi } from '../services/api';

interface FileViewerProps {
  sessionId: string;
  filePath: string;
  onClose: () => void;
}

export function FileViewer({ sessionId, filePath, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    filesApi.content(sessionId, filePath)
      .then((result) => {
        setContent(result.content);
        setLanguage(result.language);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load file'))
      .finally(() => setLoading(false));
  }, [sessionId, filePath]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-400 truncate">{filePath}</span>
          {language && <span className="text-xs px-1 py-0.5 bg-gray-700 rounded text-gray-400">{language}</span>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
      </div>
      <div className="flex-1 overflow-auto bg-gray-900 p-3">
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  );
}
