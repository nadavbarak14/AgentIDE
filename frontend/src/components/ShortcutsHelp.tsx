import { useEffect, useMemo, useState, useCallback } from 'react';
import { DEFAULT_SHORTCUT_MAP, type ShortcutAction } from '../hooks/useKeyboardShortcuts';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const KBD_CLASSES = 'bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded text-xs font-mono';

function getOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem('c3-keybindings');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, string>) {
  if (Object.keys(overrides).length === 0) {
    localStorage.removeItem('c3-keybindings');
  } else {
    localStorage.setItem('c3-keybindings', JSON.stringify(overrides));
  }
}

function KeyDisplay({ keyStr }: { keyStr: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className={KBD_CLASSES}>Ctrl+.</kbd>
      <span className="text-gray-500">,</span>
      <kbd className={KBD_CLASSES}>{keyStr}</kbd>
    </span>
  );
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  // Load overrides when opened
  useEffect(() => {
    if (open) {
      setOverrides(getOverrides());
      setRecordingAction(null);
      setConflict(null);
    }
  }, [open]);

  const effectiveKeys = useMemo(() => {
    const map: Record<string, string> = {};
    for (const shortcut of DEFAULT_SHORTCUT_MAP) {
      map[shortcut.action] = overrides[shortcut.action] || shortcut.key;
    }
    return map;
  }, [overrides]);

  const handleRecordKey = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingAction) return;

      // Ignore modifier-only keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      let pressedKey = e.key;
      if (e.shiftKey && e.key === 'Tab') {
        pressedKey = 'Shift+Tab';
      }

      // Check for conflicts
      for (const shortcut of DEFAULT_SHORTCUT_MAP) {
        if (shortcut.action === recordingAction) continue;
        const currentKey = overrides[shortcut.action] || shortcut.key;
        if (currentKey === pressedKey) {
          setConflict(`"${pressedKey}" is already used by "${shortcut.description}"`);
          setRecordingAction(null);
          setTimeout(() => setConflict(null), 2000);
          return;
        }
      }

      // Save the override
      const defaultShortcut = DEFAULT_SHORTCUT_MAP.find((s) => s.action === recordingAction);
      const newOverrides = { ...overrides };
      if (defaultShortcut && pressedKey === defaultShortcut.key) {
        // If the key matches the default, remove the override
        delete newOverrides[recordingAction];
      } else {
        newOverrides[recordingAction] = pressedKey;
      }
      setOverrides(newOverrides);
      saveOverrides(newOverrides);
      setRecordingAction(null);
    },
    [recordingAction, overrides],
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (recordingAction) {
        handleRecordKey(e);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, recordingAction, handleRecordKey]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof DEFAULT_SHORTCUT_MAP>();
    for (const shortcut of DEFAULT_SHORTCUT_MAP) {
      const list = map.get(shortcut.category) || [];
      list.push(shortcut);
      map.set(shortcut.category, list);
    }
    return map;
  }, []);

  const handleResetOne = useCallback(
    (action: ShortcutAction) => {
      const newOverrides = { ...overrides };
      delete newOverrides[action];
      setOverrides(newOverrides);
      saveOverrides(newOverrides);
    },
    [overrides],
  );

  const handleResetAll = useCallback(() => {
    setOverrides({});
    saveOverrides({});
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl leading-none px-1"
          >
            &times;
          </button>
        </div>

        {conflict && (
          <div className="px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-gray-700">
            {conflict}
          </div>
        )}

        <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
          {Array.from(grouped.entries()).map(([category, shortcuts]) => (
            <section key={category}>
              <h3 className="text-sm font-medium text-gray-400 mb-2">{category}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left py-1">Action</th>
                    <th className="text-left py-1">Default</th>
                    <th className="text-left py-1">Current</th>
                    <th className="text-right py-1">Reset</th>
                  </tr>
                </thead>
                <tbody>
                  {shortcuts.map((shortcut) => {
                    const currentKey = effectiveKeys[shortcut.action];
                    const isRecording = recordingAction === shortcut.action;
                    const hasOverride = !!overrides[shortcut.action];

                    return (
                      <tr key={`${shortcut.action}-${shortcut.key}`} className="border-b border-gray-700/50 last:border-0">
                        <td className="py-1.5 pr-2 text-gray-300">{shortcut.description}</td>
                        <td className="py-1.5 pr-2">
                          <KeyDisplay keyStr={shortcut.key} />
                        </td>
                        <td
                          className="py-1.5 pr-2 cursor-pointer"
                          onClick={() => setRecordingAction(shortcut.action)}
                        >
                          {isRecording ? (
                            <span className="text-yellow-400 text-xs animate-pulse">Press a key...</span>
                          ) : (
                            <KeyDisplay keyStr={currentKey} />
                          )}
                        </td>
                        <td className="py-1.5 text-right">
                          {hasOverride && (
                            <button
                              onClick={() => handleResetOne(shortcut.action)}
                              className="text-xs text-gray-500 hover:text-gray-300"
                            >
                              Reset
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={handleResetAll}
            className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1 border border-gray-600 rounded hover:border-gray-500"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
}
