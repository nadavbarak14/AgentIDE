import { useRef } from 'react';
import { ExtensionPanel, type ExtensionPanelHandle } from './ExtensionPanel';
import type { LoadedExtension } from '../services/extension-types';

interface MobileExtensionTabsProps {
  extensions: LoadedExtension[];
  enabledExtensions: string[];
  activeExtensionName: string | null;
  sessionId: string;
  onSelectExtension: (name: string) => void;
  onManageExtensions: () => void;
  onClose: () => void;
  extensionPanelRef: React.MutableRefObject<ExtensionPanelHandle | null>;
}

export function MobileExtensionTabs({
  extensions,
  enabledExtensions,
  activeExtensionName,
  sessionId,
  onSelectExtension,
  onManageExtensions,
  onClose,
  extensionPanelRef,
}: MobileExtensionTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only show enabled extensions that have panels
  const enabledExts = extensions.filter(e => enabledExtensions.includes(e.name));
  const activeExt = extensions.find(e => e.name === activeExtensionName);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700 overflow-x-auto flex-shrink-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {enabledExts.map((ext) => (
          <button
            key={ext.name}
            type="button"
            onClick={() => onSelectExtension(ext.name)}
            className={`flex-shrink-0 px-3 min-h-[36px] text-sm font-medium rounded-md transition-colors ${
              ext.name === activeExtensionName
                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {ext.displayName}
          </button>
        ))}
        {/* Gear icon to manage extensions */}
        <button
          type="button"
          onClick={onManageExtensions}
          className="flex-shrink-0 w-9 min-h-[36px] flex items-center justify-center text-gray-500 hover:text-gray-300 rounded-md hover:bg-gray-800 transition-colors"
          aria-label="Manage extensions"
          title="Manage extensions"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="3" />
            <path d="M16.5 10a1.3 1.3 0 0 0 .26 1.43l.05.05a1.58 1.58 0 1 1-2.24 2.24l-.05-.05a1.3 1.3 0 0 0-1.43-.26 1.3 1.3 0 0 0-.79 1.19v.14a1.58 1.58 0 1 1-3.16 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.43.26l-.05.05a1.58 1.58 0 1 1-2.24-2.24l.05-.05A1.3 1.3 0 0 0 5 10.07a1.3 1.3 0 0 0-1.19-.79h-.14a1.58 1.58 0 1 1 0-3.16h.07A1.3 1.3 0 0 0 4.93 5.3a1.3 1.3 0 0 0-.26-1.43l-.05-.05a1.58 1.58 0 1 1 2.24-2.24l.05.05A1.3 1.3 0 0 0 8.34 2h.08a1.3 1.3 0 0 0 .79-1.19v-.14a1.58 1.58 0 1 1 3.16 0v.07a1.3 1.3 0 0 0 .79 1.19 1.3 1.3 0 0 0 1.43-.26l.05-.05a1.58 1.58 0 1 1 2.24 2.24l-.05.05A1.3 1.3 0 0 0 16.57 5.3v.08a1.3 1.3 0 0 0 1.19.79h.14a1.58 1.58 0 0 1 0 3.16h-.07a1.3 1.3 0 0 0-1.19.79Z" />
          </svg>
        </button>
      </div>

      {/* Extension panel content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeExt ? (
          <ExtensionPanel
            key={activeExtensionName}
            ref={(handle) => { extensionPanelRef.current = handle; }}
            extension={activeExt}
            sessionId={sessionId}
            onClose={onClose}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Select an extension from the tabs above
          </div>
        )}
      </div>
    </div>
  );
}
