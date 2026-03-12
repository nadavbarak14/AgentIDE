import { useState } from 'react';
import type { Session, Worker } from '../services/api';
import { ProjectPicker } from './ProjectPicker';
import { WorkerSelector } from './WorkerSelector';
import { WorkerBadge } from './WorkerBadge';

interface PredefinedFlag {
  id: string;
  label: string;
  flag: string;
  description: string;
  warningLevel: 'normal' | 'caution';
  isPseudo: boolean;
}

const PREDEFINED_FLAGS: PredefinedFlag[] = [
  { id: 'skip-permissions', label: 'Skip Permissions', flag: '--dangerously-skip-permissions', description: 'Skip all permission prompts', warningLevel: 'caution', isPseudo: false },
  { id: 'worktree', label: 'Worktree', flag: '--worktree', description: 'Use isolated git branch', warningLevel: 'normal', isPseudo: true },
  { id: 'continue-latest', label: 'Continue Latest', flag: '', description: 'Resume most recent conversation (-c)', warningLevel: 'normal', isPseudo: true },
  { id: 'resume', label: 'Resume', flag: '', description: 'Pick a session to resume (--resume)', warningLevel: 'normal', isPseudo: true },
];

interface SessionQueueProps {
  activeSessions: Session[];
  workers: Worker[];
  onRequestAddMachine?: () => void;
  onCreateSession: (workingDirectory: string, title: string, targetWorker?: string | null, worktree?: boolean, continueLatest?: boolean, resume?: boolean, flags?: string) => Promise<unknown>;
  onFocusSession: (id: string) => void;
  onKillSession: (id: string) => void;
  onClose?: () => void;
}

export function SessionQueue({
  activeSessions,
  workers: workersList,
  onRequestAddMachine,
  onCreateSession,
  onFocusSession,
  onKillSession,
  onClose,
}: SessionQueueProps) {
  const [directory, setDirectory] = useState('');
  const [title, setTitle] = useState('');
  const [targetWorker, setTargetWorker] = useState<string | null>(null);
  const [worktree, setWorktree] = useState(false);
  const [continueLatest, setContinueLatest] = useState(false);
  const [resume, setResume] = useState(false);
  const [flags, setFlags] = useState('');
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
      await onCreateSession(directory.trim(), title.trim(), targetWorker, worktree, continueLatest, resume, flags.trim() || undefined);
      setDirectory('');
      setTitle('');
      setTargetWorker(null);
      setWorktree(false);
      setContinueLatest(false);
      setResume(false);
      setFlags('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full sm:w-80 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Create Session Form */}
      <div className="p-4 sm:p-3 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3 sm:mb-2">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden flex items-center justify-center w-8 h-8 min-h-[44px] min-w-[44px] text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors"
              aria-label="Back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h3 className="text-base sm:text-sm font-semibold text-gray-300">New Session</h3>
        </div>
        <form onSubmit={handleCreate} className="space-y-2" data-testid="new-session-form">
          <input
            type="text"
            placeholder="Title (e.g., Refactor Auth)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            data-testid="session-title-input"
          />
          <WorkerSelector
            workers={workersList}
            selectedWorkerId={targetWorker}
            onChange={handleWorkerChange}
            onRequestAddMachine={onRequestAddMachine}
          />
          <ProjectPicker
            selectedDirectory={directory}
            onDirectoryChange={setDirectory}
            onSelect={handleProjectSelect}
            workerId={targetWorker || undefined}
            isRemote={targetWorker ? workersList.find((w) => w.id === targetWorker)?.type === 'remote' : false}
          />
          <div className="flex flex-wrap gap-1.5">
                {PREDEFINED_FLAGS.map((pf) => {
                  const isActive = pf.id === 'worktree' ? worktree
                    : pf.id === 'continue-latest' ? continueLatest
                    : pf.id === 'resume' ? resume
                    : flags.includes(pf.flag);
                  const activeClass = pf.warningLevel === 'caution' && isActive
                    ? 'bg-amber-600/30 border-amber-500/50 text-amber-300'
                    : isActive
                    ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                    : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500';
                  return (
                    <button
                      key={pf.id}
                      type="button"
                      title={pf.description}
                      onClick={() => {
                        if (pf.id === 'worktree') {
                          setWorktree(!worktree);
                        } else if (pf.id === 'continue-latest') {
                          const next = !continueLatest;
                          setContinueLatest(next);
                          if (next) setResume(false);
                        } else if (pf.id === 'resume') {
                          const next = !resume;
                          setResume(next);
                          if (next) setContinueLatest(false);
                        } else {
                          setFlags((prev) => {
                            const trimmed = prev.trim();
                            if (trimmed.includes(pf.flag)) {
                              return trimmed.replace(pf.flag, '').replace(/\s+/g, ' ').trim();
                            }
                            return trimmed ? `${trimmed} ${pf.flag}` : pf.flag;
                          });
                        }
                      }}
                      className={`px-2 py-0.5 text-xs rounded border transition-colors ${activeClass}`}
                    >
                      {pf.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                placeholder="CLI flags (e.g., --dangerously-skip-permissions)"
                value={flags}
                onChange={(e) => setFlags(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
              />
          {(flags.includes('--dangerously-skip-permissions')) && (
            <div className="text-xs text-amber-400 bg-amber-900/20 rounded px-2 py-1">
              All tool actions will execute without permission prompts.
            </div>
          )}
          <button
            type="submit"
            disabled={creating || !directory.trim() || !title.trim()}
            className="w-full px-3 py-3 sm:py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="create-session-btn"
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
      className={`flex items-center justify-between py-3 sm:py-1.5 px-3 sm:px-2 rounded group ${
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
