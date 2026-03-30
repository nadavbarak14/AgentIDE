import React, { useState, useCallback, useEffect } from 'react';

interface MobileTopBarProps {
  sessionName: string;
  projectPath: string;
  isWaiting: boolean;
  waitingCount: number;
  sessionCount: number;
  onHamburgerTap: () => void;
  onSessionTap: () => void;
  onNewSession: () => void;
  onProjectsTap?: () => void;
  hasProjects?: boolean;
}

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => !!(document.fullscreenElement || (document as any).webkitFullscreenElement),
  );

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as any;
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } else {
      const el = document.documentElement as any;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }, []);

  // Fullscreen API is available on most mobile browsers (Android Chrome, etc.)
  // Not available on iOS Safari (PWA handles it via standalone mode)
  const supported = !!(document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);

  return { isFullscreen, toggle, supported };
}

export const MobileTopBar = React.memo(function MobileTopBar({
  sessionName,
  projectPath,
  isWaiting,
  waitingCount,
  sessionCount,
  onHamburgerTap,
  onSessionTap,
  onNewSession,
  onProjectsTap,
  hasProjects,
}: MobileTopBarProps) {
  const statusColor = isWaiting ? 'bg-amber-400' : 'bg-green-500';
  const truncatedPath = projectPath
    ? projectPath.split('/').slice(-2).join('/')
    : '';
  const { isFullscreen, toggle: toggleFullscreen, supported: fullscreenSupported } = useFullscreen();

  return (
    <div className="flex items-center h-10 px-2 border-b border-gray-700 bg-gray-800/90 backdrop-blur-sm flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(2.5rem + env(safe-area-inset-top, 0px))' }}>
      {/* Hamburger */}
      <button
        type="button"
        onClick={onHamburgerTap}
        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors"
        aria-label="Menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Center: session info — tappable to open session list */}
      <button
        type="button"
        onClick={onSessionTap}
        className="flex-1 flex items-center justify-center gap-1.5 min-w-0 px-1"
        aria-label="Switch session"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor} ${isWaiting ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium text-white truncate max-w-[120px]">
          {sessionName}
        </span>
        {/* Session count badge — shows total sessions */}
        {sessionCount > 1 && (
          <span className="px-1.5 py-0.5 bg-gray-600 text-gray-300 text-[10px] font-bold rounded-full min-w-[18px] text-center">
            {sessionCount}
          </span>
        )}
        {/* Waiting badge */}
        {waitingCount > 0 && (
          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full animate-pulse min-w-[18px] text-center">
            {waitingCount}
          </span>
        )}
        {truncatedPath && (
          <span className="text-xs text-gray-500 truncate max-w-[60px] hidden min-[400px]:inline">
            {truncatedPath}
          </span>
        )}
        {/* Dropdown chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500 flex-shrink-0">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {/* Fullscreen toggle */}
      {fullscreenSupported && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
      )}

      {/* Projects button */}
      {hasProjects && onProjectsTap && (
        <button
          type="button"
          onClick={onProjectsTap}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors"
          aria-label="Projects"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
      )}

      {/* Right: New Session button */}
      <button
        type="button"
        onClick={onNewSession}
        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded transition-colors"
        aria-label="New session"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
});
