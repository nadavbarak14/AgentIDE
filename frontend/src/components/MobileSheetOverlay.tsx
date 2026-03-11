import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MobileSheetOverlayProps {
  children: ReactNode;
  onClose: () => void;
  title?: string;
}

export function MobileSheetOverlay({ children, onClose, title }: MobileSheetOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300); // Wait for exit animation
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Sheet container with slide-up animation */}
      <div
        className="flex flex-col flex-1 transition-transform duration-300 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Header bar */}
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
          {title && (
            <span className="text-sm font-medium text-gray-200 absolute left-1/2 -translate-x-1/2">
              {title}
            </span>
          )}
          <div className="w-8" /> {/* Spacer for centering */}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
