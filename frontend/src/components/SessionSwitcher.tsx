import type { Session } from '../services/api';

interface SessionSwitcherProps {
  sessions: Session[];
  currentSessionId: string | null;
  isOpen: boolean;
  highlightedIndex: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  queued: 'bg-yellow-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500',
};

export function SessionSwitcher({
  sessions,
  currentSessionId,
  isOpen,
  highlightedIndex,
  onSelect,
  onClose,
}: SessionSwitcherProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg max-w-2xl w-full mx-4 shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400">Switch Session</h2>
          <span className="text-xs text-gray-500">Tab to navigate, Enter to select, Esc to cancel</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {sessions.map((session, index) => {
            const isHighlighted = index === highlightedIndex;
            const isCurrent = session.id === currentSessionId;
            return (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  isHighlighted
                    ? 'border-blue-500 bg-gray-700 ring-1 ring-blue-500/30'
                    : isCurrent
                      ? 'border-gray-500 bg-gray-750'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[session.status] || 'bg-gray-500'}`} />
                  <span className="text-sm font-medium text-gray-200 truncate flex-1">
                    {session.title || 'Untitled'}
                  </span>
                  {session.needsInput && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-medium rounded">
                      waiting
                    </span>
                  )}
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-medium rounded">
                      current
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {session.workingDirectory}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
