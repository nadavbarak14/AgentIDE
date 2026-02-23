import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWidgets } from '../../../src/hooks/useWidgets';

describe('useWidgets (canvas)', () => {
  it('starts with no canvas', () => {
    const { result } = renderHook(() => useWidgets());
    expect(result.current.activeWidget).toBeNull();
    expect(result.current.widgets).toHaveLength(0);
    expect(result.current.widgetCount).toBe(0);
  });

  it('addWidget shows canvas content', () => {
    const { result } = renderHook(() => useWidgets());
    act(() => result.current.addWidget('_canvas', '<p>Hello</p>'));
    expect(result.current.activeWidget).not.toBeNull();
    expect(result.current.activeWidget!.html).toBe('<p>Hello</p>');
    expect(result.current.widgetCount).toBe(1);
  });

  it('addWidget replaces existing canvas', () => {
    const { result } = renderHook(() => useWidgets());
    act(() => result.current.addWidget('_canvas', '<p>First</p>'));
    act(() => result.current.addWidget('_canvas', '<p>Second</p>'));
    expect(result.current.widgetCount).toBe(1);
    expect(result.current.activeWidget!.html).toBe('<p>Second</p>');
  });

  it('removeWidget clears the canvas', () => {
    const { result } = renderHook(() => useWidgets());
    act(() => result.current.addWidget('_canvas', '<p>Hello</p>'));
    expect(result.current.widgetCount).toBe(1);
    act(() => result.current.removeWidget('_canvas'));
    expect(result.current.activeWidget).toBeNull();
    expect(result.current.widgetCount).toBe(0);
  });

  it('widgets array has one entry when canvas is open', () => {
    const { result } = renderHook(() => useWidgets());
    act(() => result.current.addWidget('_canvas', '<p>Hello</p>'));
    expect(result.current.widgets).toHaveLength(1);
    expect(result.current.widgets[0].html).toBe('<p>Hello</p>');
  });
});
