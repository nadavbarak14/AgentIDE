import { useEffect, useCallback, useRef, useState } from 'react';

export type ShortcutAction =
  | 'toggle_files'
  | 'toggle_git'
  | 'toggle_preview'
  | 'toggle_claude'
  | 'toggle_issues'
  | 'focus_next'
  | 'focus_prev'
  | 'switch_next'
  | 'switch_prev'
  | 'confirm_session'
  | 'show_help'
  | 'search_files';

export interface Shortcut {
  key: string;
  action: ShortcutAction;
  category: string;
  description: string;
  /** If true, chord stays armed after this action (for repeated navigation) */
  keepArmed?: boolean;
}

export const DEFAULT_SHORTCUT_MAP: Shortcut[] = [
  { key: 'e', action: 'toggle_files', category: 'Panels', description: 'Toggle Files panel' },
  { key: 'g', action: 'toggle_git', category: 'Panels', description: 'Toggle Git panel' },
  { key: 'v', action: 'toggle_preview', category: 'Panels', description: 'Toggle Preview panel' },
  { key: '\\', action: 'toggle_claude', category: 'Panels', description: 'Toggle Claude terminal' },
  { key: 'i', action: 'toggle_issues', category: 'Panels', description: 'Toggle Issues panel' },
  { key: 'ArrowRight', action: 'focus_next', category: 'Navigation', description: 'Focus next session' },
  { key: 'ArrowDown', action: 'focus_next', category: 'Navigation', description: 'Focus next session' },
  { key: 'ArrowLeft', action: 'focus_prev', category: 'Navigation', description: 'Focus previous session' },
  { key: 'ArrowUp', action: 'focus_prev', category: 'Navigation', description: 'Focus previous session' },
  { key: 'Tab', action: 'switch_next', category: 'Navigation', description: 'Switch next session', keepArmed: true },
  { key: 'Shift+Tab', action: 'switch_prev', category: 'Navigation', description: 'Switch previous session', keepArmed: true },
  { key: 'Enter', action: 'confirm_session', category: 'Navigation', description: 'Confirm session switch' },
  { key: '?', action: 'show_help', category: 'Navigation', description: 'Show keyboard shortcuts' },
  { key: 'f', action: 'search_files', category: 'Files', description: 'Search in files' },
];

export interface ChordIndicatorState {
  isArmed: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  onAction: (action: ShortcutAction) => void;
}

function getEffectiveShortcuts(): Shortcut[] {
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

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
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
