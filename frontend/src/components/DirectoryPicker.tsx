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
  const [suggestions, setSuggestions] = useState<DirectoryEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pathExists, setPathExists] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Unified directory listing: routes to local or remote API
  const listDirectories = useCallback(async (dirPath?: string, query?: string) => {
    if (isRemote && workerId) {
      return workers.directories(workerId, dirPath, query);
    }
    return directories.list(dirPath, query);
  }, [isRemote, workerId]);

  const fetchSuggestions = useCallback(async (inputValue: string) => {
    setConnectionError(false);

    if (!inputValue) {
      // Fetch home directory contents
      setLoading(true);
      try {
        const result = await listDirectories();
        setSuggestions(result.entries);
        setPathExists(result.exists);
        setShowDropdown(true);
      } catch (err) {
        setSuggestions([]);
        if (isRemote && err instanceof Error && err.message.includes('not connected')) {
          setConnectionError(true);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // Split into parent dir + partial name
    const lastSlash = inputValue.lastIndexOf('/');
    let parentDir: string;
    let query: string;

    if (lastSlash === -1) {
      // No slash — search in home
      parentDir = '';
      query = inputValue;
    } else if (inputValue.endsWith('/')) {
      // Ends with slash — list contents of this dir
      parentDir = inputValue;
      query = '';
    } else {
      // Partial name after last slash
      parentDir = inputValue.substring(0, lastSlash + 1);
      query = inputValue.substring(lastSlash + 1);
    }

    setLoading(true);
    try {
      const result = await listDirectories(parentDir || undefined, query || undefined);
      setSuggestions(result.entries);
      setPathExists(result.exists || result.entries.length > 0);
      setShowDropdown(true);
    } catch (err) {
      setSuggestions([]);
      setPathExists(false);
      if (isRemote && err instanceof Error && err.message.includes('not connected')) {
        setConnectionError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [listDirectories, isRemote]);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (entry: DirectoryEntry) => {
    onChange(entry.path + '/');
    inputRef.current?.focus();
  };

  const handleCreateDir = async () => {
    if (!value.trim() || creating) return;
    setCreating(true);
    try {
      const result = await directories.create(value.trim());
      onChange(result.path);
      setPathExists(true);
      setShowDropdown(false);
    } catch {
      // Error creating
    } finally {
      setCreating(false);
    }
  };

  const showCreateHint = value.trim() && !pathExists && !loading && suggestions.length === 0 && !isRemote;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || 'Working directory'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => fetchSuggestions(value)}
        className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-3 h-3 border border-gray-500 border-t-blue-400 rounded-full animate-spin" />
        </div>
      )}
      {connectionError && (
        <div className="text-xs text-red-400 mt-1">Connection lost — unable to browse remote directories</div>
      )}

      {showDropdown && (suggestions.length > 0 || showCreateHint) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto"
        >
          {suggestions.map((entry) => (
            <button
              key={entry.path}
              onClick={() => handleSelect(entry)}
              className="w-full px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
            >
              <span className="text-yellow-400 text-xs">&#x1F4C1;</span>
              <span className="truncate">{entry.name}</span>
              <span className="ml-auto text-xs text-gray-500 truncate max-w-[50%]">{entry.path}</span>
            </button>
          ))}

          {showCreateHint && (
            <button
              onClick={handleCreateDir}
              disabled={creating}
              className="w-full px-2 py-1.5 text-left text-sm text-green-400 hover:bg-gray-700 flex items-center gap-2 border-t border-gray-700"
            >
              <span className="text-xs">+</span>
              <span>{creating ? 'Creating...' : `Create folder "${value.trim()}"`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
