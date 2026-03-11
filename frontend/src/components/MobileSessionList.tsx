import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '../services/api';

interface MobileSessionListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onKillSession?: (id: string) => void;
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

/** Swipeable session row — swipe left to reveal Kill button */
function SwipeableSessionRow({
  session,
  isCurrent,
  onSelect,
  onKill,
}: {
  session: Session;
  isCurrent: boolean;
  onSelect: () => void;
  onKill?: () => void;
}) {
  const dotColor = getStatusDot(session);
  const badge = getStatusBadge(session);
  const isWaiting = session.needsInput;
  const projectPath = session.workingDirectory
    ? session.workingDirectory.split('/').slice(-2).join('/')
    : '';

  const rowRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const THRESHOLD = 70;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    swiping.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    currentX.current = e.touches[0].clientX;
    const dx = currentX.current - startX.current;
    // Only allow swipe left (negative), cap at -THRESHOLD
    if (dx < 0) {
      setOffset(Math.max(dx, -THRESHOLD));
    } else if (revealed) {
      // swiping right to close
      setOffset(Math.min(0, -THRESHOLD + dx));
    }
  }, [revealed]);

  const handleTouchEnd = useCallback(() => {
    swiping.current = false;
    if (offset < -THRESHOLD / 2) {
      setOffset(-THRESHOLD);
      setRevealed(true);
    } else {
      setOffset(0);
      setRevealed(false);
    }
  }, [offset]);

  const handleKill = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onKill?.();
    setOffset(0);
    setRevealed(false);
  }, [onKill]);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Kill button behind the card */}
      {onKill && (
        <button
          type="button"
          className="absolute right-0 top-0 bottom-0 w-[70px] bg-red-600 flex items-center justify-center text-white text-xs font-semibold"
          onClick={handleKill}
          onTouchEnd={handleKill}
        >
          Kill
        </button>
      )}

      {/* Swipeable card */}
      <div
        ref={rowRef}
        className={`relative w-full text-left p-3 transition-transform ${swiping.current ? '' : 'duration-200'} ${
          isCurrent ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-gray-800 border border-gray-700'
        } ${isWaiting ? 'border-l-2 border-l-amber-400' : ''} rounded-lg`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onKill ? handleTouchStart : undefined}
        onTouchMove={onKill ? handleTouchMove : undefined}
        onTouchEnd={onKill ? handleTouchEnd : undefined}
        onClick={() => { if (!revealed) onSelect(); else { setOffset(0); setRevealed(false); } }}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor} ${isWaiting ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-semibold text-white truncate flex-1">
            {session.title || 'Untitled'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.classes}`}>
            {badge.text}
          </span>
          {onKill && (
            <button
              type="button"
              onClick={handleKill}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
              aria-label="Kill session"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {projectPath && (
          <p className="text-xs text-gray-500 mt-1 ml-4.5 truncate">
            {projectPath}
          </p>
        )}
      </div>
    </div>
  );
}

export function MobileSessionList({
  sessions,
  currentSessionId,
  onSelectSession,
  onKillSession,
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

          <span className="text-sm font-medium text-gray-200 absolute left-1/2 -translate-x-1/2">
            Sessions
          </span>

          <button
            type="button"
            onClick={handleNew}
            className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1"
          >
            + New
          </button>
        </div>

        {/* Session cards or empty state */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 mb-4">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <p className="text-gray-400 text-sm font-medium mb-1">No active sessions</p>
              <p className="text-gray-600 text-xs mb-4">Create a new session to get started</p>
              <button
                type="button"
                onClick={handleNew}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                + New Session
              </button>
            </div>
          ) : (
            sessions.map((session) => (
              <SwipeableSessionRow
                key={session.id}
                session={session}
                isCurrent={session.id === currentSessionId}
                onSelect={() => handleSelect(session.id)}
                onKill={onKillSession ? () => onKillSession(session.id) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
