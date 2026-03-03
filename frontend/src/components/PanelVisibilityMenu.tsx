import { useState, useRef, useEffect } from 'react';
import type { LayoutConfig, PanelId } from '../types/layout';
import { isPanelVisible, visiblePanelCount } from '../constants/layoutPresets';

const PANEL_LABELS: Record<string, string> = {
  files: 'Files',
  git: 'Git Diff',
  preview: 'Preview',
  issues: 'Issues',
  widgets: 'Widgets',
  shell: 'Terminal',
};

function panelLabel(panelId: PanelId): string {
  if (panelId.startsWith('ext:')) return panelId.slice(4);
  return PANEL_LABELS[panelId] ?? panelId;
}

interface PanelVisibilityMenuProps {
  layoutConfig: LayoutConfig;
  availablePanels: PanelId[];
  onTogglePanel: (panelId: PanelId) => void;
}

export function PanelVisibilityMenu({ layoutConfig, availablePanels, onTogglePanel }: PanelVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vCount = visiblePanelCount(layoutConfig);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          open ? 'bg-gray-700 text-gray-200' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
        }`}
        title="Show/hide panels"
      >
        Panels
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]">
          {availablePanels.map(panelId => {
            const visible = isPanelVisible(layoutConfig, panelId);
            const isLastPanel = visible && vCount <= 1;
            return (
              <button
                key={panelId}
                onClick={() => {
                  if (!isLastPanel) {
                    onTogglePanel(panelId);
                    setOpen(false);
                  }
                }}
                disabled={isLastPanel}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors ${
                  isLastPanel
                    ? 'opacity-40 cursor-not-allowed text-gray-400'
                    : 'hover:bg-gray-700 text-gray-300 hover:text-gray-100'
                }`}
                title={isLastPanel ? 'Cannot hide the last panel' : undefined}
              >
                <span className={`w-3 h-3 rounded-full border ${visible ? 'bg-blue-500 border-blue-400' : 'border-gray-600'}`} />
                {panelLabel(panelId)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
