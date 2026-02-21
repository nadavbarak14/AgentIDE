import { useState } from 'react';
import type { Session, Worker } from '../services/api';
import { ProjectPicker } from './ProjectPicker';
import { WorkerSelector } from './WorkerSelector';
import { WorkerBadge } from './WorkerBadge';

interface SessionQueueProps {
  activeSessions: Session[];
  queuedSessions: Session[];
  completedSessions: Session[];
  failedSessions: Session[];
  workers: Worker[];
  onRequestAddMachine?: () => void;
  onCreateSession: (workingDirectory: string, title: string, targetWorker?: string | null, startFresh?: boolean, worktree?: boolean) => Promise<unknown>;
  onDeleteSession: (id: string) => Promise<void>;
  onContinueSession: (id: string) => Promise<unknown>;
  onFocusSession: (id: string) => void;
  onKillSession: (id: string) => void;
}

export function SessionQueue({
  activeSessions,
  queuedSessions,
  completedSessions,
  failedSessions,
  workers: workersList,
  onRequestAddMachine,
  onCreateSession,
  onDeleteSession,
  onContinueSession,
  onFocusSession,
  onKillSession,
}: SessionQueueProps) {
  const [directory, setDirectory] = useState('');
  const [title, setTitle] = useState('');
  const [targetWorker, setTargetWorker] = useState<string | null>(null);
  const [startFresh, setStartFresh] = useState(false);
  const [worktree, setWorktree] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleProjectSelect = (directoryPath: string, workerId: string | null) => {
    setDirectory(directoryPath);
    if (workerId) setTargetWorker(workerId);
  };

  const handleWorkerChange = (workerId: string | null) => {
    if (workerId !== targetWorker) {
      setDirectory(''); // Clear directory — paths differ between machines
    }
    setTargetWorker(workerId);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directory.trim() || !title.trim()) return;
    setCreating(true);
    try {
      await onCreateSession(directory.trim(), title.trim(), targetWorker, startFresh, worktree);
      setDirectory('');
      setTitle('');
      setTargetWorker(null);
      setStartFresh(false);
      setWorktree(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Create Session Form */}
      <div className="p-3 border-b border-gray-700 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">New Session</h3>
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            type="text"
            placeholder="Title (e.g., Refactor Auth)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <ProjectPicker
            selectedDirectory={directory}
            onDirectoryChange={setDirectory}
            onSelect={handleProjectSelect}
            workerId={targetWorker || undefined}
            isRemote={targetWorker ? workersList.find((w) => w.id === targetWorker)?.type === 'remote' : false}
          />
          <WorkerSelector
            workers={workersList}
            selectedWorkerId={targetWorker}
            onChange={handleWorkerChange}
            onRequestAddMachine={onRequestAddMachine}
          />
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={startFresh}
              onChange={(e) => setStartFresh(e.target.checked)}
              className="rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Start fresh (ignore previous session)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={worktree}
              onChange={(e) => setWorktree(e.target.checked)}
              className="rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Use worktree (isolated git branch)
          </label>
          <button
            type="submit"
            disabled={creating || !directory.trim() || !title.trim()}
            className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create Session'}
          </button>
        </form>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Sessions — clickable to bring into focus */}
        {activeSessions.length > 0 && (
          <div className="p-3">
            <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">
              Active ({activeSessions.length})
            </h4>
            {activeSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                workers={workersList}
                onClick={() => onFocusSession(session.id)}
                onAction={() => onKillSession(session.id)}
                actionLabel="Kill"
                actionColor="text-red-400 hover:bg-red-500/20"
              />
            ))}
          </div>
        )}

        {queuedSessions.length > 0 && (
          <div className="p-3 border-t border-gray-700">
            <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">
              Queued ({queuedSessions.length})
            </h4>
            {queuedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                onDelete={() => onDeleteSession(session.id)}
                workers={workersList}
              />
            ))}
          </div>
        )}

        {completedSessions.length > 0 && (
          <div className="p-3 border-t border-gray-700">
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
              Completed ({completedSessions.length})
            </h4>
            {completedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                workers={workersList}
                onDelete={() => onDeleteSession(session.id)}
                onAction={() => onContinueSession(session.id)}
                actionLabel="Restart"
                actionColor="text-green-400 hover:bg-green-500/20"
              />
            ))}
          </div>
        )}

        {failedSessions.length > 0 && (
          <div className="p-3 border-t border-gray-700">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
              Failed ({failedSessions.length})
            </h4>
            {failedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                workers={workersList}
                onDelete={() => onDeleteSession(session.id)}
                onAction={() => onContinueSession(session.id)}
                actionLabel="Restart"
                actionColor="text-green-400 hover:bg-green-500/20"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionItem({
  session,
  workers,
  onClick,
  onDelete,
  onAction,
  actionLabel,
  actionColor,
}: {
  session: Session;
  workers?: Worker[];
  onClick?: () => void;
  onDelete?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionColor?: string;
}) {
  const isClickable = !!onClick;

  return (
    <div
      className={`flex items-center justify-between py-1.5 px-2 rounded group ${
        isClickable
          ? 'cursor-pointer hover:bg-gray-700/80 active:bg-gray-600/50'
          : 'hover:bg-gray-700/50'
      }`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') onClick?.(); } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {session.status === 'active' && (
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                session.needsInput ? 'bg-amber-400 animate-pulse' : 'bg-green-500'
              }`}
            />
          )}
          <p className="text-sm text-gray-300 truncate">{session.title || 'Untitled'}</p>
          {workers && <WorkerBadge workerId={session.workerId} workers={workers} />}
          {session.needsInput && (
            <span className="text-xs text-amber-400 flex-shrink-0">!</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{session.workingDirectory}</p>
      </div>
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onAction && (
          <button
            onClick={onAction}
            className={`px-1.5 py-0.5 text-xs rounded ${actionColor || 'text-blue-400 hover:bg-blue-500/20'}`}
          >
            {actionLabel}
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="px-1.5 py-0.5 text-xs text-gray-500 hover:bg-red-500/20 hover:text-red-400 rounded"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
