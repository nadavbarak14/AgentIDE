import { useEffect, useCallback, useRef, useState } from 'react';

export type ShortcutAction =
  | 'toggle_files'
  | 'toggle_git'
  | 'toggle_preview'
  | 'toggle_claude'
  | 'toggle_issues'
  | 'toggle_shell'
  | 'focus_next'
  | 'focus_prev'
  | 'switch_next'
  | 'switch_prev'
  | 'confirm_session'
  | 'show_help'
  | 'search_files'
  | 'zoom_session'
  | 'kill_session'
  | 'toggle_pin'
  | 'toggle_sidebar'
  | 'jump_1' | 'jump_2' | 'jump_3' | 'jump_4' | 'jump_5'
  | 'jump_6' | 'jump_7' | 'jump_8' | 'jump_9'
  | 'command_palette';

export interface Shortcut {
  key: string;
  action: ShortcutAction;
  category: string;
  description: string;
  label: string;
  /** If true, chord stays armed after this action (for repeated navigation) */
  keepArmed?: boolean;
}

export const DEFAULT_SHORTCUT_MAP: Shortcut[] = [
  { key: 'e', action: 'toggle_files', category: 'Panels', description: 'Toggle Files panel', label: 'Toggle Files' },
  { key: 'g', action: 'toggle_git', category: 'Panels', description: 'Toggle Git panel', label: 'Toggle Git' },
  { key: 'v', action: 'toggle_preview', category: 'Panels', description: 'Toggle Preview panel', label: 'Toggle Preview' },
  { key: '\\', action: 'toggle_claude', category: 'Panels', description: 'Toggle Claude terminal', label: 'Toggle Claude' },
  { key: 'i', action: 'toggle_issues', category: 'Panels', description: 'Toggle Issues panel', label: 'Toggle Issues' },
  { key: 's', action: 'toggle_shell', category: 'Panels', description: 'Toggle Shell terminal', label: 'Toggle Shell' },
  { key: 'ArrowRight', action: 'focus_next', category: 'Navigation', description: 'Focus next session', label: 'Focus Next Session', keepArmed: true },
  { key: 'ArrowDown', action: 'focus_next', category: 'Navigation', description: 'Focus next session', label: 'Focus Next Session', keepArmed: true },
  { key: 'ArrowLeft', action: 'focus_prev', category: 'Navigation', description: 'Focus previous session', label: 'Focus Previous Session', keepArmed: true },
  { key: 'ArrowUp', action: 'focus_prev', category: 'Navigation', description: 'Focus previous session', label: 'Focus Previous Session', keepArmed: true },
  { key: 'Tab', action: 'switch_next', category: 'Navigation', description: 'Switch to next session (waiting first)', label: 'Switch Next Session', keepArmed: true },
  { key: 'Shift+Tab', action: 'switch_prev', category: 'Navigation', description: 'Switch to previous session', label: 'Switch Previous Session', keepArmed: true },
  { key: 'Enter', action: 'confirm_session', category: 'Navigation', description: 'Confirm session switch', label: 'Confirm Session' },
  { key: '?', action: 'show_help', category: 'Navigation', description: 'Show keyboard shortcuts', label: 'Show Shortcuts Help' },
  { key: 'f', action: 'search_files', category: 'Files', description: 'Search in files', label: 'Search Files' },
  { key: 'z', action: 'zoom_session', category: 'Session Actions', description: 'Zoom / unzoom session', label: 'Zoom Session' },
  { key: 'k', action: 'kill_session', category: 'Session Actions', description: 'Kill / remove session', label: 'Kill Session' },
  { key: 'p', action: 'toggle_pin', category: 'Session Actions', description: 'Pin / unpin session', label: 'Pin/Unpin Session' },
  { key: 'n', action: 'toggle_sidebar', category: 'Session Actions', description: 'New session panel', label: 'New Session Panel' },
  { key: 'h', action: 'command_palette', category: 'Navigation', description: 'Open command palette', label: 'Command Palette' },
];

export interface ChordIndicatorState {
  isArmed: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  onAction: (action: ShortcutAction) => void;
}

export function getEffectiveShortcuts(): Shortcut[] {
  try {
    const raw = localStorage.getItem('c3-keybindings');
    if (!raw) return DEFAULT_SHORTCUT_MAP;
    const overrides: Record<string, string> = JSON.parse(raw);
    return DEFAULT_SHORTCUT_MAP.map((shortcut) => {
      const override = overrides[shortcut.action];
      if (override) {
        return { ...shortcut, key: override };
      }
      return shortcut;
    });
  } catch {
    return DEFAULT_SHORTCUT_MAP;
  }
}

type ChordState = 'idle' | 'armed';

export function useKeyboardShortcuts({ enabled, onAction }: UseKeyboardShortcutsOptions): ChordIndicatorState {
  const [isArmed, setIsArmed] = useState(false);
  const stateRef = useRef<ChordState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const clearArmTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const disarm = useCallback(() => {
    stateRef.current = 'idle';
    setIsArmed(false);
    clearArmTimeout();
    window.dispatchEvent(new CustomEvent('c3:chord', { detail: { armed: false } }));
  }, [clearArmTimeout]);

  const arm = useCallback(() => {
    stateRef.current = 'armed';
    setIsArmed(true);
    clearArmTimeout();
    window.dispatchEvent(new CustomEvent('c3:chord', { detail: { armed: true } }));
    timeoutRef.current = setTimeout(() => {
      disarm();
    }, 1500);
  }, [clearArmTimeout, disarm]);

  // Re-arm: reset the timeout without dispatching events (for keepArmed actions)
  const rearm = useCallback(() => {
    clearArmTimeout();
    timeoutRef.current = setTimeout(() => {
      disarm();
    }, 3000); // longer timeout while navigating
  }, [clearArmTimeout, disarm]);

  useEffect(() => {
    if (!enabled) {
      disarm();
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Direct shortcuts (no prefix needed)
      if (e.key === 'F' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onActionRef.current('search_files');
        return;
      }

      // Prefix chord trigger: Ctrl+.
      if (stateRef.current === 'idle') {
        if (e.key === '.' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          arm();
          return;
        }
        return;
      }

      // We are in 'armed' state — intercept next key
      if (stateRef.current === 'armed') {
        // Escape cancels the chord
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          disarm();
          return;
        }

        // Ignore modifier-only keypresses (Shift, Ctrl, etc.)
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Handle digit keys for quick session jump (1-9)
        if (e.key >= '1' && e.key <= '9') {
          onActionRef.current(`jump_${e.key}` as ShortcutAction);
          disarm();
          return;
        }

        const shortcuts = getEffectiveShortcuts();

        // Build the key identifier for matching
        let pressedKey = e.key;
        if (e.shiftKey && e.key === 'Tab') {
          pressedKey = 'Shift+Tab';
        }

        const matched = shortcuts.find((s) => s.key === pressedKey);
        if (matched) {
          onActionRef.current(matched.action);
          if (matched.keepArmed) {
            rearm(); // stay armed for continued navigation
            return;
          }
        }

        disarm();
      }
    };

    // Disarm immediately on any mouse click.
    // Use both mousedown AND click (capture) as safety nets:
    // xterm.js registers window-level capture handlers before our hook,
    // so if xterm stops mousedown propagation, click still fires independently.
    const handleMouseDown = () => {
      if (stateRef.current === 'armed') disarm();
    };
    const handleClick = () => {
      if (stateRef.current === 'armed') disarm();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('click', handleClick, true);
      clearArmTimeout();
    };
  }, [enabled, arm, disarm, rearm, clearArmTimeout]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearArmTimeout();
    };
  }, [clearArmTimeout]);

  return { isArmed };
}

export default useKeyboardShortcuts;
