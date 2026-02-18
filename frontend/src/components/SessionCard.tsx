import { useState } from 'react';
import { TerminalView } from './TerminalView';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { DiffViewer } from './DiffViewer';
import { LivePreview } from './LivePreview';
import type { Session } from '../services/api';

interface SessionCardProps {
  session: Session;
  focused?: boolean;
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

type SidePanel = 'none' | 'files' | 'diff' | 'preview';

export function SessionCard({
  session,
  focused = false,
  detectedPort = null,
  onContinue,
  onKill,
  onToggleLock,
  onDelete,
}: SessionCardProps) {
  const [sidePanel, setSidePanel] = useState<SidePanel>('none');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const showSidePanel = sidePanel !== 'none' && (session.status === 'active' || session.status === 'completed');

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
          {(session.status === 'active' || session.status === 'completed') && (
            <>
              <button
                onClick={() => setSidePanel(sidePanel === 'files' ? 'none' : 'files')}
                className={`px-1.5 py-0.5 text-xs rounded ${
                  sidePanel === 'files' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:bg-gray-600'
                }`}
                title="File Explorer"
              >
                Files
              </button>
              <button
                onClick={() => setSidePanel(sidePanel === 'diff' ? 'none' : 'diff')}
                className={`px-1.5 py-0.5 text-xs rounded ${
                  sidePanel === 'diff' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:bg-gray-600'
                }`}
                title="Show Changes"
              >
                Diff
              </button>
              {detectedPort && (
                <button
                  onClick={() => setSidePanel(sidePanel === 'preview' ? 'none' : 'preview')}
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    sidePanel === 'preview' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:bg-gray-600'
                  }`}
                  title="Live Preview"
                >
                  Preview
                </button>
              )}
            </>
          )}
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

      {/* Main Content */}
      <div className="flex-1 flex min-h-[300px]">
        {/* Terminal or Status */}
        <div className={`${showSidePanel ? 'w-1/2' : 'w-full'} flex flex-col`}>
          {session.status === 'active' ? (
            <TerminalView sessionId={session.id} active={true} />
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

        {/* Side Panel */}
        {showSidePanel && (
          <div className="w-1/2 border-l border-gray-700 flex flex-col overflow-hidden">
            {sidePanel === 'files' && !selectedFile && (
              <FileTree sessionId={session.id} onFileSelect={setSelectedFile} />
            )}
            {sidePanel === 'files' && selectedFile && (
              <FileViewer
                sessionId={session.id}
                filePath={selectedFile}
                onClose={() => setSelectedFile(null)}
              />
            )}
            {sidePanel === 'diff' && (
              <DiffViewer sessionId={session.id} onClose={() => setSidePanel('none')} />
            )}
            {sidePanel === 'preview' && detectedPort && (
              <LivePreview
                port={detectedPort.port}
                localPort={detectedPort.localPort}
                onClose={() => setSidePanel('none')}
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
