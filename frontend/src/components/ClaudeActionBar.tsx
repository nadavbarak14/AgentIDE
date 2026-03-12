import React, { useCallback } from 'react';

type ClaudeMode = 'permission' | 'generating' | 'input' | 'idle';

interface ClaudeActionBarProps {
  mode: ClaudeMode;
  onSend: (data: string) => void;
  keyboardOffset: number;
  isMobile: boolean;
  isScrolledUp: boolean;
  onScrollToBottom: () => void;
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
      className={`min-w-[44px] min-h-[44px] px-3 rounded-lg flex items-center justify-center text-sm font-medium select-none active:scale-95 transition-transform ${mono ? 'font-mono' : ''} ${className}`}
    >
      {label}
    </button>
  );
}

function GeneratingActions({ onSend }: { onSend: (data: string) => void }) {
  const stop = useCallback(() => onSend('\x03'), [onSend]);

  return (
    <ActionButton
      label="Stop"
      onClick={stop}
      className="bg-red-600 hover:bg-red-500 text-white flex-1"
    />
  );
}

function InputActions({ onSend }: { onSend: (data: string) => void }) {
  const sendTab = useCallback(() => onSend('\t'), [onSend]);
  const sendUp = useCallback(() => onSend('\x1b[A'), [onSend]);
  const sendDown = useCallback(() => onSend('\x1b[B'), [onSend]);
  const sendEsc = useCallback(() => onSend('\x1b'), [onSend]);
  const sendEnter = useCallback(() => onSend('\n'), [onSend]);

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
        label="Send"
        onClick={sendEnter}
        className="bg-blue-600 hover:bg-blue-500 text-white"
      />
    </>
  );
}

function IdleActions({ onSend }: { onSend: (data: string) => void }) {
  const cont = useCallback(() => onSend('\n'), [onSend]);

  return (
    <ActionButton
      label="Continue"
      onClick={cont}
      className="bg-gray-700 hover:bg-gray-600 text-gray-200 flex-1"
    />
  );
}

function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-[44px] min-h-[44px] px-2 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 active:scale-95 transition-transform"
      aria-label="Scroll to bottom"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-5 h-5"
      >
        <path
          fillRule="evenodd"
          d="M10 3a.75.75 0 01.75.75v10.19l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

export const ClaudeActionBar = React.memo(function ClaudeActionBar({
  mode,
  onSend,
  keyboardOffset,
  isMobile,
  isScrolledUp,
  onScrollToBottom,
}: ClaudeActionBarProps) {
  if (!isMobile) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 border-t border-gray-700 bg-gray-800/95 backdrop-blur-sm"
      style={{ bottom: `${keyboardOffset}px`, height: '44px' }}
    >
      <div className="flex items-center gap-2 h-full px-2">
        {isScrolledUp && (
          <ScrollToBottomButton onClick={onScrollToBottom} />
        )}

        {mode === 'generating' && <GeneratingActions onSend={onSend} />}
        {(mode === 'permission' || mode === 'input') && <InputActions onSend={onSend} />}
        {mode === 'idle' && <IdleActions onSend={onSend} />}
      </div>
    </div>
  );
});
