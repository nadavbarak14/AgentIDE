import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useKeyboardShortcuts,
  DEFAULT_SHORTCUT_MAP,
  type ShortcutAction,
} from '../../../src/hooks/useKeyboardShortcuts';

// Helper to dispatch a keyboard event on window (captured phase)
function fireKeyDown(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(event);
}

function fireCtrlDot() {
  fireKeyDown('.', { ctrlKey: true });
}

describe('useKeyboardShortcuts', () => {
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onAction = vi.fn();
    vi.useFakeTimers();
    localStorage.removeItem('c3-keybindings');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // DEFAULT_SHORTCUT_MAP completeness
  // ---------------------------------------------------------------
  describe('DEFAULT_SHORTCUT_MAP', () => {
    it('contains all expected shortcut actions', () => {
      const expectedActions: ShortcutAction[] = [
        'toggle_files',
        'toggle_git',
        'toggle_preview',
        'toggle_claude',
        'toggle_issues',
        'focus_next',
        'focus_prev',
        'switch_next',
        'switch_prev',
        'confirm_session',
        'show_help',
        'search_files',
      ];

      const mapActions = DEFAULT_SHORTCUT_MAP.map((s) => s.action);
      for (const action of expectedActions) {
        expect(mapActions).toContain(action);
      }
    });

    it('every entry has key, action, category, and description', () => {
      for (const shortcut of DEFAULT_SHORTCUT_MAP) {
        expect(shortcut.key).toBeTruthy();
        expect(shortcut.action).toBeTruthy();
        expect(shortcut.category).toBeTruthy();
        expect(shortcut.description).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------
  // Ctrl+. prefix chord state machine
  // ---------------------------------------------------------------
  describe('Ctrl+. prefix chord', () => {
    it('Ctrl+. press sets isArmed to true', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      expect(result.current.isArmed).toBe(false);

      act(() => {
        fireCtrlDot();
      });

      expect(result.current.isArmed).toBe(true);
    });

    it('action key (e) after Ctrl+. fires toggle_files', () => {
      renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      act(() => {
        fireKeyDown('e');
      });

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('toggle_files');
    });

    it('action key without prior Ctrl+. does nothing', () => {
      renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireKeyDown('e');
      });

      expect(onAction).not.toHaveBeenCalled();
    });

    it('timeout (1.5s) returns to idle', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      expect(result.current.isArmed).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(result.current.isArmed).toBe(false);

      act(() => {
        fireKeyDown('e');
      });

      expect(onAction).not.toHaveBeenCalled();
    });

    it('Escape while armed returns to idle', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      expect(result.current.isArmed).toBe(true);

      act(() => {
        fireKeyDown('Escape');
      });

      expect(result.current.isArmed).toBe(false);
      expect(onAction).not.toHaveBeenCalled();
    });

    it('returns to idle after dispatching a non-keepArmed action', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      act(() => {
        fireKeyDown('e');
      });

      expect(result.current.isArmed).toBe(false);
    });

    it('stays armed after a keepArmed action (Tab)', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      act(() => {
        fireKeyDown('Tab');
      });

      expect(onAction).toHaveBeenCalledWith('switch_next');
      expect(result.current.isArmed).toBe(true);
    });

    it('unregistered key while armed returns to idle without dispatching', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      act(() => {
        fireKeyDown('z');
      });

      expect(result.current.isArmed).toBe(false);
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Disabled state
  // ---------------------------------------------------------------
  describe('disabled state', () => {
    it('does not respond to Ctrl+. when enabled is false', () => {
      const { result } = renderHook(() =>
        useKeyboardShortcuts({ enabled: false, onAction }),
      );

      act(() => {
        fireCtrlDot();
      });

      expect(result.current.isArmed).toBe(false);
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // localStorage overrides
  // ---------------------------------------------------------------
  describe('user overrides from localStorage', () => {
    it('applies user overrides from localStorage', () => {
      localStorage.setItem('c3-keybindings', JSON.stringify({ toggle_files: 'x' }));

      renderHook(() =>
        useKeyboardShortcuts({ enabled: true, onAction }),
      );

      // Original key 'e' should NOT work
      act(() => {
        fireCtrlDot();
      });
      act(() => {
        fireKeyDown('e');
      });
      expect(onAction).not.toHaveBeenCalled();

      // Overridden key 'x' SHOULD work
      act(() => {
        fireCtrlDot();
      });
      act(() => {
        fireKeyDown('x');
      });
      expect(onAction).toHaveBeenCalledWith('toggle_files');
    });
  });
});
