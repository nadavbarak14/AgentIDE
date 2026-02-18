import { useState, useEffect } from 'react';
import { files as filesApi, type FileEntry } from '../services/api';

interface FileTreeProps {
  sessionId: string;
  onFileSelect: (path: string) => void;
}

export function FileTree({ sessionId, onFileSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [sessionId, currentPath]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const result = await filesApi.tree(sessionId, path === '/' ? undefined : path);
      setEntries(result.entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      setCurrentPath(newPath);
    } else {
      const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      onFileSelect(filePath);
    }
  };

  return (
    <div className="text-sm">
      {currentPath !== '/' && (
        <button
          onClick={() => {
            const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
            setCurrentPath(parent);
          }}
          className="w-full text-left px-2 py-1 hover:bg-gray-700 text-gray-400"
        >
          .. (up)
        </button>
      )}
      {loading ? (
        <p className="px-2 py-1 text-gray-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="px-2 py-1 text-gray-500">Empty directory</p>
      ) : (
        entries.map((entry) => (
          <button
            key={entry.name}
            onClick={() => handleClick(entry)}
            className="w-full text-left px-2 py-1 hover:bg-gray-700 flex items-center gap-1"
          >
            <span className="text-gray-500">{entry.type === 'directory' ? '📁' : '📄'}</span>
            <span className={entry.type === 'directory' ? 'text-blue-400' : 'text-gray-300'}>
              {entry.name}
            </span>
            {entry.size !== undefined && (
              <span className="text-xs text-gray-600 ml-auto">{formatSize(entry.size)}</span>
            )}
          </button>
        ))
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
