import { SessionCard } from './SessionCard';
import type { Session } from '../services/api';

interface SessionGridProps {
  displayedSessions: Session[];
  overflowSessions: Session[];
  onContinue: (id: string) => void;
  onKill: (id: string) => void;
  onToggleLock: (id: string, lock: boolean) => void;
  onDelete: (id: string) => void;
  onFocusSession: (id: string) => void;
}

export function SessionGrid({
  displayedSessions,
  overflowSessions,
  onContinue,
  onKill,
  onToggleLock,
  onDelete,
  onFocusSession,
}: SessionGridProps) {
  // Auto-compute columns: up to 3 columns, then rows wrap
  const cols = Math.min(displayedSessions.length, 3);

  if (displayedSessions.length === 0 && overflowSessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-xl mb-2">No active sessions</p>
          <p className="text-sm">Create a session from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Focus Area: Main visible sessions (frozen order) */}
      <div
        className="flex-1 grid gap-3 p-3 auto-rows-fr overflow-auto"
        style={{
          gridTemplateColumns: `repeat(${cols || 1}, 1fr)`,
        }}
      >
        {displayedSessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            focused={true}
            onContinue={onContinue}
            onKill={onKill}
            onToggleLock={onToggleLock}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Overflow: Clickable mini-cards for sessions beyond max_visible */}
      {overflowSessions.length > 0 && (
        <div className="border-t border-gray-700 p-3 flex-shrink-0">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            More Sessions ({overflowSessions.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {overflowSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onFocusSession(session.id)}
                className={`flex-shrink-0 w-48 p-2 rounded border text-left transition-colors ${
                  session.needsInput
                    ? 'border-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                    : 'border-gray-700 bg-gray-800 hover:bg-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
