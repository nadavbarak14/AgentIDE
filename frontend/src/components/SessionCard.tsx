import { useState, useCallback, useRef, useEffect } from 'react';
import { TerminalView } from './TerminalView';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { LivePreview } from './LivePreview';
import { ProjectSearch } from './ProjectSearch';
import { usePanel } from '../hooks/usePanel';
import type { Session } from '../services/api';
import type { WsServerMessage } from '../services/ws';

interface SessionCardProps {
  session: Session;
  focused?: boolean;
  isSingleView?: boolean;
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
  isSingleView: _isSingleView = false,
  onContinue,
  onKill,
  onToggleLock,
  onDelete,
}: SessionCardProps) {
  const panel = usePanel(session.id);
  const [resizingSide, setResizingSide] = useState<'left' | 'right' | null>(null);
  const [resizingVertical, setResizingVertical] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const userOverrideRef = useRef(false); // Track if user manually positioned terminal
  const [sidebarView, setSidebarView] = useState<'tree' | 'search'>('tree');

  // File change tracking for live updates
  const [fileChangeVersion, setFileChangeVersion] = useState(0);
  const fileChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Port detection — managed internally from WebSocket events
  const [detectedPort, setDetectedPort] = useState<{ port: number; localPort: number } | null>(null);

  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'file_changed') {
      if (fileChangeDebounceRef.current) {
        clearTimeout(fileChangeDebounceRef.current);
      }
      fileChangeDebounceRef.current = setTimeout(() => {
        setFileChangeVersion((v) => v + 1);
      }, 1000);
    }
    if (msg.type === 'port_detected') {
      setDetectedPort({ port: msg.port, localPort: msg.localPort });
    }
    // Handle board commands from Claude skills (OSC sequences)
    if (msg.type === 'board_command') {
      try {
        if (msg.command === 'open_file' && msg.params.path) {
          panel.addFileTab(msg.params.path);
          if (panel.leftPanel === 'none') {
            panel.setLeftPanel('files');
          }
          if (msg.params.line) {
            panel.updateScrollPosition(msg.params.path, {
              line: parseInt(msg.params.line, 10) || 1,
              column: 1,
            });
          }
        } else if (msg.command === 'show_panel' && msg.params.panel) {
          panel.setRightPanel(msg.params.panel as 'git' | 'preview' | 'files');
        } else if (msg.command === 'show_diff') {
          panel.setRightPanel('git');
        }
      } catch {
        // Never disrupt the terminal for command handling errors
      }
    }
  }, [panel]);

  useEffect(() => {
    return () => {
      if (fileChangeDebounceRef.current) clearTimeout(fileChangeDebounceRef.current);
    };
  }, []);

  const showToolbar = session.status === 'active' || session.status === 'completed';
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

  // Minimum pixel widths/heights for responsive layout
  const MIN_PANEL_PX = 200;
  const MIN_TERMINAL_PX = 300;
  const MIN_TOP_PX = 200;
  const MIN_BOTTOM_PX = 150;

  useEffect(() => {
    if (!resizingSide) return;

    const tInTop = showToolbar && panel.terminalPosition === 'center' && panel.terminalVisible;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const percent = ((e.clientX - rect.left) / containerWidth) * 100;

      if (resizingSide === 'left') {
        const minLeftPercent = (MIN_PANEL_PX / containerWidth) * 100;
        const maxLeftPercent = tInTop
          ? 100 - ((MIN_TERMINAL_PX / containerWidth) * 100) - (showRightPanel ? panel.rightWidthPercent : 0)
          : 100 - (showRightPanel ? (MIN_PANEL_PX / containerWidth) * 100 : 0);
        const clamped = Math.max(minLeftPercent, Math.min(maxLeftPercent, percent));
        panel.setLeftWidth(Math.round(clamped));
      } else {
        const rightPercent = 100 - percent;
        const minRightPercent = (MIN_PANEL_PX / containerWidth) * 100;
        const maxRightPercent = tInTop
          ? 100 - ((MIN_TERMINAL_PX / containerWidth) * 100) - (showLeftPanel ? panel.leftWidthPercent : 0)
          : 100 - (showLeftPanel ? (MIN_PANEL_PX / containerWidth) * 100 : 0);
        const clamped = Math.max(minRightPercent, Math.min(maxRightPercent, rightPercent));
        panel.setRightWidth(Math.round(clamped));
      }
    };

    const handleMouseUp = () => setResizingSide(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingSide, panel, showLeftPanel, showRightPanel, showToolbar]);

  // Vertical drag resize (between top and bottom zones)
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingVertical(true);
    userOverrideRef.current = true;
  }, []);

  useEffect(() => {
    if (!resizingVertical) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerHeight = rect.height;
      const topPercent = ((e.clientY - rect.top) / containerHeight) * 100;
      const bottomPercent = 100 - topPercent;

      const minTopPercent = (MIN_TOP_PX / containerHeight) * 100;
      const minBottomPercent = (MIN_BOTTOM_PX / containerHeight) * 100;
      const clampedBottom = Math.max(minBottomPercent, Math.min(100 - minTopPercent, bottomPercent));
      panel.setBottomHeight(Math.round(clampedBottom));
    };

    const handleMouseUp = () => {
      setResizingVertical(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingVertical, panel]);

  // Auto-position terminal: bottom when panels open, center when all close (T020)
  useEffect(() => {
    if (!showToolbar) return;
    if (userOverrideRef.current) return;

    const anyPanelOpen = showLeftPanel || showRightPanel;
    if (anyPanelOpen && panel.terminalPosition === 'center') {
      panel.setTerminalPosition('bottom');
    } else if (!anyPanelOpen && panel.terminalPosition === 'bottom') {
      panel.setTerminalPosition('center');
    }
  }, [showLeftPanel, showRightPanel, panel.terminalPosition, showToolbar, panel]);

  // Clear user override when all panels close
  useEffect(() => {
    if (!showLeftPanel && !showRightPanel) {
      userOverrideRef.current = false;
    }
  }, [showLeftPanel, showRightPanel]);

  // Keyboard shortcuts (US4 Ctrl+Z fix)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); // Stop browser back-nav; Monaco handles its own undo internally
    }
  }, []);

  // Global keyboard shortcut for Ctrl+Shift+F (search in files)
  // Must be a window listener to intercept even when xterm has focus
  useEffect(() => {
    if (!showToolbar) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        if (panel.leftPanel !== 'files') panel.setLeftPanel('files');
        setSidebarView('search');
      }
    };
    window.addEventListener('keydown', handler, true); // capture phase
    return () => window.removeEventListener('keydown', handler, true);
  }, [showToolbar, panel]);

  const handleFileSelect = useCallback((filePath: string) => {
    panel.addFileTab(filePath);
  }, [panel]);

  const handleSearchFileSelect = useCallback((filePath: string, line: number) => {
    panel.addFileTab(filePath);
    panel.setLeftPanel('files');
    // Store line to scroll to after file loads
    panel.updateScrollPosition(filePath, { line, column: 1 });
  }, [panel]);

  // Whether terminal is rendered in the top zone (center/side-by-side mode)
  const terminalInTopZone = showToolbar && panel.terminalPosition === 'center' && panel.terminalVisible;

  // Effective panel widths — when terminal is NOT in the top zone, panels fill all available space
  const effectiveLeftWidth = (() => {
    if (!showLeftPanel) return 0;
    if (terminalInTopZone) return panel.leftWidthPercent;
    if (!showRightPanel) return 100;
    const total = panel.leftWidthPercent + panel.rightWidthPercent;
    return total > 0 ? (panel.leftWidthPercent / total) * 100 : 50;
  })();

  const effectiveRightWidth = (() => {
    if (!showRightPanel) return 0;
    if (terminalInTopZone) return panel.rightWidthPercent;
    if (!showLeftPanel) return 100;
    const total = panel.leftWidthPercent + panel.rightWidthPercent;
    return total > 0 ? (panel.rightWidthPercent / total) * 100 : 50;
  })();

  const effectiveTerminalWidth = (() => {
    if (!terminalInTopZone) return 0;
    let w = 100;
    if (showLeftPanel) w -= panel.leftWidthPercent;
    if (showRightPanel) w -= panel.rightWidthPercent;
    return w;
  })();

  // Check if viewport can accommodate opening a panel
  const canOpenPanel = useCallback((side: 'left' | 'right'): boolean => {
    if (!containerRef.current) return true;
    const containerWidth = containerRef.current.getBoundingClientRect().width;
    const otherPanelOpen = side === 'left' ? showRightPanel : showLeftPanel;
    const neededWidth = MIN_PANEL_PX + MIN_TERMINAL_PX + (otherPanelOpen ? MIN_PANEL_PX : 0);
    return containerWidth >= neededWidth;
  }, [showLeftPanel, showRightPanel]);

  const handleTogglePanel = useCallback((panelType: 'files' | 'git' | 'preview') => {
    // Check if any panel already shows this content type
    const leftShows = panel.leftPanel === panelType;
    const rightShows = panel.rightPanel === panelType;

    if (leftShows) {
      panel.setLeftPanel('none');
      return;
    }
    if (rightShows) {
      panel.setRightPanel('none');
      return;
    }

    // Opening — decide default side and check viewport
    const defaultSide = panelType === 'files' ? 'left' : 'right';
    if (!canOpenPanel(defaultSide)) return;

    if (defaultSide === 'left') {
      panel.setLeftPanel(panelType);
    } else {
      panel.setRightPanel(panelType);
    }
  }, [panel, canOpenPanel]);

  const closeLeftPanel = useCallback(() => {
    // Guard: don't close if it would leave no visible content
    if (!panel.terminalVisible && panel.rightPanel === 'none') return;
    panel.setLeftPanel('none');
  }, [panel]);

  const closeRightPanel = useCallback(() => {
    // Guard: don't close if it would leave no visible content
    if (!panel.terminalVisible && panel.leftPanel === 'none') return;
    panel.setRightPanel('none');
  }, [panel]);

  // Whether to show the bottom zone (terminal in bottom position)
  const showBottomZone = showToolbar && panel.terminalPosition === 'bottom' && panel.terminalVisible;

  // Content type options for panel header dropdowns
  const CONTENT_OPTIONS = [
    { value: 'files', label: 'Files' },
    { value: 'git', label: 'Git' },
    { value: 'preview', label: 'Preview' },
  ] as const;

  // Render the content for a panel based on its content type
  const renderPanelContent = (contentType: string, slot: 'left' | 'right') => {
    switch (contentType) {
      case 'search':
      case 'files':
        return (
          <div className="flex h-full">
            <div className="w-[200px] min-w-[150px] flex-shrink-0 border-r border-gray-700 overflow-hidden flex flex-col">
              {/* Sidebar toggle: Explorer / Search */}
              <div className="flex border-b border-gray-700 text-xs flex-shrink-0">
                <button
                  onClick={() => setSidebarView('tree')}
                  className={`flex-1 px-2 py-1 text-center transition-colors ${
                    sidebarView === 'tree' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Explorer
                </button>
                <button
                  onClick={() => setSidebarView('search')}
                  className={`flex-1 px-2 py-1 text-center transition-colors ${
                    sidebarView === 'search' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Search
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {sidebarView === 'tree' ? (
                  <FileTree sessionId={session.id} onFileSelect={handleFileSelect} refreshKey={fileChangeVersion} />
                ) : (
                  <ProjectSearch
                    sessionId={session.id}
                    onFileSelect={handleSearchFileSelect}
                    onClose={() => setSidebarView('tree')}
                  />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {panel.fileTabs.length > 0 ? (
                <FileViewer
                  sessionId={session.id}
                  filePath={panel.fileTabs[panel.activeTabIndex] || panel.fileTabs[0]}
                  fileTabs={panel.fileTabs}
                  activeTabIndex={panel.activeTabIndex}
                  onTabSelect={panel.setActiveTab}
                  onTabClose={panel.removeFileTab}
                  onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
                  refreshKey={fileChangeVersion}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Select a file to view
                </div>
              )}
            </div>
          </div>
        );
      case 'git':
        return (
          <DiffViewer
            sessionId={session.id}
            onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
            refreshKey={fileChangeVersion}
          />
        );
      case 'preview':
        return (
          <LivePreview
            sessionId={session.id}
            port={detectedPort?.port || 0}
            localPort={detectedPort?.localPort || 0}
            onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
            viewportMode={panel.previewViewport}
            onViewportChange={(mode) => panel.setPreviewViewport(mode)}
          />
        );
      default:
        return null;
    }
  };

  // Panel header with content type selector
  const renderPanelHeader = (
    currentType: string,
    onTypeChange: (type: string) => void,
    onClose: () => void,
  ) => (
    <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 flex-shrink-0">
      <select
        value={currentType}
        onChange={(e) => onTypeChange(e.target.value)}
        className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
      >
        {CONTENT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        onClick={onClose}
        className="text-gray-500 hover:text-gray-300 px-1"
        title="Close panel"
      >
        ×
      </button>
    </div>
  );

  // Helper to render terminal or status indicator (used in both center and bottom positions)
  const renderTerminalOrStatus = () => {
    if (session.status === 'active') {
      return <TerminalView sessionId={session.id} active={true} fontSize={panel.fontSize} onWsMessage={handleWsMessage} />;
    }
    if (session.status === 'queued') {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <p className="text-lg">Queued</p>
            <p className="text-sm">Position {session.position}</p>
          </div>
        </div>
      );
    }
    return (
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
    );
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`rounded-lg border ${
        session.needsInput
          ? 'border-amber-400 ring-2 ring-amber-400/50'
          : focused
            ? 'border-gray-600'
            : 'border-gray-700'
      } bg-gray-800 overflow-hidden flex flex-col`}
    >
      {/* Header + Toolbar (merged single row) */}
      <div className="flex items-center px-2 py-1 border-b border-gray-700 bg-gray-800/50 gap-1 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[session.status]}`} />
          <span className="text-sm font-medium truncate max-w-[180px]">{session.title || 'Untitled'}</span>
          {session.needsInput && (
            <span className="text-sm text-amber-400 animate-pulse font-bold" title="Needs input">!</span>
          )}
          {session.lock && (
            <span className="text-xs text-gray-400" title="Pinned">📌</span>
          )}
        </div>
        {showToolbar && (
          <div className="flex items-center gap-0.5 flex-1 justify-center min-w-0 flex-wrap">
            <button
              onClick={() => handleTogglePanel('files')}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                panel.leftPanel === 'files' || panel.rightPanel === 'files'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="File Explorer (Ctrl+Shift+F for search)"
            >
              Files
            </button>
            <button
              onClick={() => handleTogglePanel('git')}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                panel.leftPanel === 'git' || panel.rightPanel === 'git'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="Git Changes"
            >
              Git
            </button>
            <div className="w-px h-3.5 bg-gray-600 mx-0.5" />
            <button
              onClick={() => {
                if (panel.terminalVisible && !showLeftPanel && !showRightPanel) return;
                panel.setTerminalVisible(!panel.terminalVisible);
              }}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors relative ${
                panel.terminalVisible
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title={panel.terminalVisible ? 'Hide Claude Code' : 'Show Claude Code'}
            >
              Claude
              {!panel.terminalVisible && session.needsInput && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
            </button>
            {panel.terminalVisible && (
              <button
                onClick={() => {
                  userOverrideRef.current = true;
                  panel.setTerminalPosition(panel.terminalPosition === 'center' ? 'bottom' : 'center');
                }}
                className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded"
                title={panel.terminalPosition === 'center' ? 'Move terminal to bottom' : 'Move terminal to side'}
              >
                {panel.terminalPosition === 'center' ? '\u2B07' : '\u2B06'}
              </button>
            )}
            <button
              onClick={() => handleTogglePanel('preview')}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                panel.leftPanel === 'preview' || panel.rightPanel === 'preview'
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="Web Preview"
            >
              Preview
            </button>
            <div className="w-px h-3.5 bg-gray-600 mx-0.5" />
            <button
              onClick={() => panel.setFontSize(Math.max(panel.fontSize - 2, 8))}
              className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="text-xs text-gray-500 w-5 text-center">{panel.fontSize}</span>
            <button
              onClick={() => panel.setFontSize(Math.min(panel.fontSize + 2, 28))}
              className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded"
              title="Increase font size"
            >
              A+
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* Main Content — Vertical split: [Top Zone] / [Bottom Zone (terminal)] */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col min-h-[300px]"
        style={{ cursor: resizingVertical ? 'row-resize' : resizingSide ? 'col-resize' : undefined }}
      >
        {/* Top Zone — horizontal layout */}
        <div
          className="flex min-w-0 min-h-0"
          style={{ flex: showBottomZone ? '1 1 0%' : '1 1 auto' }}
        >
          {/* Left Panel */}
          {showLeftPanel && (
            <div
              className="border-r border-gray-700 flex flex-col overflow-hidden min-w-0"
              style={{ width: `${effectiveLeftWidth}%` }}
            >
              {renderPanelHeader(
                panel.leftPanel as string,
                (type) => panel.setLeftPanel(type as typeof panel.leftPanel),
                closeLeftPanel,
              )}
              <div className="flex-1 min-h-0">
                {renderPanelContent(panel.leftPanel as string, 'left')}
              </div>
            </div>
          )}

          {/* Drag Handle — between left panel and terminal (center mode) */}
          {showLeftPanel && terminalInTopZone && (
            <div
              className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
              onMouseDown={handleLeftMouseDown}
            />
          )}

          {/* Drag Handle — between left and right panels (bottom mode, both open) */}
          {showLeftPanel && showRightPanel && !terminalInTopZone && (
            <div
              className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
              onMouseDown={handleLeftMouseDown}
            />
          )}

          {/* Terminal — full width when not in IDE mode, center position in IDE mode */}
          {(!showToolbar || terminalInTopZone) && (
            <div
              className="flex flex-col min-w-0"
              style={{ width: showToolbar ? `${effectiveTerminalWidth}%` : '100%' }}
            >
              {renderTerminalOrStatus()}
            </div>
          )}

          {/* Drag Handle — between terminal and right panel (center mode) */}
          {showRightPanel && terminalInTopZone && (
            <div
              className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
              onMouseDown={handleRightMouseDown}
            />
          )}

          {/* Right Panel */}
          {showRightPanel && (
            <div
              className="border-l border-gray-700 flex flex-col overflow-hidden min-w-0"
              style={{ width: `${effectiveRightWidth}%` }}
            >
              {renderPanelHeader(
                panel.rightPanel as string,
                (type) => panel.setRightPanel(type as typeof panel.rightPanel),
                closeRightPanel,
              )}
              <div className="flex-1 min-h-0">
                {renderPanelContent(panel.rightPanel as string, 'right')}
              </div>
            </div>
          )}
        </div>

        {/* Horizontal Drag Handle (between top and bottom zones) */}
        {showBottomZone && (
          <div
            className="h-1 cursor-row-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0"
            onMouseDown={handleVerticalMouseDown}
          />
        )}

        {/* Bottom Zone — terminal in bottom position (full width) */}
        {showBottomZone && (
          <div
            className="border-t border-gray-700 min-h-[150px]"
            style={{ flex: `0 0 ${panel.bottomHeightPercent}%` }}
          >
            {renderTerminalOrStatus()}
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
