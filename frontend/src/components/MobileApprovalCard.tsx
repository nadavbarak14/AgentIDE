import React, { useCallback, useEffect, useState } from 'react';

interface MobileApprovalCardProps {
  onAccept: () => void;
  onReject: () => void;
}

export const MobileApprovalCard = React.memo(function MobileApprovalCard({
  onAccept,
  onReject,
}: MobileApprovalCardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-up animation on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleAccept = useCallback(() => {
    onAccept();
  }, [onAccept]);

  const handleReject = useCallback(() => {
    onReject();
  }, [onReject]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
    >
      <div className="rounded-t-xl bg-gray-800 border-t border-gray-700 shadow-lg px-4 py-3">
        {/* Header with warning icon and title */}
        <div className="flex items-center gap-2 mb-3">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-400 flex-shrink-0"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm font-medium text-white">Approve?</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 min-h-[44px] rounded-lg bg-green-600 hover:bg-green-500 active:scale-95 text-white text-sm font-medium transition-all select-none"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="flex-1 min-h-[44px] rounded-lg border border-red-500 text-red-400 hover:bg-red-500/10 active:scale-95 text-sm font-medium transition-all select-none"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
});
