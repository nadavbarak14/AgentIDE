import React from 'react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onScrollToBottom: () => void;
  bottomOffset?: number;
}

export function ScrollToBottomButton({
  visible,
  onScrollToBottom,
  bottomOffset,
}: ScrollToBottomButtonProps) {
  if (!visible) return null;

  const bottom = (bottomOffset ?? 8) + 8;

  return (
    <button
      onClick={onScrollToBottom}
      className="fixed right-4 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-gray-700/80 text-white shadow-lg backdrop-blur-sm transition-opacity duration-200 hover:bg-gray-600/90"
      style={{ bottom: `${bottom}px` }}
      aria-label="Scroll to bottom"
    >
      <span className="text-lg leading-none">&darr;</span>
    </button>
  );
}
