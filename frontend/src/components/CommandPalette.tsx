import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getEffectiveShortcuts } from '../hooks/useKeyboardShortcuts';

export interface CommandEntry {
  action: string;
  label: string;
  category: string;
  shortcutKey: string | null;
}

export const BUTTON_ONLY_COMMANDS: CommandEntry[] = [
  { action: 'open_settings', label: 'Open Settings', category: 'Settings', shortcutKey: null },
  { action: 'toggle_terminal_position', label: 'Toggle Terminal Position', category: 'View', shortcutKey: null },
  { action: 'font_size_decrease', label: 'Decrease Font Size', category: 'View', shortcutKey: null },
  { action: 'font_size_increase', label: 'Increase Font Size', category: 'View', shortcutKey: null },
  { action: 'continue_session', label: 'Continue Session', category: 'Session Actions', shortcutKey: null },
  { action: 'new_session', label: 'New Session', category: 'Session Actions', shortcutKey: null },
  { action: 'toggle_file_search', label: 'Toggle Explorer/Search', category: 'Panels', shortcutKey: null },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  extraCommands?: CommandEntry[];
}

function buildCommandList(extraCommands: CommandEntry[] = []): CommandEntry[] {
  const shortcuts = getEffectiveShortcuts();
  // Deduplicate by action (e.g., ArrowRight and ArrowDown both map to focus_next)
  const seen = new Set<string>();
  const commands: CommandEntry[] = [];
  for (const s of shortcuts) {
    if (seen.has(s.action)) continue;
    seen.add(s.action);
    commands.push({
      action: s.action,
      label: s.label,
      category: s.category,
      shortcutKey: s.key,
    });
  }
  for (const cmd of extraCommands) {
    if (!seen.has(cmd.action)) {
      seen.add(cmd.action);
      commands.push(cmd);
    }
  }
  return commands;
}

export function CommandPalette({ open, onClose, onAction, extraCommands }: CommandPaletteProps) {
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allCommands = useMemo(() => buildCommandList(extraCommands), [extraCommands]);

  const filtered = useMemo(() => {
    if (!filter) return allCommands;
    const lower = filter.toLowerCase();
    return allCommands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.category.toLowerCase().includes(lower),
    );
  }, [filter, allCommands]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setFilter('');
      setSelectedIndex(0);
      // Auto-focus input on next frame
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Keep selected index in bounds when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (item && item.scrollIntoView) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeSelected = useCallback(() => {
    const cmd = filtered[selectedIndex];
    if (cmd) {
      onClose();
      onAction(cmd.action);
    }
  }, [filtered, selectedIndex, onClose, onAction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
          break;
        case 'Enter':
          e.preventDefault();
          executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered.length, executeSelected, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50"
      onClick={onClose}
      data-testid="command-palette-backdrop"
    >
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-md mx-4 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid="command-palette"
      >
        {/* Search Input */}
        <div className="px-3 py-2 border-b border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-transparent text-gray-100 text-sm placeholder-gray-500 outline-none"
            data-testid="command-palette-input"
          />
        </div>

        {/* Prefix hint */}
        <div className="px-3 py-1.5 bg-blue-900/20 border-b border-gray-700 text-xs text-gray-400">
          Tip: Press <kbd className="bg-gray-700 text-gray-200 px-1 py-0.5 rounded text-xs font-mono">Ctrl+.</kbd> then a shortcut key to run commands directly.
        </div>

        {/* Command List */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1" data-testid="command-palette-list">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500" data-testid="command-palette-empty">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.action}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-blue-600/30 text-white'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
                onClick={() => {
                  onClose();
                  onAction(cmd.action);
                }}
                data-testid={`command-item-${cmd.action}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{cmd.label}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{cmd.category}</span>
                </span>
                {cmd.shortcutKey && (
                  <kbd className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0 ml-2">
                    {cmd.shortcutKey}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
