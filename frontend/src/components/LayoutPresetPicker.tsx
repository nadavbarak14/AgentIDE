import { useState, useRef, useEffect } from 'react';
import type { LayoutPresetId } from '../types/layout';
import { PRESET_IDS, LAYOUT_PRESETS } from '../constants/layoutPresets';

// Inline SVG icons for each preset layout
function PresetIcon({ presetId }: { presetId: LayoutPresetId }) {
  const icons: Record<LayoutPresetId, React.ReactNode> = {
    'equal-3col': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
        <line x1="11" y1="1" x2="11" y2="23" />
        <line x1="21" y1="1" x2="21" y2="23" />
      </svg>
    ),
    '2left-1right': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
        <line x1="14" y1="1" x2="14" y2="23" />
        <line x1="1" y1="12" x2="14" y2="12" />
      </svg>
    ),
    '1left-2right': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
        <line x1="18" y1="1" x2="18" y2="23" />
        <line x1="18" y1="12" x2="31" y2="12" />
      </svg>
    ),
    '2top-1bottom': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
        <line x1="1" y1="14" x2="31" y2="14" />
        <line x1="16" y1="1" x2="16" y2="14" />
      </svg>
    ),
    '1top-2bottom': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
        <line x1="1" y1="10" x2="31" y2="10" />
        <line x1="16" y1="10" x2="16" y2="23" />
      </svg>
    ),
    'focus': (
      <svg viewBox="0 0 32 24" className="w-8 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="30" height="22" rx="1" />
      </svg>
    ),
  };
  return <>{icons[presetId]}</>;
}

interface LayoutPresetPickerProps {
  currentPresetId: LayoutPresetId;
  onPresetSelect: (presetId: LayoutPresetId) => void;
}

export function LayoutPresetPicker({ currentPresetId, onPresetSelect }: LayoutPresetPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700 ${
          open ? 'bg-gray-700 text-gray-200' : ''
        }`}
        title="Change layout"
      >
        <PresetIcon presetId={currentPresetId} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 w-48">
          <div className="text-xs text-gray-500 mb-2 px-1">Layout</div>
          <div className="grid grid-cols-2 gap-1">
            {PRESET_IDS.map(id => (
              <button
                key={id}
                onClick={() => { onPresetSelect(id); setOpen(false); }}
                className={`flex flex-col items-center gap-1 p-2 rounded transition-colors ${
                  id === currentPresetId
                    ? 'ring-2 ring-blue-500 bg-gray-700 text-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
                title={LAYOUT_PRESETS[id].description}
              >
                <PresetIcon presetId={id} />
                <span className="text-[10px] leading-tight text-center">{LAYOUT_PRESETS[id].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
