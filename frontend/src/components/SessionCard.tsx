import { useState, useCallback, useRef, useEffect } from 'react';
import { TerminalView } from './TerminalView';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { LivePreview } from './LivePreview';
import { usePanel } from '../hooks/usePanel';
import type { Session } from '../services/api';
import type { WsServerMessage } from '../services/ws';

interface SessionCardProps {
  session: Session;
  focused?: boolean;
  isSingleView?: boolean;
  detectedPort?: { port: number; localPort: number } | null;
  onContinue?: (id: string) => void;
  onKill?: (id: string) => void;
  onToggleLock?: (id: string, lock: boolean) => void;
  onDelete?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  queued: 'bg-yellow-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
};

export function SessionCard({
  session,
  focused = false,
  isSingleView = false,
  detectedPort = null,
  onContinue,
  onKill,
  onToggleLock,
  onDelete,
}: SessionCardProps) {
  const panel = usePanel(isSingleView ? session.id : null);
  const [resizingSide, setResizingSide] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // File change tracking for live updates
  const [fileChangeVersion, setFileChangeVersion] = useState(0);
  const fileChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'file_changed') {
      if (fileChangeDebounceRef.current) {
        clearTimeout(fileChangeDebounceRef.current);
      }
      fileChangeDebounceRef.current = setTimeout(() => {
        setFileChangeVersion((v) => v + 1);
      }, 1000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fileChangeDebounceRef.current) clearTimeout(fileChangeDebounceRef.current);
    };
  }, []);

  const showToolbar = isSingleView && (session.status === 'active' || session.status === 'completed');
  const showLeftPanel = showToolbar && panel.leftPanel !== 'none';
  const showRightPanel = showToolbar && panel.rightPanel !== 'none';

  // Drag handle resize logic
  const handleLeftMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingSide('left');
  }, []);

  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingSide('right');
  }, []);

  useEffect(() => {
    if (!resizingSide) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;

      if (resizingSide === 'left') {
        // Left drag handle: controls left panel width directly
        const clamped = Math.max(15, Math.min(50, percent));
        panel.setLeftWidth(Math.round(clamped));
      } else {
        // Right drag handle: controls right panel width (inverted)
        const rightPercent = 100 - percent;
        const clamped = Math.max(15, Math.min(50, rightPercent));
        panel.setRightWidth(Math.round(clamped));
      }
    };

    const handleMouseUp = () => {
      setResizingSide(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingSide, panel]);

  const handleFileSelect = useCallback((filePath: string) => {
    panel.addFileTab(filePath);
  }, [panel]);

  // Calculate terminal width based on which panels are open
  const terminalWidth = (() => {
    let width = 100;
    if (showLeftPanel) width -= panel.leftWidthPercent;
    if (showRightPanel) width -= panel.rightWidthPercent;
    return width;
  })();

  const closeLeftPanel = useCallback(() => {
    panel.openPanel('files');
  }, [panel]);

  const closeRightPanel = useCallback(() => {
    if (panel.rightPanel === 'git') panel.openPanel('git');
    else if (panel.rightPanel === 'preview') panel.openPanel('preview');
  }, [panel]);

  return (
    <div
      className={`rounded-lg border ${
        session.needsInput
          ? 'border-amber-400 ring-2 ring-amber-400/50'
          : focused
            ? 'border-gray-600'
            : 'border-gray-700'
      } bg-gray-800 overflow-hidden flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[session.status]}`} />
          <span className="text-sm font-medium truncate">{session.title || 'Untitled'}</span>
          {session.needsInput && (
            <span className="text-sm text-amber-400 animate-pulse font-bold" title="Needs input">!</span>
          )}
          {session.lock && (
            <span className="text-xs text-gray-400" title="Pinned">
              📌
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">{session.status}</span>
          {session.status === 'active' && (
            <button
              onClick={() => onKill?.(session.id)}
              className="px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/20 rounded"
              title="Kill session"
            >
              Kill
            </button>
          )}
          {session.status === 'completed' && session.claudeSessionId && (
            <button
              onClick={() => onContinue?.(session.id)}
              className="px-1.5 py-0.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded"
              title="Continue with claude -c"
            >
              Continue
            </button>
          )}
          <button
            onClick={() => onToggleLock?.(session.id, !session.lock)}
            className={`px-1.5 py-0.5 text-xs rounded ${
              session.lock ? 'text-yellow-400 hover:bg-yellow-500/20' : 'text-gray-500 hover:bg-gray-600'
            }`}
            title={session.lock ? 'Unpin' : 'Pin'}
          >
            {session.lock ? 'Unpin' : 'Pin'}
          </button>
          {session.status !== 'active' && (
            <button
              onClick={() => onDelete?.(session.id)}
              className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-red-500/20 hover:text-red-400 rounded"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* IDE Toolbar — only visible in 1-view mode for active/completed sessions */}
      {showToolbar && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700 bg-gray-850">
          <button
            onClick={() => panel.openPanel('files')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              panel.leftPanel === 'files'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="File Explorer"
          >
            Files
          </button>
          <button
            onClick={() => panel.openPanel('git')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              panel.rightPanel === 'git'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="Git Changes"
          >
            Git
          </button>
          <button
            onClick={() => panel.openPanel('preview')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              panel.rightPanel === 'preview'
                ? 'bg-green-500/20 text-green-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="Web Preview"
          >
            Preview
          </button>
        </div>
      )}

      {/* Main Content — Three-column layout: [Left Panel? | Terminal | Right Panel?] */}
      <div ref={containerRef} className="flex-1 flex min-h-[300px]" style={{ cursor: resizingSide ? 'col-resize' : undefined }}>
        {/* Left Panel — Files panel */}
        {showLeftPanel && (
          <div
            className="border-r border-gray-700 flex flex-col overflow-hidden min-w-0"
            style={{ width: `${panel.leftWidthPercent}%` }}
          >
            <div className="flex h-full">
              {/* File tree — always visible on left */}
              <div className="w-[200px] min-w-[150px] flex-shrink-0 border-r border-gray-700 overflow-hidden">
                <FileTree sessionId={session.id} onFileSelect={handleFileSelect} refreshKey={fileChangeVersion} />
              </div>
              {/* Editor area — right side */}
              <div className="flex-1 min-w-0">
                {panel.fileTabs.length > 0 ? (
                  <FileViewer
                    sessionId={session.id}
                    filePath={panel.fileTabs[panel.activeTabIndex] || panel.fileTabs[0]}
                    fileTabs={panel.fileTabs}
                    activeTabIndex={panel.activeTabIndex}
                    onTabSelect={panel.setActiveTab}
                    onTabClose={panel.removeFileTab}
                    onClose={closeLeftPanel}
                    refreshKey={fileChangeVersion}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    Select a file to view
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Left Drag Handle */}
        {showLeftPanel && (
          <div
            className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
            onMouseDown={handleLeftMouseDown}
          />
        )}

        {/* Terminal or Status */}
        <div
          className="flex flex-col min-w-0"
          style={{ width: `${terminalWidth}%` }}
        >
          {session.status === 'active' ? (
            <TerminalView sessionId={session.id} active={true} onWsMessage={handleWsMessage} />
          ) : session.status === 'queued' ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg">Queued</p>
                <p className="text-sm">Position {session.position}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg capitalize">{session.status}</p>
                {session.claudeSessionId && (
                  <p className="text-xs mt-1">Session: {session.claudeSessionId.slice(0, 12)}...</p>
                )}
                {session.continuationCount > 0 && (
                  <p className="text-xs">Continued {session.continuationCount}x</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Drag Handle */}
        {showRightPanel && (
          <div
            className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
            onMouseDown={handleRightMouseDown}
          />
        )}

        {/* Right Panel — Git or Preview */}
        {showRightPanel && (
          <div
            className="border-l border-gray-700 flex flex-col overflow-hidden min-w-0"
            style={{ width: `${panel.rightWidthPercent}%` }}
          >
            {panel.rightPanel === 'git' && (
              <DiffViewer sessionId={session.id} onClose={closeRightPanel} refreshKey={fileChangeVersion} />
            )}
            {panel.rightPanel === 'preview' && (
              <LivePreview
                port={detectedPort?.port || 0}
                localPort={detectedPort?.localPort || 0}
                onClose={closeRightPanel}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
        <span className="truncate">{session.workingDirectory}</span>
        {session.pid && <span>PID {session.pid}</span>}
      </div>
    </div>
  );
}
