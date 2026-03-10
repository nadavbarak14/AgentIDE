import { useState, useRef, useEffect } from 'react';

interface MobileSessionSelectorProps {
  sessions: Array<{ id: string; title: string; status: string; needsInput: boolean }>;
  currentSessionId: string | null;
  waitingCount: number;
  onSelect: (id: string) => void;
  onNewSession: () => void;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  crashed: 'bg-amber-500',
  failed: 'bg-red-500',
  completed: 'bg-gray-500',
};

export function MobileSessionSelector({
  sessions,
  currentSessionId,
  waitingCount,
  onSelect,
  onNewSession,
}: MobileSessionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const hasMultiple = sessions.length > 1;

  // Close dropdown on outside click via backdrop
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSessionSelect = (id: string) => {
    onSelect(id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Compact strip */}
      <div
        ref={stripRef}
        className="flex items-center h-9 bg-gray-800 border-b border-gray-700 px-3 gap-2"
      >
        {/* Session title area - tappable to open dropdown */}
        <button
          type="button"
          className="flex items-center gap-1 min-w-0 flex-1"
          onClick={() => hasMultiple && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="text-sm text-white truncate max-w-[160px]">
            {currentSession?.title || 'No session'}
          </span>
          {hasMultiple && (
            <span className="text-gray-400 text-xs flex-shrink-0">▾</span>
          )}
        </button>

        {/* Waiting count badge */}
        {waitingCount > 0 && (
          <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full animate-pulse">
            {waitingCount}
          </span>
        )}

        {/* New session button */}
        <button
          type="button"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          onClick={onNewSession}
          aria-label="New session"
        >
          <span className="text-lg leading-none">+</span>
        </button>
      </div>

      {/* Dropdown overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Session list */}
          <div
            className="absolute left-2 right-2 top-10 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
            role="listbox"
            aria-label="Sessions"
          >
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const dotColor = STATUS_DOT_COLORS[session.status] || 'bg-gray-500';

              return (
                <button
                  key={session.id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm min-h-[44px] transition-colors ${
                    isCurrent
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50'
                  }`}
                  onClick={() => handleSessionSelect(session.id)}
                >
                  {/* Status dot */}
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />

                  {/* Title */}
                  <span className="truncate flex-1 text-left">
                    {session.title || 'Untitled'}
                  </span>

                  {/* Needs input indicator */}
                  {session.needsInput && (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
