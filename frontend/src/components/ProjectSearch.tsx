import { useState, useCallback, useRef, useEffect } from 'react';
import { files as filesApi } from '../services/api';
import type { SearchResult } from '../services/api';

interface ProjectSearchProps {
  sessionId: string;
  onFileSelect: (path: string, line: number) => void;
  onClose: () => void;
}

export function ProjectSearch({ sessionId, onFileSelect, onClose }: ProjectSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 100;

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const doSearch = useCallback(async (searchQuery: string, searchOffset: number, append: boolean) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalMatches(0);
      setTruncated(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await filesApi.search(sessionId, searchQuery.trim(), LIMIT, searchOffset);
      if (append) {
        setResults((prev) => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setTotalMatches(data.totalMatches);
      setTruncated(data.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setOffset(0);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      doSearch(value, 0, false);
    }, 300);
  }, [doSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleShowMore = useCallback(() => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    doSearch(query, newOffset, true);
  }, [offset, query, doSearch]);

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.filePath]) acc[result.filePath] = [];
    acc[result.filePath].push(result);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Search Header */}
      <div className="px-2 py-1.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search in files..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs px-1"
            title="Close search"
          >
            ×
          </button>
        </div>
        {totalMatches > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {Object.keys(grouped).length} file{Object.keys(grouped).length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-xs">
            <span className="animate-spin mr-2">⟳</span> Searching...
          </div>
        )}

        {error && (
          <div className="px-2 py-2 text-red-400 text-xs">{error}</div>
        )}

        {!loading && !error && query && results.length === 0 && (
          <div className="px-2 py-4 text-gray-500 text-xs text-center">
            No results found
          </div>
        )}

        {!query && (
          <div className="px-2 py-4 text-gray-500 text-xs text-center">
            Type to search across all files
          </div>
        )}

        {Object.entries(grouped).map(([filePath, fileResults]) => (
          <div key={filePath} className="border-b border-gray-800">
            <div className="px-2 py-1 text-xs text-blue-400 bg-gray-800/50 sticky top-0 truncate">
              {filePath}
            </div>
            {fileResults.map((result, idx) => (
              <button
                key={`${result.lineNumber}-${idx}`}
                onClick={() => onFileSelect(result.filePath, result.lineNumber)}
                className="w-full text-left px-2 py-0.5 hover:bg-gray-700/50 flex items-start gap-2 text-xs"
              >
                <span className="text-gray-600 min-w-[3ch] text-right flex-shrink-0">
                  {result.lineNumber}
                </span>
                <span className="text-gray-400 truncate">
                  <HighlightedLine line={result.lineContent} matchStart={result.matchStart} matchLength={result.matchLength} />
                </span>
              </button>
            ))}
          </div>
        ))}

        {truncated && !loading && (
          <button
            onClick={handleShowMore}
            className="w-full py-2 text-xs text-blue-400 hover:bg-gray-700/50"
          >
            Show more results...
          </button>
        )}

        {loading && results.length > 0 && (
          <div className="py-2 text-center text-gray-500 text-xs">
            <span className="animate-spin mr-1">⟳</span> Loading more...
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightedLine({ line, matchStart, matchLength }: { line: string; matchStart: number; matchLength: number }) {
  if (matchStart < 0 || matchLength <= 0) {
    return <>{line}</>;
  }

  const before = line.substring(0, matchStart);
  const match = line.substring(matchStart, matchStart + matchLength);
  const after = line.substring(matchStart + matchLength);

  return (
    <>
      {before}
      <span className="bg-yellow-500/30 text-yellow-200">{match}</span>
      {after}
    </>
  );
}
