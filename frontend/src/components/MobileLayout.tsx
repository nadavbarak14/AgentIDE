import { useRef, useCallback, type ReactNode } from 'react';
import { MobileTopBar } from './MobileTopBar';
import { MobileActionBar } from './MobileActionBar';
import { MobileApprovalCard } from './MobileApprovalCard';
import { MobileHamburgerMenu } from './MobileHamburgerMenu';
import { MobileSheetOverlay } from './MobileSheetOverlay';
import { MobileSessionList } from './MobileSessionList';
import { MobilePreviewSheet } from './MobilePreviewSheet';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { ShellTerminal } from './ShellTerminal';
import { useMobilePanel, type MobilePanelName } from '../hooks/useMobilePanel';
import type { Session } from '../services/api';

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
}

export function MobileLayout({
  viewportHeight,
  keyboardOpen,
  keyboardOffset,
  sessions,
  activeSessions,
  currentSessionId,
  onFocusSession,
  onSetCurrentSession,
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
}: MobileLayoutProps) {
  const { activePanel, open, close } = useMobilePanel();

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
      />

      {/* Content Area — terminal fills this */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {children}

        {/* Approval Card Overlay */}
        {isWaiting && (
          <MobileApprovalCard
            onAccept={() => sendInput('y\r')}
            onReject={() => sendInput('n\r')}
          />
        )}
      </div>

      {/* Action Bar */}
      <MobileActionBar
        onSend={sendInput}
        onScrollToTop={terminalScrollToTop}
        onScrollToBottom={terminalScrollToBottom}
        isScrolledUp={isScrolledUp}
        isWaiting={isWaiting}
        keyboardOffset={keyboardOpen ? keyboardOffset : 0}
      />

      {/* Hamburger Menu Overlay */}
      {activePanel === 'hamburger' && (
        <MobileHamburgerMenu
          onSelectPanel={handlePanelSelect}
          onClose={close}
          onNewSession={() => { close(); onNewSession(); }}
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

      {/* Preview Overlay */}
      {activePanel === 'preview' && currentSessionId && (
        <MobilePreviewSheet
          sessionId={currentSessionId}
          port={previewPort || 0}
          localPort={previewLocalPort || 0}
          detectedPorts={detectedPorts}
          isLocalSession={isLocalSession}
          onClose={close}
        />
      )}
    </div>
  );
}
