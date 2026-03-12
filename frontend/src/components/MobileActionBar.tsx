import React, { useCallback } from 'react';

interface MobileActionBarProps {
  onSend: (data: string) => void;
  onScrollToTop?: () => void;
  onScrollToBottom?: () => void;
  isScrolledUp?: boolean;
  keyboardOffset?: number;
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  mono?: boolean;
}

function ActionButton({ label, onClick, className = '', mono = false }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[36px] min-h-[36px] px-2 rounded-lg flex items-center justify-center text-sm font-medium select-none active:scale-95 transition-transform ${mono ? 'font-mono' : ''} ${className}`}
    >
      {label}
    </button>
  );
}

function DefaultActions({ onSend, onScrollToTop }: { onSend: (data: string) => void; onScrollToTop?: () => void }) {
  const sendTab = useCallback(() => onSend('\t'), [onSend]);
  const sendUp = useCallback(() => onSend('\x1b[A'), [onSend]);
  const sendDown = useCallback(() => onSend('\x1b[B'), [onSend]);
  const sendEsc = useCallback(() => onSend('\x1b'), [onSend]);
  const sendEnter = useCallback(() => onSend('\r'), [onSend]);
  const sendStop = useCallback(() => onSend('\x03'), [onSend]);
  const scrollToTop = useCallback(() => onScrollToTop?.(), [onScrollToTop]);

  return (
    <>
      <ActionButton
        label="Tab"
        onClick={sendTab}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200"
        mono
      />
      <ActionButton
        label="↑"
        onClick={sendUp}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200"
        mono
      />
      <ActionButton
        label="↓"
        onClick={sendDown}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200"
        mono
      />
      <ActionButton
        label="Esc"
        onClick={sendEsc}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200"
        mono
      />
      <ActionButton
        label="Enter"
        onClick={sendEnter}
        className="bg-blue-600 hover:bg-blue-500 text-white"
      />
      <ActionButton
        label="Stop"
        onClick={sendStop}
        className="bg-red-600 hover:bg-red-500 text-white"
      />
      <ActionButton
        label="⇧⇧"
        onClick={scrollToTop}
        className="bg-gray-700 hover:bg-gray-600 text-gray-200"
        mono
      />
    </>
  );
}

function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-[36px] min-h-[36px] px-2 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 active:scale-95 transition-transform select-none"
      aria-label="Scroll to bottom"
    >
      ↓↓
    </button>
  );
}

export const MobileActionBar = React.memo(function MobileActionBar({
  onSend,
  onScrollToTop,
  onScrollToBottom,
  isScrolledUp = false,
}: MobileActionBarProps) {
  return (
    <div
      className="relative border-t border-gray-700 bg-gray-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center gap-1 h-[44px] px-2">
        {isScrolledUp && onScrollToBottom && (
          <ScrollToBottomButton onClick={onScrollToBottom} />
        )}

        <DefaultActions onSend={onSend} onScrollToTop={onScrollToTop} />
      </div>
    </div>
  );
});
