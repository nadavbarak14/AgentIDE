import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWidgets } from '../../../src/hooks/useWidgets';

describe('useWidgets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------
  // 1. Initial state
  // ---------------------------------------------------------------
  describe('initial state', () => {
    it('starts with no widgets, null activeWidget, and widgetCount 0', () => {
      const { result } = renderHook(() => useWidgets());

      expect(result.current.widgets).toEqual([]);
      expect(result.current.activeWidget).toBeNull();
      expect(result.current.widgetCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // 2. Adding a widget
  // ---------------------------------------------------------------
  describe('addWidget', () => {
    it('adds a widget and sets it as active', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>Hello</p>');
      });

      expect(result.current.widgets).toHaveLength(1);
      expect(result.current.widgets[0]).toEqual({
        name: 'widget-a',
        html: '<p>Hello</p>',
        createdAt: 1000,
      });
      expect(result.current.activeWidget).toEqual({
        name: 'widget-a',
        html: '<p>Hello</p>',
        createdAt: 1000,
      });
      expect(result.current.widgetCount).toBe(1);
    });

    // ---------------------------------------------------------------
    // 3. Adding multiple widgets
    // ---------------------------------------------------------------
    it('tracks multiple widgets independently', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });

      expect(result.current.widgetCount).toBe(2);

      const names = result.current.widgets.map(w => w.name);
      expect(names).toContain('widget-a');
      expect(names).toContain('widget-b');

      // The most recently added widget should be active
      expect(result.current.activeWidget?.name).toBe('widget-b');
    });

    // ---------------------------------------------------------------
    // 4. Replacing a widget (same name)
    // ---------------------------------------------------------------
    it('replaces widget content when adding with the same name', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>Original</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-a', '<p>Updated</p>');
      });

      // Should still be one widget, not two
      expect(result.current.widgetCount).toBe(1);
      expect(result.current.widgets[0].html).toBe('<p>Updated</p>');
      expect(result.current.widgets[0].createdAt).toBe(2000);
      expect(result.current.activeWidget?.name).toBe('widget-a');
    });
  });

  // ---------------------------------------------------------------
  // 5. Removing a widget
  // ---------------------------------------------------------------
  describe('removeWidget', () => {
    it('removes a widget from state', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });

      act(() => {
        result.current.removeWidget('widget-a');
      });

      expect(result.current.widgetCount).toBe(1);
      const names = result.current.widgets.map(w => w.name);
      expect(names).not.toContain('widget-a');
      expect(names).toContain('widget-b');
    });

    // ---------------------------------------------------------------
    // 6. Removing the active widget falls back to most recent
    // ---------------------------------------------------------------
    it('falls back to the most recently created widget when the active one is removed', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });

      act(() => {
        vi.setSystemTime(3000);
        result.current.addWidget('widget-c', '<p>C</p>');
      });

      // widget-c is now active; remove it
      expect(result.current.activeWidget?.name).toBe('widget-c');

      act(() => {
        result.current.removeWidget('widget-c');
      });

      // Should fall back to widget-b (createdAt 2000 > widget-a createdAt 1000)
      expect(result.current.activeWidget?.name).toBe('widget-b');
      expect(result.current.widgetCount).toBe(2);
    });

    // ---------------------------------------------------------------
    // 7. Removing the last widget results in null activeWidget
    // ---------------------------------------------------------------
    it('results in null activeWidget when the last widget is removed', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        result.current.removeWidget('widget-a');
      });

      expect(result.current.widgets).toEqual([]);
      expect(result.current.activeWidget).toBeNull();
      expect(result.current.widgetCount).toBe(0);
    });

    it('does not change active widget when a non-active widget is removed', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });

      // widget-b is active; remove widget-a
      expect(result.current.activeWidget?.name).toBe('widget-b');

      act(() => {
        result.current.removeWidget('widget-a');
      });

      expect(result.current.activeWidget?.name).toBe('widget-b');
      expect(result.current.widgetCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // 8. setActiveWidget switches between widgets
  // ---------------------------------------------------------------
  describe('setActiveWidget', () => {
    it('switches the active widget to the specified name', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });

      // widget-b is currently active
      expect(result.current.activeWidget?.name).toBe('widget-b');

      act(() => {
        result.current.setActiveWidget('widget-a');
      });

      expect(result.current.activeWidget?.name).toBe('widget-a');
    });

    // ---------------------------------------------------------------
    // 9. setActiveWidget ignores non-existent names
    // ---------------------------------------------------------------
    it('ignores non-existent widget names', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });

      expect(result.current.activeWidget?.name).toBe('widget-a');

      act(() => {
        result.current.setActiveWidget('does-not-exist');
      });

      // Active widget should remain unchanged
      expect(result.current.activeWidget?.name).toBe('widget-a');
    });

    it('ignores when called with no widgets present', () => {
      const { result } = renderHook(() => useWidgets());

      act(() => {
        result.current.setActiveWidget('anything');
      });

      expect(result.current.activeWidget).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // 10. widgetCount reflects current count
  // ---------------------------------------------------------------
  describe('widgetCount', () => {
    it('reflects the current number of widgets', () => {
      const { result } = renderHook(() => useWidgets());

      expect(result.current.widgetCount).toBe(0);

      act(() => {
        vi.setSystemTime(1000);
        result.current.addWidget('widget-a', '<p>A</p>');
      });
      expect(result.current.widgetCount).toBe(1);

      act(() => {
        vi.setSystemTime(2000);
        result.current.addWidget('widget-b', '<p>B</p>');
      });
      expect(result.current.widgetCount).toBe(2);

      act(() => {
        vi.setSystemTime(3000);
        result.current.addWidget('widget-c', '<p>C</p>');
      });
      expect(result.current.widgetCount).toBe(3);

      act(() => {
        result.current.removeWidget('widget-b');
      });
      expect(result.current.widgetCount).toBe(2);

      act(() => {
        result.current.removeWidget('widget-a');
      });
      expect(result.current.widgetCount).toBe(1);

      act(() => {
        result.current.removeWidget('widget-c');
      });
      expect(result.current.widgetCount).toBe(0);
    });
  });
});
