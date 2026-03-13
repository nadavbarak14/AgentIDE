import { useCallback, useState, useEffect } from 'react';
import type { MobilePanelName } from '../hooks/useMobilePanel';
import type { LoadedExtension } from '../services/extension-types';
import { MobileSheetOverlay } from './MobileSheetOverlay';

interface MobileHamburgerMenuProps {
  onSelectPanel: (panel: MobilePanelName) => void;
  onClose: () => void;
  onNewSession: () => void;
  onKillSession?: () => void;
  hasActiveSession?: boolean;
  showIssues?: boolean;
  extensions?: LoadedExtension[];
  onSelectExtension?: (name: string) => void;
  widgetCount?: number;
}

const menuItems: { panel: MobilePanelName; label: string; icon: React.ReactNode }[] = [
  {
    panel: 'files',
    label: 'Files',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4.5C2 3.67 2.67 3 3.5 3H8l2 2h5.5c.83 0 1.5.67 1.5 1.5V15c0 .83-.67 1.5-1.5 1.5h-12A1.5 1.5 0 0 1 2 15V4.5Z" />
      </svg>
    ),
  },
  {
    panel: 'git',
    label: 'Git',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="12" />
        <circle cx="6" cy="14.5" r="2" />
        <circle cx="14" cy="5.5" r="2" />
        <path d="M14 7.5v2c0 1.1-.9 2-2 2H6" />
      </svg>
    ),
  },
  {
    panel: 'preview',
    label: 'Preview',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
        <circle cx="10" cy="10" r="3" />
      </svg>
    ),
  },
  {
    panel: 'issues',
    label: 'Issues',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="8" />
        <line x1="10" y1="6" x2="10" y2="11" />
        <circle cx="10" cy="14" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    panel: 'shell',
    label: 'Shell',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <polyline points="6,8 9,10.5 6,13" />
        <line x1="11" y1="13" x2="14" y2="13" />
      </svg>
    ),
  },
  {
    panel: 'widgets',
    label: 'Canvas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    panel: 'settings',
    label: 'Settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3" />
        <path d="M16.5 10a1.3 1.3 0 0 0 .26 1.43l.05.05a1.58 1.58 0 1 1-2.24 2.24l-.05-.05a1.3 1.3 0 0 0-1.43-.26 1.3 1.3 0 0 0-.79 1.19v.14a1.58 1.58 0 1 1-3.16 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.43.26l-.05.05a1.58 1.58 0 1 1-2.24-2.24l.05-.05A1.3 1.3 0 0 0 5 10.07a1.3 1.3 0 0 0-1.19-.79h-.14a1.58 1.58 0 1 1 0-3.16h.07A1.3 1.3 0 0 0 4.93 5.3a1.3 1.3 0 0 0-.26-1.43l-.05-.05a1.58 1.58 0 1 1 2.24-2.24l.05.05A1.3 1.3 0 0 0 8.34 2h.08a1.3 1.3 0 0 0 .79-1.19v-.14a1.58 1.58 0 1 1 3.16 0v.07a1.3 1.3 0 0 0 .79 1.19 1.3 1.3 0 0 0 1.43-.26l.05-.05a1.58 1.58 0 1 1 2.24 2.24l-.05.05A1.3 1.3 0 0 0 16.57 5.3v.08a1.3 1.3 0 0 0 1.19.79h.14a1.58 1.58 0 0 1 0 3.16h-.07a1.3 1.3 0 0 0-1.19.79Z" />
      </svg>
    ),
  },
];

export function MobileHamburgerMenu({ onSelectPanel, onClose, onNewSession, onKillSession, hasActiveSession, showIssues, extensions, onSelectExtension, widgetCount }: MobileHamburgerMenuProps) {
  const handleSelect = (panel: MobilePanelName) => {
    onSelectPanel(panel);
  };

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

  const toggleFullscreen = useCallback(() => {
    const doc = document as any;
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } else {
      const el = document.documentElement as any;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
    onClose();
  }, [onClose]);

  const fullscreenSupported = !!(document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);

  return (
    <MobileSheetOverlay onClose={onClose} title="Menu">
      <div className="flex flex-col p-2 gap-1">
        {menuItems.filter(item => {
          if (item.panel === 'issues' && !showIssues) return false;
          if (item.panel === 'widgets' && !(widgetCount && widgetCount > 0)) return false;
          return true;
        }).map((item) => (
          <button
            key={item.panel}
            type="button"
            onClick={() => handleSelect(item.panel)}
            className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-200 transition-colors"
          >
            <span className="flex-shrink-0 text-gray-400">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}

        {/* Extension panels */}
        {extensions && extensions.length > 0 && extensions.map((ext) => (
          <button
            key={`ext-${ext.name}`}
            type="button"
            onClick={() => { onSelectExtension?.(ext.name); }}
            className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-200 transition-colors"
          >
            <span className="flex-shrink-0 text-gray-400">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H7v4H3v6h4v4h6v-4h4V6h-4V2z" />
              </svg>
            </span>
            <span className="text-sm font-medium">{ext.displayName}</span>
          </button>
        ))}

        {/* Fullscreen toggle */}
        {fullscreenSupported && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-200 transition-colors"
          >
            <span className="flex-shrink-0 text-gray-400">
              {isFullscreen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </span>
            <span className="text-sm font-medium">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        )}

        {/* New Session */}
        <button
          type="button"
          onClick={onNewSession}
          className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-200 transition-colors"
        >
          <span className="flex-shrink-0 text-gray-400">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="4" x2="10" y2="16" />
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
          </span>
          <span className="text-sm font-medium">New Session</span>
        </button>

        {/* Kill Session */}
        {hasActiveSession && onKillSession && (
          <button
            type="button"
            onClick={() => { onKillSession(); onClose(); }}
            className="flex items-center gap-3 w-full min-h-[52px] px-4 rounded-lg bg-gray-900 hover:bg-red-900/30 text-red-400 transition-colors"
          >
            <span className="flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <span className="text-sm font-medium">Kill Session</span>
          </button>
        )}
      </div>
    </MobileSheetOverlay>
  );
}
