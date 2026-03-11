import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '../services/api';

interface MobileSessionListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}

function getStatusDot(session: Session): string {
  if (session.needsInput) return 'bg-amber-400';
  if (session.status === 'active') return 'bg-green-500';
  return 'bg-gray-500';
}

function getStatusBadge(session: Session): { text: string; classes: string } {
  if (session.needsInput) {
    return { text: 'waiting', classes: 'bg-amber-500/20 text-amber-400' };
  }
  if (session.status === 'active') {
    return { text: 'running', classes: 'bg-green-500/20 text-green-400' };
  }
  return { text: 'idle', classes: 'bg-gray-500/20 text-gray-400' };
}

export function MobileSessionList({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onClose,
}: MobileSessionListProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleSelect = useCallback(
    (id: string) => {
      setVisible(false);
      setTimeout(() => onSelectSession(id), 300);
    },
    [onSelectSession],
  );

  const handleNew = useCallback(() => {
    setVisible(false);
    setTimeout(onNewSession, 300);
  }, [onNewSession]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div
        className="flex flex-col flex-1 transition-transform duration-300 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between h-10 px-3 border-b border-gray-700 bg-gray-800 flex-shrink-0">
          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Title */}
          <span className="text-sm font-medium text-gray-200 absolute left-1/2 -translate-x-1/2">
            Sessions
          </span>

          {/* New session button */}
          <button
            type="button"
            onClick={handleNew}
            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1"
          >
            + New
          </button>
        </div>

        {/* Session cards */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {sessions.map((session) => {
            const isCurrent = session.id === currentSessionId;
            const dotColor = getStatusDot(session);
            const badge = getStatusBadge(session);
            const isWaiting = session.needsInput;
            const projectPath = session.workingDirectory
              ? session.workingDirectory.split('/').slice(-2).join('/')
              : '';

            return (
              <button
                key={session.id}
                type="button"
                className={`w-full text-left rounded-lg p-3 transition-colors ${
                  isCurrent ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'
                } ${isWaiting ? 'border-l-2 border-l-amber-400' : ''}`}
                onClick={() => handleSelect(session.id)}
              >
                <div className="flex items-center gap-2">
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor} ${isWaiting ? 'animate-pulse' : ''}`} />

                  {/* Session name */}
                  <span className="text-sm font-semibold text-white truncate flex-1">
                    {session.title || 'Untitled'}
                  </span>

                  {/* Status badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.classes}`}>
                    {badge.text}
                  </span>
                </div>

                {/* Project path */}
                {projectPath && (
                  <p className="text-xs text-gray-500 mt-1 ml-4.5 truncate">
                    {projectPath}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
