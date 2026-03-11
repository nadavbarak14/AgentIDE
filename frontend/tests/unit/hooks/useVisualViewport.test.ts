import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVisualViewport } from '../../../src/hooks/useVisualViewport';

describe('useVisualViewport', () => {
  let originalVisualViewport: VisualViewport | null;
  let originalInnerHeight: number;
  let originalInnerWidth: number;
  let mockVV: {
    height: number;
    width: number;
    offsetTop: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    originalVisualViewport = window.visualViewport;
    originalInnerHeight = window.innerHeight;
    originalInnerWidth = window.innerWidth;

    mockVV = {
      height: 800,
      width: 375,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'visualViewport', {
      value: originalVisualViewport,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: originalInnerHeight,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  function setVisualViewport(vv: typeof mockVV | null) {
    Object.defineProperty(window, 'visualViewport', {
      value: vv,
      writable: true,
      configurable: true,
    });
  }

  function setWindowSize(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: height,
      writable: true,
      configurable: true,
    });
  }

  describe('keyboard detection', () => {
    it('reports keyboardOpen when viewport height reduced by > 150px', () => {
      setWindowSize(375, 800);
      mockVV.height = 450; // keyboard takes 350px
      mockVV.width = 375;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      // trigger initial update
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.keyboardOpen).toBe(true);
      expect(result.current.keyboardOffset).toBeGreaterThan(150);
    });

    it('reports keyboardOpen=false when height difference < 150px', () => {
      setWindowSize(375, 800);
      mockVV.height = 750; // only 50px difference (browser chrome)
      mockVV.width = 375;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.keyboardOpen).toBe(false);
    });

    it('calculates correct keyboardOffset', () => {
      setWindowSize(375, 800);
      mockVV.height = 500;
      mockVV.width = 375;
      mockVV.offsetTop = 0;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.keyboardOffset).toBe(300); // 800 - (0 + 500)
    });
  });

  describe('isMobile flag', () => {
    it('returns isMobile=true when viewport width < 640px', () => {
      setWindowSize(375, 800);
      mockVV.height = 800;
      mockVV.width = 375;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.isMobile).toBe(true);
    });

    it('returns isMobile=false when viewport width >= 640px', () => {
      setWindowSize(1024, 768);
      mockVV.height = 768;
      mockVV.width = 1024;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.isMobile).toBe(false);
    });

    it('returns isMobile=true at exactly 639px', () => {
      setWindowSize(639, 800);
      mockVV.height = 800;
      mockVV.width = 639;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.isMobile).toBe(true);
    });

    it('returns isMobile=false at exactly 768px', () => {
      setWindowSize(768, 800);
      mockVV.height = 800;
      mockVV.width = 768;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.isMobile).toBe(false);
    });
  });

  describe('debouncing', () => {
    it('debounces resize events to 50ms', () => {
      setWindowSize(375, 800);
      mockVV.height = 800;
      mockVV.width = 375;
      setVisualViewport(mockVV);

      const { result } = renderHook(() => useVisualViewport());

      // Get the resize handler that was registered
      const resizeHandler = mockVV.addEventListener.mock.calls.find(
        (call: [string, () => void]) => call[0] === 'resize'
      )?.[1];
      expect(resizeHandler).toBeDefined();

      // Simulate keyboard open
      mockVV.height = 450;
      act(() => { resizeHandler!(); });

      // Not yet debounced — should still show old state
      expect(result.current.keyboardOpen).toBe(false);

      // Advance past debounce
      act(() => { vi.advanceTimersByTime(60); });

      expect(result.current.keyboardOpen).toBe(true);
    });
  });

  describe('fallback without visualViewport', () => {
    it('works without visualViewport API (desktop fallback)', () => {
      setWindowSize(1024, 768);
      setVisualViewport(null);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.keyboardOpen).toBe(false);
      expect(result.current.viewportHeight).toBe(768);
      expect(result.current.keyboardOffset).toBe(0);
      expect(result.current.isMobile).toBe(false);
    });

    it('returns isMobile=true even without visualViewport on narrow window', () => {
      setWindowSize(375, 800);
      setVisualViewport(null);

      const { result } = renderHook(() => useVisualViewport());
      act(() => { vi.advanceTimersByTime(100); });

      expect(result.current.isMobile).toBe(true);
      expect(result.current.keyboardOpen).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      setWindowSize(375, 800);
      mockVV.height = 800;
      mockVV.width = 375;
      setVisualViewport(mockVV);

      const { unmount } = renderHook(() => useVisualViewport());
      unmount();

      expect(mockVV.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(mockVV.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
  });
});
