import { useState, useRef, useCallback } from 'react';
import { directories, type FileBrowserEntry } from '../services/api';

interface FilePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * A file browser for selecting files from the hub server's local filesystem.
 * Used for SSH key selection — no $HOME restriction.
 * Renders inline (not absolute) so it works inside scrollable containers.
 */
export function FilePicker({ value, onChange, placeholder }: FilePickerProps) {
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentDir, setCurrentDir] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async (dirPath?: string) => {
    setLoading(true);
    try {
      const result = await directories.files(dirPath);
      setEntries(result.entries);
      setCurrentDir(result.path);
      setShowBrowser(true);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBrowse = () => {
    if (showBrowser) {
      setShowBrowser(false);
      return;
    }
    // Start browsing from the current value's directory, or home
    const startDir = value ? value.substring(0, value.lastIndexOf('/')) || undefined : undefined;
    fetchEntries(startDir);
  };

  const handleEntryClick = (entry: FileBrowserEntry) => {
    if (entry.type === 'directory') {
      fetchEntries(entry.path);
    } else {
      onChange(entry.path);
      setShowBrowser(false);
    }
  };

  const handleGoUp = () => {
    if (!currentDir || currentDir === '/') return;
    const parent = currentDir.substring(0, currentDir.lastIndexOf('/')) || '/';
    fetchEntries(parent);
  };

  return (
    <div>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder || 'SSH key path'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleBrowse}
          className={`px-2 py-1 text-xs rounded border flex-shrink-0 ${
            showBrowser
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
          }`}
          title="Browse files"
        >
          Browse
        </button>
      </div>

      {showBrowser && (
        <div className="mt-1 bg-gray-900 border border-gray-600 rounded max-h-40 overflow-y-auto">
          {/* Current path + up button */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 bg-gray-800 sticky top-0">
            <button
              type="button"
              onClick={handleGoUp}
              disabled={!currentDir || currentDir === '/'}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed flex-shrink-0"
            >
              ..
            </button>
            <span className="text-[10px] text-gray-500 truncate">{currentDir}</span>
            {loading && (
              <span className="ml-auto w-3 h-3 border border-gray-500 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {entries.length === 0 && !loading && (
            <div className="px-2 py-2 text-xs text-gray-500 text-center">Empty directory</div>
          )}

          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => handleEntryClick(entry)}
              className="w-full px-2 py-1 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-1.5"
            >
              <span className={`flex-shrink-0 ${entry.type === 'directory' ? 'text-yellow-400' : 'text-gray-400'}`}>
                {entry.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'}
              </span>
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
