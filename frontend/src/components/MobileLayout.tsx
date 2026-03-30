import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { MobileTopBar } from './MobileTopBar';
import { MobileActionBar } from './MobileActionBar';
import { MobileHamburgerMenu } from './MobileHamburgerMenu';
import { MobileSheetOverlay } from './MobileSheetOverlay';
import { MobileSessionList } from './MobileSessionList';
import { MobilePreviewSheet } from './MobilePreviewSheet';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { ShellTerminal } from './ShellTerminal';
import { GitHubIssues } from './GitHubIssues';
import { WidgetPanel } from './WidgetPanel';
import { type ExtensionPanelHandle } from './ExtensionPanel';
import { MobileExtensionTabs } from './MobileExtensionTabs';
import { SettingsPanel } from './SettingsPanel';
import { useMobilePanel, type MobilePanelName } from '../hooks/useMobilePanel';
import { useExtensions } from '../hooks/useExtensions';
import { useWidgets } from '../hooks/useWidgets';
import { ProjectDetail } from './ProjectDetail';
import { CreateProjectModal } from './CreateProjectModal';
import type { Settings, Worker, Session, ProjectTree } from '../services/api';

export interface MobileLayoutHandle {
  /** Forward file_changed paths from WS so extensions (e.g. work-report) can react */
  handleFileChanged: (paths: string[]) => void;
}

interface MobileLayoutProps {
  viewportHeight: number;
  keyboardOpen: boolean;
  keyboardOffset: number;
  sessions: Session[];
  activeSessions: Session[];
  currentSessionId: string | null;
  onFocusSession: (id: string) => void;
  onSetCurrentSession: (id: string | null) => void;
  onNewSession: () => void;
  children: ReactNode;
  terminalSendInput?: (data: string) => void;
  terminalScrollToTop?: () => void;
  terminalScrollToBottom?: () => void;
  isScrolledUp?: boolean;
  isWaiting?: boolean;
  onKillSession?: (id: string) => void;
  /** Preview port info for the current session */
  previewPort?: number;
  previewLocalPort?: number;
  detectedPorts?: { port: number; localPort: number }[];
  isLocalSession?: boolean;
  /** Settings panel props */
  settings?: Settings | null;
  onSettingsChange?: (settings: Settings) => void;
  workers?: Worker[];
  onWorkersChange?: (workers: Worker[]) => void;
  /** Project props */
  projectTree?: ProjectTree[];
  selectedProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
  onStartAgent?: (projectId: string, workDir: string, project: ProjectTree) => void;
}

export const MobileLayout = forwardRef<MobileLayoutHandle, MobileLayoutProps>(function MobileLayout({
  viewportHeight,
  keyboardOpen,
  keyboardOffset,
  sessions,
  activeSessions,
  currentSessionId,
  onFocusSession,
  onSetCurrentSession: _onSetCurrentSession,
  onNewSession,
  onKillSession,
  children,
  terminalSendInput,
  terminalScrollToTop,
  terminalScrollToBottom,
  isScrolledUp,
  isWaiting,
  previewPort,
  previewLocalPort,
  detectedPorts,
  isLocalSession,
  settings,
  onSettingsChange,
  workers,
  onWorkersChange,
  projectTree,
  selectedProjectId: _selectedProjectId,
  onSelectProject: _onSelectProject,
  onStartAgent: onStartAgentProp,
}, ref) {
  const { activePanel, open, close } = useMobilePanel();

  // Extensions and widgets
  const { extensionsWithPanel } = useExtensions();
  const { widgets, activeWidget, removeWidget, widgetCount } = useWidgets();

  // Projects state
  const [mobileOpenProjectId, setMobileOpenProjectId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Per-session extension enablement (same as SessionCard)
  const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);

  // Load enabled extensions from server when session changes
  useEffect(() => {
    if (!currentSessionId) { setEnabledExtensions([]); return; }
    fetch(`/api/sessions/${currentSessionId}/metadata`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.extensions)) setEnabledExtensions(data.extensions);
      })
      .catch(() => {});
  }, [currentSessionId]);

  const toggleExtension = useCallback((name: string) => {
    if (!currentSessionId) return;
    setEnabledExtensions((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      fetch(`/api/sessions/${currentSessionId}/extensions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => {});
      return next;
    });
  }, [currentSessionId]);

  // Extension panel state
  const [activeExtensionName, setActiveExtensionName] = useState<string | null>(null);
  // Ref to the currently rendered extension panel for forwarding board commands
  const extensionPanelRef = useRef<ExtensionPanelHandle | null>(null);

  // Expose handleFileChanged so Dashboard can forward WS file_changed events
  useImperativeHandle(ref, () => ({
    handleFileChanged: (paths: string[]) => {
      if (paths.some((p: string) => p.endsWith('report.html') || p.endsWith('/report.html'))) {
        // Forward to work-report extension if it's currently rendered
        if (activeExtensionName === 'work-report' && extensionPanelRef.current) {
          extensionPanelRef.current.sendToExtension({
            type: 'board-command',
            command: 'report.file_changed',
            params: {},
          });
        }
      }
    },
  }), [activeExtensionName]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const waitingCount = activeSessions.filter(
    (s) => s.needsInput && s.id !== currentSessionId,
  ).length;

  // File viewer state
  const fileViewerState = useRef<{ path: string; tabs: string[]; activeTab: number }>({
    path: '',
    tabs: [],
    activeTab: 0,
  });

  const handleFileSelect = useCallback((path: string) => {
    const state = fileViewerState.current;
    if (!state.tabs.includes(path)) {
      state.tabs = [...state.tabs, path];
    }
    state.path = path;
    state.activeTab = state.tabs.indexOf(path);
  }, []);

  const handleHamburgerTap = useCallback(() => {
    open('hamburger');
  }, [open]);

  const handleSessionTap = useCallback(() => {
    open('sessions');
  }, [open]);

  const handlePanelSelect = useCallback((panel: MobilePanelName) => {
    close(); // Close hamburger
    // Open the selected panel after hamburger closes
    setTimeout(() => open(panel), 50);
  }, [open, close]);

  const handleSessionSelect = useCallback((id: string) => {
    onFocusSession(id);
    close();
  }, [onFocusSession, close]);

  const handleSelectExtension = useCallback((name: string) => {
    // Auto-enable extension for this session when opened on mobile
    if (!enabledExtensions.includes(name)) {
      toggleExtension(name);
    }
    close(); // Close extensions list
    setActiveExtensionName(name);
    setTimeout(() => open('extension'), 50);
  }, [open, close, enabledExtensions, toggleExtension]);

  const handleExtensionClose = useCallback(() => {
    setActiveExtensionName(null);
    close();
  }, [close]);

  const sendInput = useCallback((data: string) => {
    terminalSendInput?.(data);
  }, [terminalSendInput]);

  return (
    <div
      className="flex flex-col bg-gray-900 text-white overflow-hidden fixed inset-0"
      style={{
        height: viewportHeight > 0 ? `${viewportHeight}px` : '100dvh',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Top Bar */}
      <MobileTopBar
        sessionName={currentSession?.title || 'No session'}
        projectPath={currentSession?.workingDirectory || ''}
        isWaiting={isWaiting || false}
        waitingCount={waitingCount}
        sessionCount={activeSessions.length}
        onHamburgerTap={handleHamburgerTap}
        onSessionTap={handleSessionTap}
        onNewSession={onNewSession}
        onProjectsTap={() => open('projects')}
        hasProjects={!!(projectTree && projectTree.length > 0)}
      />

      {/* Content Area — terminal fills this */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {children}

      </div>

      {/* Action Bar */}
      <MobileActionBar
        onSend={sendInput}
        onScrollToTop={terminalScrollToTop}
        onScrollToBottom={terminalScrollToBottom}
        isScrolledUp={isScrolledUp}
        keyboardOffset={keyboardOpen ? keyboardOffset : 0}
      />

      {/* Hamburger Menu Overlay */}
      {activePanel === 'hamburger' && (
        <MobileHamburgerMenu
          onSelectPanel={handlePanelSelect}
          onClose={close}
          onNewSession={() => { close(); onNewSession(); }}
          onKillSession={currentSessionId && onKillSession ? () => onKillSession(currentSessionId) : undefined}
          hasActiveSession={currentSession?.status === 'active'}
          showIssues={!!currentSessionId}
          extensionCount={extensionsWithPanel.length}
          widgetCount={widgetCount}
        />
      )}

      {/* Session List Overlay */}
      {activePanel === 'sessions' && (
        <MobileSessionList
          sessions={activeSessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSessionSelect}
          onKillSession={onKillSession}
          onNewSession={() => { close(); onNewSession(); }}
          onClose={close}
        />
      )}

      {/* Files Overlay */}
      {activePanel === 'files' && currentSessionId && (
        <MobileSheetOverlay title="Files" onClose={close}>
          {fileViewerState.current.path ? (
            <FileViewer
              sessionId={currentSessionId}
              filePath={fileViewerState.current.path}
              fileTabs={fileViewerState.current.tabs}
              activeTabIndex={fileViewerState.current.activeTab}
              onClose={() => {
                fileViewerState.current.path = '';
              }}
            />
          ) : (
            <FileTree
              sessionId={currentSessionId}
              onFileSelect={handleFileSelect}
            />
          )}
        </MobileSheetOverlay>
      )}

      {/* Git Overlay */}
      {activePanel === 'git' && currentSessionId && (
        <MobileSheetOverlay title="Git Changes" onClose={close}>
          <DiffViewer
            sessionId={currentSessionId}
            onClose={close}
          />
        </MobileSheetOverlay>
      )}

      {/* Shell Overlay */}
      {activePanel === 'shell' && currentSessionId && (
        <MobileSheetOverlay title="Shell" onClose={close}>
          <ShellTerminal
            sessionId={currentSessionId}
            active={true}
          />
        </MobileSheetOverlay>
      )}

      {/* Preview Overlay — mount when panel is active OR when port exists (to preserve iframe state) */}
      {currentSessionId && (activePanel === 'preview' || previewPort) && (
        <MobilePreviewSheet
          sessionId={currentSessionId}
          port={previewPort || 0}
          localPort={previewLocalPort || 0}
          detectedPorts={detectedPorts}
          isLocalSession={isLocalSession}
          onClose={close}
          visible={activePanel === 'preview'}
        />
      )}

      {/* Projects Overlay */}
      {activePanel === 'projects' && (
        <MobileSheetOverlay title="Projects" onClose={close}>
          <div className="flex flex-col h-full">
            {projectTree && projectTree.length > 0 ? (
              <div className="flex-1 overflow-y-auto">
                {projectTree.map((project) => {
                  const activeSess = sessions.filter(s => {
                    if (s.status !== 'active') return false;
                    const nd = s.workingDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
                    const pd = project.directoryPath.replace(/\\/g, '/').replace(/\/+$/, '');
                    return pd && (nd === pd || nd.startsWith(pd + '/'));
                  });
                  return (
                    <button
                      key={project.id}
                      onClick={() => { setMobileOpenProjectId(project.id); close(); setTimeout(() => open('project-detail'), 50); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800 transition border-b border-gray-800"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeSess.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{project.displayName}</p>
                        {project.githubRepo && <p className="text-xs text-gray-500 truncate">{project.githubRepo}</p>}
                      </div>
                      {activeSess.length > 0 && <span className="text-xs text-green-400">{activeSess.length} active</span>}
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <p className="text-sm mb-3">No projects yet</p>
              </div>
            )}
            <div className="p-3 border-t border-gray-700">
              <button
                onClick={() => { close(); setCreateProjectOpen(true); }}
                className="w-full py-2.5 text-sm text-blue-400 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
              >
                + Add Project
              </button>
            </div>
          </div>
        </MobileSheetOverlay>
      )}

      {/* Project Detail Overlay */}
      {activePanel === 'project-detail' && mobileOpenProjectId && projectTree && (
        <MobileSheetOverlay title={projectTree.find(p => p.id === mobileOpenProjectId)?.displayName || 'Project'} onClose={close}>
          {(() => {
            const project = projectTree.find(p => p.id === mobileOpenProjectId);
            if (!project) return null;
            return (
              <ProjectDetail
                projectId={mobileOpenProjectId}
                project={project}
                onBack={close}
                onStartAgent={(projectId, _issueNumber) => {
                  const workDir = project.directoryPath
                    || (project.githubRepo ? `/home/ubuntu/projects/${project.githubRepo.split('/').pop()}` : '');
                  if (!workDir) return;
                  close();
                  onStartAgentProp?.(projectId, workDir, project);
                }}
              />
            );
          })()}
        </MobileSheetOverlay>
      )}

      {/* Create Project Modal (mobile) */}
      {createProjectOpen && workers && workers.length > 0 && (
        <CreateProjectModal
          isOpen={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          onCreated={() => setCreateProjectOpen(false)}
          workerId={workers[0].id}
        />
      )}

      {/* Issues Overlay */}
      {activePanel === 'issues' && currentSessionId && (
        <MobileSheetOverlay title="Issues" onClose={close}>
          <GitHubIssues
            sessionId={currentSessionId}
            onClose={close}
          />
        </MobileSheetOverlay>
      )}

      {/* Canvas/Widgets Overlay */}
      {activePanel === 'widgets' && currentSessionId && (
        <MobileSheetOverlay title="Canvas" onClose={close}>
          <WidgetPanel
            widgets={widgets}
            activeWidget={activeWidget}
            sessionId={currentSessionId}
            onClose={close}
            onSetActiveWidget={() => {}}
            onDismissWidget={removeWidget}
          />
        </MobileSheetOverlay>
      )}

      {/* Extensions List Overlay — shows enable toggle + open button */}
      {activePanel === 'extensions' && (
        <MobileSheetOverlay title="Extensions" onClose={close}>
          <div className="flex flex-col p-2 gap-1">
            {extensionsWithPanel.map((ext) => {
              const enabled = enabledExtensions.includes(ext.name);
              return (
                <div
                  key={ext.name}
                  className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectExtension(ext.name)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-gray-200 hover:text-white"
                  >
                    <span className="flex-shrink-0 text-gray-400">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2H7v4H3v6h4v4h6v-4h4V6h-4V2z" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium truncate">{ext.displayName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExtension(ext.name)}
                    className={`flex-shrink-0 w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-600'}`}
                    title={enabled ? 'Disable extension' : 'Enable extension'}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-1 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </MobileSheetOverlay>
      )}

      {/* Extension Panel Overlay — tabbed view for quick-switching between enabled extensions */}
      {activePanel === 'extension' && activeExtensionName && currentSessionId && (
        <MobileSheetOverlay title="Extensions" onClose={handleExtensionClose}>
          <MobileExtensionTabs
            extensions={extensionsWithPanel}
            enabledExtensions={enabledExtensions}
            activeExtensionName={activeExtensionName}
            sessionId={currentSessionId}
            onSelectExtension={(name) => setActiveExtensionName(name)}
            onManageExtensions={() => { close(); setTimeout(() => open('extensions'), 50); }}
            onClose={handleExtensionClose}
            extensionPanelRef={extensionPanelRef}
          />
        </MobileSheetOverlay>
      )}

      {/* Settings Overlay */}
      {activePanel === 'settings' && settings && (
        <MobileSheetOverlay title="Settings" onClose={close}>
          <SettingsPanel
            settings={settings}
            onSettingsChange={onSettingsChange || (() => {})}
            workers={workers || []}
            onWorkersChange={onWorkersChange || (() => {})}
          />
        </MobileSheetOverlay>
      )}
    </div>
  );
});
