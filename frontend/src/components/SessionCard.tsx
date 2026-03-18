import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TerminalView, type TerminalViewHandle } from './TerminalView';
import { ClaudeActionBar } from './ClaudeActionBar';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { ScrollbackTerminal } from './ScrollbackTerminal';
import { ShellTerminal } from './ShellTerminal';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { StreamPreview } from './StreamPreview';
import { useStreamPreview } from '../hooks/useStreamPreview';
import { ProjectSearch } from './ProjectSearch';
import { GitHubIssues } from './GitHubIssues';
import { ExtensionPanel, type ExtensionPanelHandle } from './ExtensionPanel';
import { WidgetPanel } from './WidgetPanel';
import { usePanel } from '../hooks/usePanel';
import { useExtensions } from '../hooks/useExtensions';
import { useWidgets } from '../hooks/useWidgets';
import { sessions as sessionsApi, type Session, type Worker } from '../services/api';
import type { WsServerMessage } from '../services/ws';
import { WorkerBadge } from './WorkerBadge';
import type { UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import { calculatePanelWidths, calculateVerticalSplit, clampResizePercent } from '../utils/panelLayout';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { useClaudeMode } from '../hooks/useClaudeMode';

interface SessionCardProps {
  session: Session;
  workers?: Worker[];
  focused?: boolean;
  isCurrent?: boolean;
  isSingleView?: boolean;
  onKill?: (id: string) => void;
  onToggleLock?: (id: string, lock: boolean) => void;
  onDelete?: (id: string) => void;
  onSetCurrent?: (id: string) => void;
  isZoomed?: boolean;
  onToggleZoom?: (id: string) => void;
  sessionNumber?: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
  crashed: 'bg-amber-500',
};

export function SessionCard({
  session,
  workers,
  focused = false,
  isCurrent = false,
  isSingleView: _isSingleView = false,
  onKill,
  onToggleLock,
  onDelete,
  onSetCurrent: _onSetCurrent,
  isZoomed = false,
  onToggleZoom,
  sessionNumber,
}: SessionCardProps) {
  const panel = usePanel(session.id, isZoomed ? 'zoomed' : 'grid');
  const { extensionsWithPanel, getExtension, refresh: refreshExtensions } = useExtensions();
  const { widgets, activeWidget, addWidget, removeWidget, widgetCount } = useWidgets();

  // Per-session extension opt-in (persisted server-side for real skill isolation)
  const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
  const [showExtPicker, setShowExtPicker] = useState(false);

  // Load widgets + extensions from server in a single request (batched metadata)
  useEffect(() => {
    fetch(`/api/sessions/${session.id}/metadata`)
      .then(r => r.json())
      .then(data => {
        // Restore widgets
        if (Array.isArray(data.widgets) && data.widgets.length > 0) {
          const w = data.widgets[0];
          if (w.name && w.html) addWidget(w.name, w.html);
        }
        // Restore enabled extensions
        if (Array.isArray(data.extensions)) setEnabledExtensions(data.extensions);
      })
      .catch(() => {});
  }, [session.id, addWidget]);

  // Only show extensions the user has enabled for this session
  const activeExtensions = useMemo(
    () => extensionsWithPanel.filter((e) => enabledExtensions.includes(e.name)),
    [extensionsWithPanel, enabledExtensions],
  );

  const toggleExtension = useCallback((name: string) => {
    setEnabledExtensions((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      // Persist to server + sync skills into session's .claude/skills/
      fetch(`/api/sessions/${session.id}/extensions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => {});
      return next;
    });
  }, [session.id]);


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
  // Track if preview was ever shown in the right panel — once true, LivePreview stays
  // mounted (hidden via display:none) so the iframe is preserved across panel switches.
  const previewMountedRef = useRef(false);
  if (panel.rightPanel === 'preview') previewMountedRef.current = true;
  const previewMounted = previewMountedRef.current;
  // Connection status for remote sessions
  const [connectionLost, setConnectionLost] = useState(false);

  // Mobile UX: terminal ref, output buffer, Claude mode detection
  const { isMobile, keyboardOpen, keyboardOffset } = useVisualViewport();
  const terminalViewRef = useRef<TerminalViewHandle>(null);
  const outputBufferRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_outputBufferState, setOutputBufferState] = useState<string[]>([]);
  const { mode: claudeMode } = useClaudeMode(session.needsInput, session.status, session.waitReason);

  const handleTerminalBinaryData = useCallback((data: ArrayBuffer) => {
    // Decode and track last 10 lines for Claude mode detection
    const text = new TextDecoder().decode(data);
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      const buf = outputBufferRef.current;
      buf.push(...lines);
      if (buf.length > 10) buf.splice(0, buf.length - 10);
      setOutputBufferState([...buf]);
    }
  }, []);

  // Bridge ref for view-* board command relay
  const previewBridgeRef = useRef<UsePreviewBridgeReturn | null>(null);
  // Extension panel refs for forwarding board commands to extension iframes
  const extensionPanelRefs = useRef<Record<string, ExtensionPanelHandle | null>>({});

  const handleWsMessage = useCallback((msg: WsServerMessage) => {
    // Handle connection_lost / connection_restored for remote sessions
    if (msg.type === 'connection_lost') {
      setConnectionLost(true);
    }
    if (msg.type === 'connection_restored') {
      setConnectionLost(false);
    }
    if (msg.type === 'file_changed') {
      if (fileChangeDebounceRef.current) {
        clearTimeout(fileChangeDebounceRef.current);
      }
      fileChangeDebounceRef.current = setTimeout(() => {
        setFileChangeVersion((v) => v + 1);
      }, 1000);
      // Forward report.html changes to work-report extension
      const paths = (msg as { paths?: string[] }).paths ?? [];
      if (paths.some((p: string) => p.endsWith('report.html') || p.endsWith('/report.html'))) {
        const ref = extensionPanelRefs.current['work-report'];
        if (ref) {
          ref.sendToExtension({ type: 'board-command', command: 'report.file_changed', params: {} });
        }
      }
    }
    if (msg.type === 'port_detected') {
      setDetectedPort({ port: msg.port, localPort: msg.localPort });
    }
    // Handle board commands from Claude skills (HTTP POST → WebSocket)
    if (msg.type === 'board_command') {
      try {
        // Smart open: ensure the target panel is visible (never toggle off)
        const ensurePanelOpen = (panelType: string) => {
          const pt = panelType as import('../hooks/usePanel').PanelContent;
          // Already showing in either side → nothing to do
          if (panel.leftPanel === pt || panel.rightPanel === pt) return;

          // Determine default side: files→left, extensions use their config, others→right
          let defaultSide: 'left' | 'right' = 'right';
          if (panelType === 'files') {
            defaultSide = 'left';
          } else if (panelType.startsWith('ext:')) {
            const ext = getExtension(panelType.slice(4));
            defaultSide = ext?.panelConfig?.defaultPosition ?? 'right';
          }

          const leftOccupied = panel.leftPanel !== 'none';
          const rightOccupied = panel.rightPanel !== 'none';

          if (defaultSide === 'left') {
            if (!leftOccupied) panel.setLeftPanel(pt);
            else if (!rightOccupied) panel.setRightPanel(pt);
            else panel.setLeftPanel(pt); // replace default side
          } else {
            if (!rightOccupied) panel.setRightPanel(pt);
            else if (!leftOccupied) panel.setLeftPanel(pt);
            else panel.setRightPanel(pt); // replace default side
          }
        };

        if (msg.command === 'open_file' && msg.params.path) {
          panel.addFileTab(msg.params.path);
          ensurePanelOpen('files');
          if (msg.params.line) {
            panel.updateScrollPosition(msg.params.path, {
              line: parseInt(msg.params.line, 10) || 1,
              column: 1,
            });
          }
        } else if (msg.command === 'show_panel' && msg.params.panel) {
          ensurePanelOpen(msg.params.panel);
          // If opening preview with a URL, navigate to it once the bridge is ready
          if (msg.params.panel === 'preview' && msg.params.url) {
            console.log(`[BoardCommand] Setting preview URL to: "${msg.params.url}"`);
            panel.setPreviewUrl(msg.params.url);
            // The LivePreview navigateTo is driven by requestedUrl prop + a counter
            // Bump a counter to force re-navigation even if URL is same as before
            panel.bumpPreviewNavCounter();
          }
        } else if (msg.command === 'show_diff') {
          ensurePanelOpen('git');
        } else if (msg.command === 'set_preview_resolution' || msg.command === 'view-set-resolution') {
          const w = parseInt(msg.params.width, 10);
          const h = parseInt(msg.params.height, 10);
          if (w > 0 && w <= 4096 && h > 0 && h <= 4096) {
            panel.setCustomViewport(w, h);
            ensurePanelOpen('preview');
          }
        } else if (msg.command === 'view-set-device') {
          const deviceId = String(msg.params.deviceId || '');
          if (deviceId) {
            panel.setPreviewViewport('mobile');
            panel.setMobileDeviceId(deviceId);
            ensurePanelOpen('preview');
          }
        } else if (msg.command === 'view-set-desktop') {
          const desktopId = String(msg.params?.desktopId || msg.params?.deviceId || '');
          if (desktopId) {
            panel.setDesktopDeviceId(desktopId);
          }
          panel.setPreviewViewport('desktop');
          ensurePanelOpen('preview');
        } else if (msg.command && String(msg.command).startsWith('view-')) {
          // view-* board commands — relay to bridge silently (no panel flashing)
          const requestId = msg.requestId;

          const sendResult = async (result: Record<string, unknown>) => {
            if (!requestId) return;
            try {
              await fetch(`/api/sessions/${session.id}/board-command-result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, result }),
              });
            } catch { /* best effort */ }
          };

          const sendError = async (error: string) => {
            if (!requestId) return;
            try {
              await fetch(`/api/sessions/${session.id}/board-command-result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, result: { error } }),
              });
            } catch { /* best effort */ }
          };

          // Only open preview for commands that explicitly need it visible
          const needsPreviewVisible = msg.command === 'view-navigate' || msg.command === 'view-set-resolution' || msg.command === 'view-screenshot' || msg.command === 'view-read-page' || msg.command === 'view-click' || msg.command === 'view-type';
          if (needsPreviewVisible) {
            ensurePanelOpen('preview');
          }

          // Wait for bridge to be ready (preview might just be opening)
          const waitForBridge = async (timeoutMs = 10000): Promise<typeof previewBridgeRef.current> => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              if (previewBridgeRef.current?.isReady) return previewBridgeRef.current;
              await new Promise(r => setTimeout(r, 200));
            }
            // Return null if bridge never became ready — prevents sending commands into the void
            return previewBridgeRef.current?.isReady ? previewBridgeRef.current : null;
          };

          (async () => {
            try {
              const bridge = previewBridgeRef.current?.isReady
                ? previewBridgeRef.current
                : await waitForBridge();

              if (!bridge) {
                sendError('Preview is not open — open the preview panel first');
                return;
              }

              switch (msg.command) {
                case 'view-screenshot': {
                  const screenshotMode = msg.params?.mode === 'viewport' ? 'viewport' as const : 'full' as const;
                  const r = await bridge.captureScreenshotWithResult(screenshotMode);
                  if (r.dataUrl) {
                    const saveRes = await fetch(`/api/sessions/${session.id}/screenshots`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dataUrl: r.dataUrl }),
                    });
                    const saved = await saveRes.json();
                    sendResult({ path: saved.storedPath || saved.path });
                  } else {
                    sendError('Screenshot capture failed');
                  }
                  break;
                }
                case 'view-record-start': {
                  const recordMode = msg.params?.mode === 'viewport' ? 'viewport' as const : 'full' as const;
                  bridge.startRecording(recordMode);
                  break;
                }
                case 'view-record-stop': {
                  const r = await bridge.stopRecordingWithResult();
                  if (r.videoDataUrl) {
                    const saveRes = await fetch(`/api/sessions/${session.id}/recordings`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ videoDataUrl: r.videoDataUrl, durationMs: r.durationMs }),
                    });
                    const saved = await saveRes.json();
                    sendResult({ path: saved.videoPath || saved.eventsPath });
                  } else {
                    sendError('Recording stop failed');
                  }
                  break;
                }
                case 'view-navigate': {
                  if (msg.params.url) {
                    const r = await bridge.navigateTo(msg.params.url);
                    sendResult(r);
                  } else {
                    sendError('Missing url parameter');
                  }
                  break;
                }
                case 'view-click': {
                  if (msg.params.role) {
                    const r = await bridge.clickElement(msg.params.role, msg.params.name || '');
                    sendResult(r);
                  } else {
                    sendError('Missing role parameter');
                  }
                  break;
                }
                case 'view-type': {
                  if (msg.params.role && msg.params.text !== undefined) {
                    const r = await bridge.typeElement(msg.params.role, msg.params.name || '', msg.params.text);
                    sendResult(r);
                  } else {
                    sendError('Missing role or text parameter');
                  }
                  break;
                }
                case 'view-read-page': {
                  const r = await bridge.readPage();
                  sendResult(r);
                  break;
                }
                default:
                  sendError('Unknown view command: ' + msg.command);
              }
            } catch (err) {
              sendError(err instanceof Error ? err.message : 'Bridge command failed');
            }
          })();
        }

        // Handle auto-skill board commands (ext.comment, ext.select_text)
        if (msg.command === 'ext.comment' && msg.params.extension) {
          const extKey = `ext:${msg.params.extension}` as import('../hooks/usePanel').PanelContent;
          ensurePanelOpen(extKey);
          const handle = extensionPanelRefs.current[msg.params.extension];
          if (handle) {
            handle.sendToExtension({
              type: 'board-command',
              command: 'enable-inspect',
              params: msg.params.screen ? { screen: msg.params.screen } : {},
            });
          }
        } else if (msg.command === 'ext.select_text' && msg.params.extension) {
          const extKey = `ext:${msg.params.extension}` as import('../hooks/usePanel').PanelContent;
          ensurePanelOpen(extKey);
          const handle = extensionPanelRefs.current[msg.params.extension];
          if (handle) {
            handle.sendToExtension({
              type: 'board-command',
              command: 'enable-text-select',
              params: {},
            });
          }
        }

        // Handle widget board commands
        if (msg.command === 'widget.create' && msg.params.name && msg.params.html) {
          addWidget(msg.params.name, msg.params.html);
          ensurePanelOpen('widgets');
        } else if (msg.command === 'widget.dismiss' && msg.params.name) {
          removeWidget(msg.params.name);
        }

        // Forward board commands to matching extensions
        for (const ext of extensionsWithPanel) {
          if (ext.boardCommands.includes(msg.command)) {
            const handle = extensionPanelRefs.current[ext.name];
            if (handle) {
              handle.sendToExtension({
                type: 'board-command',
                command: msg.command,
                params: msg.params,
              });
            }
          }
        }
      } catch {
        // Never disrupt the terminal for command handling errors
      }
    }
  }, [panel, session.id, getExtension, extensionsWithPanel, addWidget, removeWidget]);

  useEffect(() => {
    return () => {
      if (fileChangeDebounceRef.current) clearTimeout(fileChangeDebounceRef.current);
    };
  }, []);

  const showToolbar = (session.status === 'active' || session.status === 'completed') && !(isMobile && keyboardOpen);
  const showLeftPanel = showToolbar && panel.leftPanel !== 'none';
  const showRightPanel = showToolbar && panel.rightPanel !== 'none';

  // StreamPreview hooks — one for each possible preview slot
  const rightPreviewEnabled = showRightPanel && panel.rightPanel === 'preview';
  const leftPreviewEnabled = showLeftPanel && panel.leftPanel === 'preview';
  const rightPreview = useStreamPreview(session.id, rightPreviewEnabled);
  const leftPreview = useStreamPreview(session.id, leftPreviewEnabled);
  // Detected ports array for StreamPreview port selector
  const detectedPorts = detectedPort ? [detectedPort] : undefined;

  // Drag handle resize logic
  const rafRef = useRef<number | null>(null);

  const handleLeftMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingSide('left');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingSide('right');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    if (!resizingSide) return;

    const tInTop = showToolbar && panel.terminalPosition === 'center' && panel.terminalVisible;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const percent = ((e.clientX - rect.left) / containerWidth) * 100;

        if (resizingSide === 'left') {
          const clamped = clampResizePercent(
            percent, 'left', containerWidth, panel.rightWidthPercent, showRightPanel, tInTop,
          );
          panel.setLeftWidth(clamped);
        } else {
          const rightPercent = 100 - percent;
          const clamped = clampResizePercent(
            rightPercent, 'right', containerWidth, panel.leftWidthPercent, showLeftPanel, tInTop,
          );
          panel.setRightWidth(clamped);
        }
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setResizingSide(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.dispatchEvent(new CustomEvent('c3:panel-resized'));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resizingSide, panel, showLeftPanel, showRightPanel, showToolbar, isZoomed]);

  // Vertical drag resize (between top and bottom zones)
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingVertical(true);
    userOverrideRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    if (!resizingVertical) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const containerHeight = rect.height;
        const topPercent = ((e.clientY - rect.top) / containerHeight) * 100;
        const bottomPercent = 100 - topPercent;

        const result = calculateVerticalSplit({ containerHeight, bottomPercent });
        panel.setBottomHeight(result.bottomPercent);
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setResizingVertical(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.dispatchEvent(new CustomEvent('c3:panel-resized'));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [resizingVertical, panel]);

  // Auto-position terminal: stay in center (top zone) when panels open,
  // return to center when all panels close (035-save-panel-position)
  useEffect(() => {
    if (!showToolbar) return;
    if (userOverrideRef.current) return;

    const anyPanelOpen = showLeftPanel || showRightPanel;
    if (!anyPanelOpen && panel.terminalPosition === 'bottom') {
      panel.setTerminalPosition('center');
    }
  }, [showLeftPanel, showRightPanel, panel.terminalPosition, showToolbar, panel]);

  // Respect restored terminal position: if loaded as 'bottom', treat as user override
  // so auto-switching doesn't move it back to center
  useEffect(() => {
    if (panel.terminalPosition === 'bottom') {
      userOverrideRef.current = true;
    }
  }, [session.id]); // eslint-disable-line -- only on session change (initial load)

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

  // Handle outbound board commands from extension iframes
  const handleExtensionBoardCommand = useCallback((command: string, params: Record<string, string>) => {
    try {
      const pt = params.panel as import('../hooks/usePanel').PanelContent | undefined;
      if (command === 'show_panel' && pt) {
        // Extension wants to open a panel
        const ensureOpen = (panelType: string) => {
          const p = panelType as import('../hooks/usePanel').PanelContent;
          if (panel.leftPanel === p || panel.rightPanel === p) return;
          const rightOccupied = panel.rightPanel !== 'none';
          if (!rightOccupied) panel.setRightPanel(p);
          else panel.setLeftPanel(p);
        };
        ensureOpen(params.panel);
      } else if (command === 'open_file' && params.path) {
        panel.addFileTab(params.path);
      }
    } catch {
      // Never disrupt terminal
    }
  }, [panel]);

  // Handle comments from extension iframes
  const handleExtensionComment = useCallback(async (text: string, context: Record<string, string>) => {
    try {
      const contextParts = Object.entries(context)
        .map(([k, v]) => `[${k}: ${v}]`)
        .join(' ');
      const formatted = contextParts ? `${contextParts}\n${text}` : text;
      await sessionsApi.input(session.id, formatted + '\n');
    } catch {
      // Ignore errors
    }
  }, [session.id]);

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

  // Effective panel widths — calculated via pure utility for correctness
  const { leftWidth: effectiveLeftWidth, rightWidth: effectiveRightWidth, terminalWidth: effectiveTerminalWidth } = calculatePanelWidths({
    containerWidth: containerRef.current?.getBoundingClientRect().width || 1920,
    leftPercent: panel.leftWidthPercent,
    rightPercent: panel.rightWidthPercent,
    showLeft: showLeftPanel,
    showRight: showRightPanel,
    terminalInTopZone,
  });

  const handleTogglePanel = useCallback((panelType: string) => {
    const pt = panelType as import('../hooks/usePanel').PanelContent;

    // Shell uses bottom panel slot
    if (panelType === 'shell') {
      panel.setBottomPanel(panel.bottomPanel === 'shell' ? 'none' : 'shell');
      return;
    }

    // Check if any panel already shows this content type — toggle off
    const leftShows = panel.leftPanel === pt;
    const rightShows = panel.rightPanel === pt;

    if (leftShows) {
      panel.setLeftPanel('none');
      return;
    }
    if (rightShows) {
      panel.setRightPanel('none');
      return;
    }

    // Smart placement: prefer default side, fall back to other side if occupied
    let defaultSide: 'left' | 'right' = panelType === 'files' ? 'left' : 'right';
    if (panelType.startsWith('ext:')) {
      const ext = getExtension(panelType.slice(4));
      defaultSide = ext?.panelConfig?.defaultPosition ?? 'right';
    }
    const leftOccupied = panel.leftPanel !== 'none';
    const rightOccupied = panel.rightPanel !== 'none';

    if (defaultSide === 'left') {
      if (!leftOccupied) {
        panel.setLeftPanel(pt);
      } else if (!rightOccupied) {
        panel.setRightPanel(pt);
      } else {
        panel.setLeftPanel(pt);
      }
    } else {
      if (!rightOccupied) {
        panel.setRightPanel(pt);
      } else if (!leftOccupied) {
        panel.setLeftPanel(pt);
      } else {
        panel.setRightPanel(pt);
      }
    }
  }, [panel, getExtension]);

  // Close extension picker on outside click
  useEffect(() => {
    if (!showExtPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.('[data-ext-picker]')) setShowExtPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExtPicker]);

  // Track chord armed state for showing key hints on tabs
  const [chordArmed, setChordArmed] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      setChordArmed((e as CustomEvent).detail?.armed ?? false);
    };
    window.addEventListener('c3:chord', handler);
    return () => window.removeEventListener('c3:chord', handler);
  }, []);

  // Listen for global keyboard shortcut events dispatched from Dashboard
  useEffect(() => {
    if (!showToolbar) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId !== session.id) return;
      switch (detail.action) {
        case 'toggle_files':
          handleTogglePanel('files');
          break;
        case 'toggle_git':
          handleTogglePanel('git');
          break;
        case 'toggle_preview':
          handleTogglePanel('preview');
          break;
        case 'toggle_claude':
          if (panel.terminalVisible && !showLeftPanel && !showRightPanel) break;
          panel.setTerminalVisible(!panel.terminalVisible);
          break;
        case 'toggle_issues':
          handleTogglePanel('issues');
          break;
        case 'toggle_shell':
          handleTogglePanel('shell');
          break;
        case 'search_files':
          if (panel.leftPanel !== 'files') panel.setLeftPanel('files');
          setSidebarView('search');
          break;
        case 'font_decrease':
          panel.setFontSize(Math.max(panel.fontSize - 2, 8));
          break;
        case 'font_increase':
          panel.setFontSize(Math.min(panel.fontSize + 2, 28));
          break;
        case 'toggle_terminal_position':
          userOverrideRef.current = true;
          panel.setTerminalPosition(panel.terminalPosition === 'center' ? 'bottom' : 'center');
          break;
      }
    };
    window.addEventListener('c3:shortcut', handler);
    return () => window.removeEventListener('c3:shortcut', handler);
  }, [showToolbar, session.id, panel, handleTogglePanel, showLeftPanel, showRightPanel]);

  // Send selected shell text to the Claude session as input
  const handleShellSendToClaude = useCallback(async (text: string) => {
    if (!text.trim() || session.status !== 'active') return;
    try {
      const message = `[Shell output]\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
      await sessionsApi.input(session.id, message);
    } catch {
      // Ignore errors (session might have completed)
    }
  }, [session.id, session.status]);

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
  const CONTENT_OPTIONS: readonly { value: string; label: string }[] = [
    { value: 'files', label: 'Files' },
    { value: 'git', label: 'Git' },
    { value: 'preview', label: 'Preview' },
    { value: 'issues', label: 'Issues' },
    ...(widgetCount > 0 ? [{ value: 'widgets', label: 'Canvas' }] : []),
    ...activeExtensions.map((ext) => ({
      value: ext.panelKey,
      label: ext.displayName,
    })),
  ];

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
      case 'preview': {
        // Right panel preview is rendered outside this switch (always-mounted for iframe persistence)
        if (slot === 'right') return null;
        // Left panel preview — render normally (rare case)
        return (
          <StreamPreview
            sessionId={session.id}
            status={leftPreview.status}
            frame={leftPreview.frame}
            currentUrl={leftPreview.currentUrl}
            onNavigate={leftPreview.navigate}
            onMouse={leftPreview.sendMouse}
            onKey={leftPreview.sendKey}
            onScroll={leftPreview.sendScroll}
            onTouch={leftPreview.sendTouch}
            onResize={leftPreview.sendResize}
            onClose={closeLeftPanel}
            detectedPorts={detectedPorts}
          />
        );
      }
      case 'issues':
        return (
          <GitHubIssues
            sessionId={session.id}
            onSendToClaude={(text) => {
              sessionsApi.input(session.id, text + '\n').catch(() => {});
            }}
            onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
          />
        );
      case 'widgets':
        return (
          <WidgetPanel
            widgets={widgets}
            activeWidget={activeWidget}
            sessionId={session.id}
            onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
            onSetActiveWidget={() => {}}
            onDismissWidget={removeWidget}
          />
        );
      default:
        // Extension panels: ext:<name>
        if (contentType.startsWith('ext:')) {
          const extName = contentType.slice(4);
          const ext = getExtension(extName);
          if (ext) {
            return (
              <ExtensionPanel
                ref={(handle) => { extensionPanelRefs.current[extName] = handle; }}
                extension={ext}
                sessionId={session.id}
                onClose={slot === 'left' ? closeLeftPanel : closeRightPanel}
                onBoardCommand={handleExtensionBoardCommand}
                onSendComment={handleExtensionComment}
              />
            );
          }
        }
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
      return (
        <div className="relative h-full">
          <TerminalView ref={terminalViewRef} sessionId={session.id} active={true} fontSize={panel.fontSize} onWsMessage={handleWsMessage} onBinaryData={handleTerminalBinaryData} />
          {connectionLost && (
            <div className="absolute inset-0 flex items-center justify-center bg-amber-900/40 z-10">
              <div className="bg-gray-900/90 border border-amber-500 rounded px-4 py-2 text-center">
                <p className="text-amber-400 text-sm font-medium">Connection lost</p>
                <p className="text-gray-400 text-xs mt-1">Reconnecting...</p>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (session.status === 'crashed') {
      return <ScrollbackTerminal sessionId={session.id} fontSize={panel.fontSize} />;
    }
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-lg capitalize">{session.status}</p>
          {session.claudeSessionId && (
            <p className="text-xs mt-1">Session: {session.claudeSessionId.slice(0, 12)}...</p>
          )}
        </div>
      </div>
    );
  };

  // ── Layout ──────────────────────────────────────────────────
  return (
    <div
      data-session-id={session.id}
      onKeyDown={handleKeyDown}
      className={`rounded-lg border-2 ${
        isCurrent && session.needsInput
          ? 'border-blue-500 ring-2 ring-blue-500/50 bg-yellow-400/20'
          : session.needsInput
            ? 'border-amber-400 ring-2 ring-amber-400/50 bg-gray-800'
            : isCurrent
              ? 'border-blue-500 ring-2 ring-blue-500/50 bg-yellow-500/10'
              : focused
                ? 'border-gray-600'
                : 'border-gray-700'
      } overflow-hidden flex flex-col overscroll-contain`}
    >
      {/* Header row — hidden on mobile when keyboard open */}
      <div className={`flex items-center px-2 py-1 border-b border-gray-700 bg-gray-800/50 gap-1 flex-shrink-0 relative${isMobile && keyboardOpen ? ' hidden' : ''}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          {sessionNumber != null && (
            <span className="w-4 h-4 flex-shrink-0 text-[10px] font-bold rounded bg-gray-700 text-gray-400 flex items-center justify-center">
              {sessionNumber}
            </span>
          )}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[session.status]}`} />
          <span className="text-sm font-medium truncate max-w-[180px]">{session.title || 'Untitled'}</span>
          {workers && <WorkerBadge workerId={session.workerId} workers={workers} />}
          {session.needsInput && (
            <span className="text-sm text-amber-400 animate-pulse font-bold" title={
              session.waitReason === 'permission' ? 'Needs permission'
                : session.waitReason === 'question' ? 'Has a question'
                : 'Needs input'
            }>
              {session.waitReason === 'permission' ? '\u{1F511}' : session.waitReason === 'question' ? '?' : '!'}
            </span>
          )}
          {session.lock && (
            <span className="text-xs text-gray-400" title="Pinned">📌</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500">{session.status}</span>
          <button
            onClick={() => onToggleZoom?.(session.id)}
            className="px-1 py-0.5 text-xs text-gray-400 hover:bg-blue-500/20 hover:text-blue-400 rounded relative"
            title={isZoomed ? 'Unzoom session (Ctrl+. Z)' : 'Zoom session (Ctrl+. Z)'}
            data-testid="zoom-button"
          >
            {isZoomed ? '\u29C9' : '\u25A1'}
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">Z</span>}
          </button>
          <button
            onClick={() => onToggleLock?.(session.id, !session.lock)}
            className={`px-1.5 py-0.5 text-xs rounded relative ${
              session.lock ? 'text-yellow-400 hover:bg-yellow-500/20' : 'text-gray-500 hover:bg-gray-600'
            }`}
            title={session.lock ? 'Unpin (Ctrl+. P)' : 'Pin (Ctrl+. P)'}
          >
            {session.lock ? 'Unpin' : 'Pin'}
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">P</span>}
          </button>
          {session.status === 'active' && (
            <button
              onClick={() => onKill?.(session.id)}
              className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-500/20 hover:text-red-400 rounded relative"
              title="Kill session (Ctrl+. K)"
              data-testid="close-button"
            >
              ×
              {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">K</span>}
            </button>
          )}
          {session.status === 'crashed' && (
            <button
              onClick={() => onDelete?.(session.id)}
              className="px-1.5 py-0.5 text-xs text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 rounded"
              title="Dismiss crashed session"
              data-testid="dismiss-button"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
      {/* Toolbar bar — Chrome bookmarks style: full-width row, items flow left-to-right */}
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-0.5 border-b border-gray-700 bg-gray-800/30 flex-shrink-0 flex-wrap min-w-0">
          <button
            onClick={() => handleTogglePanel('files')}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors relative ${
              panel.leftPanel === 'files' || panel.rightPanel === 'files'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="File Explorer (Ctrl+., E)"
          >
            Files
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">E</span>}
          </button>
          <button
            onClick={() => handleTogglePanel('git')}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors relative ${
              panel.leftPanel === 'git' || panel.rightPanel === 'git'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="Git Changes (Ctrl+., G)"
          >
            Git
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">G</span>}
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
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">\</span>}
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
              className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded relative"
              title={panel.terminalPosition === 'center' ? 'Move terminal to bottom (Ctrl+. T)' : 'Move terminal to side (Ctrl+. T)'}
            >
              {panel.terminalPosition === 'center' ? '\u2B07' : '\u2B06'}
              {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">T</span>}
            </button>
          )}
          <button
            onClick={() => handleTogglePanel('preview')}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              panel.leftPanel === 'preview' || panel.rightPanel === 'preview'
                ? 'bg-green-500/20 text-green-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="Web Preview (Ctrl+., V)"
          >
            Preview
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">V</span>}
          </button>
          <button
            onClick={() => handleTogglePanel('issues')}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              panel.leftPanel === 'issues' || panel.rightPanel === 'issues'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="GitHub Issues (Ctrl+., I)"
          >
            Issues
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">I</span>}
          </button>
          <button
            onClick={() => handleTogglePanel('shell')}
            className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
              panel.bottomPanel === 'shell'
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            title="Shell Terminal (Ctrl+., S)"
          >
            Shell
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">S</span>}
          </button>
          {/* Active (enabled) extension panel buttons */}
          {activeExtensions.length > 0 && (
            <>
              <div className="w-px h-3.5 bg-gray-600 mx-0.5" />
              {activeExtensions.map((ext) => (
                <button
                  key={ext.panelKey}
                  onClick={() => handleTogglePanel(ext.panelKey as 'files')}
                  className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                    panel.leftPanel === ext.panelKey || panel.rightPanel === ext.panelKey
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                  title={ext.displayName}
                >
                  {ext.displayName}
                </button>
              ))}
            </>
          )}
          {/* Extensions picker dropdown */}
          <div className="w-px h-3.5 bg-gray-600 mx-0.5" />
          <div className="relative" data-ext-picker>
            <button
              onClick={() => { refreshExtensions(); setShowExtPicker((v) => !v); }}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                showExtPicker
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              title="Select extensions for this session"
            >
              Ext ▾
            </button>
            {showExtPicker && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 min-w-[180px] py-1">
                {extensionsWithPanel.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">No extensions found</div>
                )}
                {extensionsWithPanel.map((ext) => (
                  <label
                    key={ext.name}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={enabledExtensions.includes(ext.name)}
                      onChange={() => toggleExtension(ext.name)}
                      className="rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                    />
                    {ext.displayName}
                  </label>
                ))}
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <button
                    onClick={async () => {
                      setShowExtPicker(false);
                      const instructions = [
                        'I want to create a new extension skill for AgentIDE.',
                        'An extension lives in extensions/<name>/ and needs:',
                        '1. manifest.json - with name, displayName, panel entry, skills list, and boardCommands',
                        '2. ui/ folder - with index.html, styles.css, app.js for the panel UI',
                        '3. skills/ folder - each skill in skills/<skill-name>/ with SKILL.md (description + instructions) and a shell script',
                        '',
                        'Look at extensions/frontend-design/ as a reference implementation.',
                        'The extension panel communicates with the host via postMessage bridge (ready/init/ping handshake, board-command dispatch, send-comment for sending text to Claude).',
                        '',
                        'Please ask me what kind of extension I want to create, then build it following this pattern.',
                      ].join('\n');
                      try {
                        await sessionsApi.input(session.id, instructions + '\n');
                      } catch {
                        // Ignore — session may not be ready yet
                      }
                    }}
                    disabled={session.status !== 'active'}
                    className={`w-full px-3 py-1.5 text-xs text-left ${
                      session.status === 'active'
                        ? 'text-cyan-400 hover:bg-cyan-500/10'
                        : 'text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    + Create Extension
                  </button>
                  <button
                    onClick={() => setShowExtPicker(false)}
                    className="w-full px-3 py-1 text-xs text-gray-400 hover:text-gray-200 text-left"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="w-px h-3.5 bg-gray-600 mx-0.5" />
          <button
            onClick={() => panel.setFontSize(Math.max(panel.fontSize - 2, 8))}
            className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded relative"
            title="Decrease font size (Ctrl+. -)"
          >
            A-
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">-</span>}
          </button>
          <span className="text-xs text-gray-500 w-5 text-center">{panel.fontSize}</span>
          <button
            onClick={() => panel.setFontSize(Math.min(panel.fontSize + 2, 28))}
            className="px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 rounded relative"
            title="Increase font size (Ctrl+. =)"
          >
            A+
            {chordArmed &&<span className="ml-1 px-1 py-px bg-blue-600 text-white text-[10px] rounded font-mono animate-pulse">=</span>}
          </button>
        </div>
      )}

      {/* Main Content — Vertical split: [Top Zone] / [Bottom Zone (terminal)] */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col min-h-0 overscroll-contain"
        style={{ cursor: resizingVertical ? 'row-resize' : resizingSide ? 'col-resize' : undefined }}
      >
        {/* Top Zone — horizontal layout */}
        <div
          className="flex min-w-0 min-h-0"
          style={{ flex: (showBottomZone || (showToolbar && panel.bottomPanel === 'shell')) ? '1 1 0%' : '1 1 auto' }}
        >
          {/* Left Panel — hidden on mobile */}
          {showLeftPanel && (
            <div
              className="border-r border-gray-700 hidden md:flex flex-col overflow-hidden min-w-0"
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
              className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0 hidden md:block"
              onMouseDown={handleLeftMouseDown}
            />
          )}

          {/* Drag Handle — between left and right panels (bottom mode, both open) */}
          {showLeftPanel && showRightPanel && !terminalInTopZone && (
            <div
              className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0 hidden md:block"
              onMouseDown={handleLeftMouseDown}
            />
          )}

          {/* Terminal — full width when no panels, center position when panels open */}
          {(!showToolbar || terminalInTopZone) && (
            <div
              className="flex flex-col min-w-0"
              style={{ width: (showToolbar && terminalInTopZone) ? `${effectiveTerminalWidth}%` : '100%' }}
            >
              {renderTerminalOrStatus()}
            </div>
          )}

          {/* Drag Handle — between terminal and right panel (center mode) */}
          {showRightPanel && terminalInTopZone && (
            <div
              className={`w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0 ${panel.rightPanel !== 'preview' ? 'hidden md:block' : ''}`}
              onMouseDown={handleRightMouseDown}
            />
          )}

          {/* Right Panel — always rendered when preview was shown to preserve iframe */}
          {(showRightPanel || previewMounted) && (
            <div
              className={`border-l border-gray-700 flex flex-col overflow-hidden min-w-0 ${
                !showRightPanel ? '' :
                panel.rightPanel !== 'preview' ? 'hidden md:flex' : ''
              }`}
              style={showRightPanel ? { width: `${effectiveRightWidth}%` } : { display: 'none' }}
            >
              {showRightPanel && renderPanelHeader(
                panel.rightPanel as string,
                (type) => panel.setRightPanel(type as typeof panel.rightPanel),
                closeRightPanel,
              )}
              <div className="flex-1 min-h-0">
                {/* StreamPreview — always mounted once shown, hidden when not the active panel.
                    The useStreamPreview hook controls connection based on visibility. */}
                {previewMounted && (
                  <div className="flex flex-col h-full" style={{ display: (showRightPanel && panel.rightPanel === 'preview') ? undefined : 'none' }}>
                    <StreamPreview
                      sessionId={session.id}
                      status={rightPreview.status}
                      frame={rightPreview.frame}
                      currentUrl={rightPreview.currentUrl}
                      onNavigate={rightPreview.navigate}
                      onMouse={rightPreview.sendMouse}
                      onKey={rightPreview.sendKey}
                      onScroll={rightPreview.sendScroll}
                      onTouch={rightPreview.sendTouch}
                      onResize={rightPreview.sendResize}
                      onClose={closeRightPanel}
                      detectedPorts={detectedPorts}
                    />
                  </div>
                )}
                {/* Other panel types — conditionally rendered */}
                {showRightPanel && panel.rightPanel !== 'none' && panel.rightPanel !== 'preview' && renderPanelContent(panel.rightPanel as string, 'right')}
              </div>
            </div>
          )}
        </div>

        {/* Horizontal Drag Handle (between top and bottom zones) — hidden on mobile */}
        {showBottomZone && (
          <div
            className="h-1 cursor-row-resize bg-gray-700 hover:bg-blue-500 transition-colors flex-shrink-0 hidden md:block"
            onMouseDown={handleVerticalMouseDown}
          />
        )}

        {/* Bottom Zone — terminal in bottom position (full width) — hidden on mobile */}
        {showBottomZone && (
          <div
            className="border-t border-gray-700 min-h-[150px] hidden md:block"
            style={{ flex: `0 0 ${panel.bottomHeightPercent}%` }}
          >
            {renderTerminalOrStatus()}
          </div>
        )}

        {/* Shell Terminal Bottom Zone — hidden on mobile */}
        {showToolbar && panel.bottomPanel === 'shell' && (
          <div
            className="border-t border-gray-700 min-h-[150px] hidden md:block"
            style={{ flex: '0 0 35%' }}
          >
            <ShellTerminal
              sessionId={session.id}
              active={session.status === 'active' || session.status === 'completed'}
              fontSize={panel.fontSize}
              onClose={() => panel.setBottomPanel('none')}
              onSendToClaude={session.status === 'active' ? handleShellSendToClaude : undefined}
            />
          </div>
        )}
      </div>

      {/* Footer — hide on mobile when keyboard open */}
      {!(isMobile && keyboardOpen) && (
        <div className="px-3 py-1.5 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
          <span className="truncate">{session.workingDirectory}</span>
          {session.pid && <span>PID {session.pid}</span>}
        </div>
      )}

      {/* Mobile: Claude Action Bar */}
      {isMobile && (
        <ClaudeActionBar
          mode={claudeMode}
          onSend={(data) => terminalViewRef.current?.sendInput(data)}
          keyboardOffset={keyboardOffset}
          isMobile={true}
          isScrolledUp={terminalViewRef.current?.isScrolledUp ?? false}
          onScrollToBottom={() => terminalViewRef.current?.scrollToBottom()}
        />
      )}

      {/* Mobile: Scroll to Bottom Button */}
      {isMobile && (
        <ScrollToBottomButton
          visible={terminalViewRef.current?.isScrolledUp ?? false}
          onScrollToBottom={() => terminalViewRef.current?.scrollToBottom()}
          bottomOffset={keyboardOffset + 52}
        />
      )}

    </div>
  );
}
