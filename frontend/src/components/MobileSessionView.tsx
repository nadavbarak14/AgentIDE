import { useState } from 'react';
import type { Session } from '../services/api';
import type { UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import { MobileTerminalOutput } from './MobileTerminalOutput';
import { LivePreview } from './LivePreview';

type TabId = 'terminal' | 'preview' | 'files';

interface RecentFile {
  path: string;
  changeType?: 'added' | 'modified' | 'deleted';
}

interface MobileSessionViewProps {
  session: Session;
  onClose: () => void;
  previewBridge?: UsePreviewBridgeReturn;
  terminalOutput?: string[];
  recentFiles?: RecentFile[];
  /** Preview port detected for the session (remote port) */
  previewPort?: number;
  /** Preview local port (for proxy) */
  previewLocalPort?: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
  crashed: 'bg-yellow-500',
};

const CHANGE_TYPE_INDICATORS: Record<string, { label: string; color: string }> = {
  added: { label: 'A', color: 'text-green-400' },
  modified: { label: 'M', color: 'text-yellow-400' },
  deleted: { label: 'D', color: 'text-red-400' },
};

export function MobileSessionView({
  session,
  onClose,
  previewBridge,
  terminalOutput = [],
  recentFiles = [],
  previewPort,
  previewLocalPort,
}: MobileSessionViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('terminal');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'preview', label: 'Preview' },
    { id: 'files', label: 'Files' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 bg-gray-800 border-b border-gray-700 min-h-[44px] shrink-0">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-gray-300 hover:text-white active:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close session view"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-gray-100 truncate">
            {session.title || 'Untitled Session'}
          </h2>
        </div>

        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[session.status] || 'bg-gray-500'}`}
          title={session.status}
        />
      </div>

      {/* Tab bar */}
      <div className="flex bg-gray-800 border-b border-gray-700 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 h-[44px] text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200 active:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'terminal' && (
          <TerminalTab output={terminalOutput} />
        )}
        {activeTab === 'preview' && (
          <PreviewTab
            sessionId={session.id}
            previewBridge={previewBridge}
            previewPort={previewPort}
            previewLocalPort={previewLocalPort}
          />
        )}
        {activeTab === 'files' && (
          <FilesTab files={recentFiles} />
        )}
      </div>
    </div>
  );
}

/* ─── Tab Content Components ──────────────────────────────────────────────── */

function TerminalTab({ output }: { output: string[] }) {
  if (output.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No terminal output available
      </div>
    );
  }

  return <MobileTerminalOutput output={output} />;
}

function PreviewTab({
  sessionId,
  previewBridge,
  previewPort,
  previewLocalPort,
}: {
  sessionId: string;
  previewBridge?: UsePreviewBridgeReturn;
  previewPort?: number;
  previewLocalPort?: number;
}) {
  if (!previewPort || !previewLocalPort) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No preview available
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <LivePreview
        sessionId={sessionId}
        port={previewPort}
        localPort={previewLocalPort}
        onClose={() => {/* no-op: preview stays in tab */}}
        bridgeRef={previewBridge ? { current: previewBridge } as React.MutableRefObject<UsePreviewBridgeReturn | null> : undefined}
      />
    </div>
  );
}

function FilesTab({ files }: { files: RecentFile[] }) {
  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        No file changes
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <ul className="divide-y divide-gray-700">
        {files.map((file) => {
          const fileName = file.path.split('/').pop() || file.path;
          const dirPath = file.path.split('/').slice(0, -1).join('/');
          const indicator = file.changeType
            ? CHANGE_TYPE_INDICATORS[file.changeType]
            : null;

          return (
            <li
              key={file.path}
              className="flex items-center gap-2 px-3 py-3 min-h-[44px]"
            >
              {indicator && (
                <span className={`text-xs font-mono font-bold shrink-0 ${indicator.color}`}>
                  {indicator.label}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-100 truncate">{fileName}</p>
                {dirPath && (
                  <p className="text-xs text-gray-500 truncate">{dirPath}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
