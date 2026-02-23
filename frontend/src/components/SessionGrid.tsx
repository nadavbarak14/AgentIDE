import { useState, useEffect, useRef } from 'react';
import { SessionCard } from './SessionCard';
import type { Session, Worker } from '../services/api';

interface SessionGridProps {
  displayedSessions: Session[];
  overflowSessions: Session[];
  currentSessionId?: string | null;
  workers?: Worker[];
  onKill: (id: string) => void;
  onToggleLock: (id: string, lock: boolean) => void;
  onDelete: (id: string) => void;
  onFocusSession: (id: string) => void;
  onSetCurrent?: (id: string) => void;
  zoomedSessionId?: string | null;
  onToggleZoom?: (id: string) => void;
  chordArmed?: boolean;
  sessionNumbers?: Record<string, number>;
}

export function SessionGrid({
  displayedSessions,
  overflowSessions,
  currentSessionId,
  workers,
  onKill,
  onToggleLock,
  onDelete,
  onFocusSession,
  onSetCurrent,
  zoomedSessionId,
  onToggleZoom,
  chordArmed,
  sessionNumbers,
}: SessionGridProps) {
  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem('c3-overflow-collapsed') !== 'false'
  );

  // Track whether chord forced the expand so we can auto-collapse back
  const chordForcedRef = useRef(false);

  // When chord arms → force expand; when chord disarms → restore if user had it collapsed
  useEffect(() => {
    if (chordArmed && userCollapsed) {
      chordForcedRef.current = true;
    }
    if (!chordArmed && chordForcedRef.current) {
      chordForcedRef.current = false;
    }
  }, [chordArmed, userCollapsed]);

  const isCollapsed = chordArmed ? false : (chordForcedRef.current ? false : userCollapsed);

  // Auto-compute columns: up to 3 columns, then rows wrap
  const cols = Math.min(displayedSessions.length, 3);

  if (displayedSessions.length === 0 && overflowSessions.length === 0) {
    return (
      <div data-testid="session-grid" className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-xl mb-2">No active sessions</p>
          <p className="text-sm">Create a session from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Overflow: sessions beyond max_visible — at top */}
      {overflowSessions.length > 0 && (
        <div data-testid="overflow-bar" className="border-b border-gray-700 flex-shrink-0">
          <button
            onClick={() => {
              setUserCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('c3-overflow-collapsed', String(next));
                return next;
              });
              chordForcedRef.current = false;
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:bg-gray-800/50 transition-colors${
              isCollapsed && overflowSessions.some((s) => s.needsInput) ? ' bg-amber-500/20' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              {isCollapsed
                ? `+${overflowSessions.length} more sessions`
                : `More Sessions (${overflowSessions.length})`}
              {isCollapsed && overflowSessions.some((s) => s.needsInput) && (
                <span className="text-amber-400 animate-pulse font-bold">!</span>
              )}
            </span>
            <span className="text-gray-500">{isCollapsed ? '▾' : '▴'}</span>
          </button>
          {!isCollapsed && (
            <div className="px-3 pb-3">
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {overflowSessions.map((session) => {
                  const num = sessionNumbers?.[session.id];
                  return (
                    <button
                      key={session.id}
                      onClick={() => onFocusSession(session.id)}
                      className={`p-2 rounded border text-left transition-colors ${
                        session.needsInput
                          ? 'border-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                          : 'border-gray-700 bg-gray-800 hover:bg-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        {num != null && (
                          <span className={`w-4 h-4 flex-shrink-0 text-[10px] font-bold rounded flex items-center justify-center ${
                            chordArmed ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                          }`}>
                            {num}
                          </span>
                        )}
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            session.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                          }`}
                        />
                        <span className="text-xs truncate">{session.title || 'Untitled'}</span>
                        {session.needsInput && (
                          <span className="text-xs text-amber-400 animate-pulse">!</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{session.workingDirectory}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Focus Area: Main visible sessions (frozen order) */}
      <div
        data-testid="session-grid"
        className="flex-1 grid gap-3 p-3 auto-rows-fr overflow-auto"
        style={{
          gridTemplateColumns: `repeat(${cols || 1}, 1fr)`,
        }}
      >
        {displayedSessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            workers={workers}
            focused={true}
            isCurrent={currentSessionId === session.id}
            isSingleView={displayedSessions.length === 1}
            onKill={onKill}
            onToggleLock={onToggleLock}
            onDelete={onDelete}
            onSetCurrent={onSetCurrent}
            isZoomed={zoomedSessionId === session.id}
            onToggleZoom={onToggleZoom}
            sessionNumber={sessionNumbers?.[session.id]}
          />
        ))}
      </div>
    </div>
  );
}
