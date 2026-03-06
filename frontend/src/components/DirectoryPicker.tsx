import { useState, useEffect, useRef, useCallback } from 'react';
import { directories, workers, type DirectoryEntry } from '../services/api';

interface DirectoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  workerId?: string;
  isRemote?: boolean;
}

export function DirectoryPicker({ value, onChange, placeholder, workerId, isRemote }: DirectoryPickerProps) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Unified directory listing: routes to local or remote API
  const listDirectories = useCallback(async (dirPath?: string) => {
    if (isRemote && workerId) {
      return workers.directories(workerId, dirPath);
    }
    return directories.list(dirPath);
  }, [isRemote, workerId]);

  // Fetch directory contents for the browser
  const fetchBrowserContents = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setBrowserError(null);
    setConnectionError(false);
    try {
      const result = await listDirectories(dirPath);
      setEntries(result.entries);
      if (!result.exists) {
        setBrowserError('Path not found');
      }
      // Set currentPath from the resolved path returned by API
      if (result.path) {
        setCurrentPath(result.path);
      }
    } catch (err) {
      setEntries([]);
      if (isRemote && err instanceof Error && err.message.includes('not connected')) {
        setConnectionError(true);
      } else {
        setBrowserError('Cannot access directory');
      }
    } finally {
      setLoading(false);
    }
  }, [listDirectories, isRemote]);

  // Open browser — fetch home directory
  const openBrowser = useCallback(() => {
    setShowBrowser(true);
    setPathHistory([]);
    setBrowserError(null);
    fetchBrowserContents();
  }, [fetchBrowserContents]);

  // Navigate into a folder
  const navigateInto = useCallback((entry: DirectoryEntry) => {
    setPathHistory(prev => [...prev, currentPath]);
    setCurrentPath(entry.path);
    fetchBrowserContents(entry.path);
  }, [currentPath, fetchBrowserContents]);

  // Navigate back
  const navigateBack = useCallback(() => {
    if (pathHistory.length === 0) return;
    const prev = pathHistory[pathHistory.length - 1];
    setPathHistory(h => h.slice(0, -1));
    setCurrentPath(prev);
    fetchBrowserContents(prev);
  }, [pathHistory, fetchBrowserContents]);

  // Navigate to breadcrumb
  const navigateToBreadcrumb = useCallback((targetPath: string, index: number) => {
    // Truncate history to the breadcrumb position
    setPathHistory(h => h.slice(0, index));
    setCurrentPath(targetPath);
    fetchBrowserContents(targetPath);
  }, [fetchBrowserContents]);

  // Select current folder
  const selectCurrentFolder = useCallback(() => {
    onChange(currentPath);
    setShowBrowser(false);
  }, [currentPath, onChange]);

  // Sync path bar → browser (debounced)
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const fetchBrowserContentsRef = useRef(fetchBrowserContents);
  fetchBrowserContentsRef.current = fetchBrowserContents;

  useEffect(() => {
    if (!showBrowser) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value && value !== currentPathRef.current) {
        setPathHistory([]);
        setCurrentPath(value);
        fetchBrowserContentsRef.current(value);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, showBrowser]);

  // Close browser on outside click
  useEffect(() => {
    if (!showBrowser) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        browserRef.current &&
        !browserRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowBrowser(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBrowser]);

  // Create directory
  const handleCreateDir = async () => {
    if (!value.trim() || creating) return;
    setCreating(true);
    try {
      const result = await directories.create(value.trim());
      onChange(result.path);
      setShowBrowser(false);
    } catch {
      // Error creating
    } finally {
      setCreating(false);
    }
  };

  // Build breadcrumb segments from currentPath
  const breadcrumbs = buildBreadcrumbs(currentPath);

  const showCreateHint = value.trim() && !loading && entries.length === 0 && browserError && !isRemote;

  return (
    <div className="relative" ref={browserRef}>
      {/* Path bar input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder || 'Type a path or browse below'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (!showBrowser) openBrowser(); }}
          className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
          autoComplete="off"
          data-testid="directory-path-input"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border border-gray-500 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {connectionError && (
        <div className="text-xs text-red-400 mt-1">Connection lost — unable to browse remote directories</div>
      )}

      {/* Visual folder browser */}
      {showBrowser && (
        <div className="mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg" data-testid="directory-browser">
          {/* Breadcrumb trail + back button */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700 min-h-[32px]">
            <button
              type="button"
              onClick={navigateBack}
              disabled={pathHistory.length === 0}
              className="flex-shrink-0 p-0.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed"
              title="Go back"
              data-testid="browser-back-btn"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 12L6 8l4-4" />
              </svg>
            </button>
            <div className="flex items-center gap-0.5 text-xs text-gray-400 overflow-x-auto flex-1 min-w-0" data-testid="breadcrumb-trail">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.path} className="flex items-center gap-0.5 flex-shrink-0">
                  {i > 0 && <span className="text-gray-600">/</span>}
                  <button
                    type="button"
                    onClick={() => navigateToBreadcrumb(crumb.path, i)}
                    className={`hover:text-blue-400 truncate max-w-[100px] ${i === breadcrumbs.length - 1 ? 'text-gray-200 font-medium' : 'text-gray-400'}`}
                    title={crumb.path}
                    data-testid={`breadcrumb-${i}`}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Folder list */}
          <div className="max-h-48 overflow-y-auto" data-testid="folder-list">
            {loading && entries.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-500">Loading...</div>
            )}

            {!loading && browserError && entries.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-red-400" data-testid="browser-error">
                {browserError}
              </div>
            )}

            {!loading && !browserError && entries.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-gray-500" data-testid="empty-directory">
                No subdirectories
              </div>
            )}

            {entries.map((entry) => (
              <button
                type="button"
                key={entry.path}
                onClick={() => navigateInto(entry)}
                className="w-full px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                title={entry.path}
                data-testid={`folder-${entry.name}`}
              >
                <svg className="flex-shrink-0 text-yellow-400" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 3.5A1.5 1.5 0 012.5 2h3.172a1.5 1.5 0 011.06.44l.658.658a.5.5 0 00.354.147H13.5A1.5 1.5 0 0115 4.745V12.5A1.5 1.5 0 0113.5 14h-11A1.5 1.5 0 011 12.5v-9z" />
                </svg>
                <span className="truncate">{entry.name}</span>
              </button>
            ))}

            {showCreateHint && (
              <button
                type="button"
                onClick={handleCreateDir}
                disabled={creating}
                className="w-full px-2 py-1.5 text-left text-sm text-green-400 hover:bg-gray-700 flex items-center gap-2 border-t border-gray-700"
              >
                <span className="text-xs">+</span>
                <span>{creating ? 'Creating...' : `Create folder "${value.trim()}"`}</span>
              </button>
            )}
          </div>

          {/* Select this folder button */}
          {currentPath && (
            <div className="border-t border-gray-700 px-2 py-1.5">
              <button
                type="button"
                onClick={selectCurrentFolder}
                className="w-full px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-700/50 rounded border border-blue-500/30 transition-colors"
                data-testid="select-folder-btn"
              >
                Select this folder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Build breadcrumb segments from an absolute path */
function buildBreadcrumbs(fullPath: string): { label: string; path: string }[] {
  if (!fullPath) return [];
  const segments = fullPath.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];

  // Root
  crumbs.push({ label: '/', path: '/' });

  let accumulated = '';
  for (const seg of segments) {
    accumulated += '/' + seg;
    crumbs.push({ label: seg, path: accumulated });
  }

  return crumbs;
}
