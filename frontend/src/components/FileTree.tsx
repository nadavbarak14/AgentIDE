import { useState, useEffect, useCallback, useRef } from 'react';
import { files as filesApi } from '../services/api';

interface FileTreeProps {
  sessionId: string;
  onFileSelect: (path: string) => void;
  refreshKey?: number;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-HTTPS contexts
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function FileTree({ sessionId, onFileSelect, refreshKey = 0 }: FileTreeProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [currentPath, setCurrentPath] = useState('/');

  const loadDirectory = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const result = await filesApi.tree(sessionId, dirPath === '/' ? undefined : dirPath);
      const entries = result.entries || [];
      // Sort: directories first, then files, alphabetically
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return sorted.map((entry) => ({
        name: entry.name,
        path: dirPath === '/' ? entry.name : `${dirPath}/${entry.name}`,
        type: entry.type,
        size: entry.size,
        loaded: false,
        expanded: false,
      }));
    } catch {
      return [];
    }
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    loadDirectory(currentPath).then((nodes) => {
      setRoots(nodes);
      setLoading(false);
    });
  }, [sessionId, currentPath, loadDirectory, refreshKey]);

  const toggleExpand = useCallback(async (nodePath: string) => {
    setRoots((prev) => updateTreeNode(prev, nodePath, (node) => {
      if (node.expanded) {
        return { ...node, expanded: false };
      }
      return { ...node, expanded: true };
    }));

    // Lazy load children if not loaded
    setRoots((prev) => {
      const node = findNode(prev, nodePath);
      if (node && !node.loaded && node.type === 'directory') {
        loadDirectory(nodePath).then((children) => {
          setRoots((current) => updateTreeNode(current, nodePath, (n) => ({
            ...n,
            children,
            loaded: true,
            expanded: true,
          })));
        });
      }
      return prev;
    });
  }, [loadDirectory]);

  const handleClick = useCallback((node: TreeNode) => {
    if (node.type === 'directory') {
      toggleExpand(node.path);
    } else {
      onFileSelect(node.path);
    }
  }, [toggleExpand, onFileSelect]);

  const filterNodes = useCallback((nodes: TreeNode[], filter: string): TreeNode[] => {
    if (!filter) return nodes;
    const lowerFilter = filter.toLowerCase();
    return nodes.filter((node) => {
      if (node.name.toLowerCase().includes(lowerFilter)) return true;
      if (node.type === 'directory' && node.children) {
        return filterNodes(node.children, filter).length > 0;
      }
      return false;
    });
  }, []);

  const filteredRoots = filterNodes(roots, searchFilter);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Breadcrumb + Search */}
      <div className="px-2 py-1.5 border-b border-gray-700 space-y-1">
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <button
            onClick={() => setCurrentPath('/')}
            className="hover:text-white"
          >
            root
          </button>
          {currentPath !== '/' && currentPath.split('/').filter(Boolean).map((part, i, arr) => {
            const path = '/' + arr.slice(0, i + 1).join('/');
            return (
              <span key={path} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => setCurrentPath(path)} className="hover:text-white">
                  {part}
                </button>
              </span>
            );
          })}
        </div>
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter files..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-auto">
        {currentPath !== '/' && (
          <button
            onClick={() => {
              const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
              setCurrentPath(parent);
            }}
            className="w-full text-left px-2 py-1 hover:bg-gray-700 text-gray-400 flex items-center gap-1"
          >
            <span className="text-gray-500">⬆</span>
            <span>.. (up)</span>
          </button>
        )}
        {loading ? (
          <p className="px-2 py-1 text-gray-500">Loading...</p>
        ) : filteredRoots.length === 0 ? (
          <p className="px-2 py-1 text-gray-500">
            {searchFilter ? 'No matches' : 'Empty directory'}
          </p>
        ) : (
          filteredRoots.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              onClick={handleClick}
              searchFilter={searchFilter}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  onClick: (node: TreeNode) => void;
  searchFilter: string;
}

function TreeNodeItem({ node, depth, onClick, searchFilter }: TreeNodeItemProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(node.path);
    if (ok) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      <div
        className="group w-full text-left px-2 py-0.5 hover:bg-gray-700/50 flex items-center gap-1 cursor-pointer"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onClick(node)}
      >
        {node.type === 'directory' && (
          <span className="text-gray-500 text-xs w-3">
            {node.expanded ? '▼' : '▶'}
          </span>
        )}
        {node.type === 'file' && <span className="w-3" />}
        <span className={node.type === 'directory' ? 'text-blue-400' : 'text-gray-300'}>
          {node.name}
        </span>
        {node.type === 'file' && (
          <button
            onClick={handleCopyPath}
            className={`ml-auto text-xs px-1 rounded transition-colors flex-shrink-0 ${
              copied
                ? 'text-green-400'
                : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-300'
            }`}
            title={copied ? 'Copied!' : 'Copy path'}
          >
            {copied ? '✓' : 'cp'}
          </button>
        )}
        {node.size !== undefined && node.type === 'file' && !copied && (
          <span className="text-xs text-gray-600 ml-auto group-hover:hidden">{formatSize(node.size)}</span>
        )}
      </div>
      {node.expanded && node.children && node.children
        .filter((child) => {
          if (!searchFilter) return true;
          return child.name.toLowerCase().includes(searchFilter.toLowerCase());
        })
        .map((child) => (
          <TreeNodeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            onClick={onClick}
            searchFilter={searchFilter}
          />
        ))}
      {node.expanded && !node.loaded && (
        <div style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }} className="py-0.5 text-gray-500 text-xs">
          Loading...
        </div>
      )}
    </>
  );
}

// Helpers

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateTreeNode(nodes: TreeNode[], path: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return updater(node);
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, path, updater) };
    }
    return node;
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
