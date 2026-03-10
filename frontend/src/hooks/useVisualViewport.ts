import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseVisualViewportReturn {
  /** True when on-screen keyboard is likely open (viewport height significantly reduced) */
  keyboardOpen: boolean;
  /** Current visual viewport height in px */
  viewportHeight: number;
  /** Pixels between bottom of visual viewport and bottom of window (keyboard height) */
  keyboardOffset: number;
  /** True when viewport width < 640px */
  isMobile: boolean;
}

const KEYBOARD_THRESHOLD = 150; // px — keyboards are typically 250-350px
const DEBOUNCE_MS = 50;

export function useVisualViewport(): UseVisualViewportReturn {
  const [state, setState] = useState<UseVisualViewportReturn>(() => {
    if (typeof window === 'undefined') {
      return { keyboardOpen: false, viewportHeight: 0, keyboardOffset: 0, isMobile: false };
    }
    const vv = window.visualViewport;
    const height = vv?.height ?? window.innerHeight;
    const width = vv?.width ?? window.innerWidth;
    return {
      keyboardOpen: false,
      viewportHeight: height,
      keyboardOffset: 0,
      isMobile: width < 640,
    };
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback for browsers without visualViewport (desktop)
      setState(prev => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isMobile = width < 640;
        if (prev.viewportHeight === height && prev.isMobile === isMobile && !prev.keyboardOpen) {
          return prev;
        }
        return { keyboardOpen: false, viewportHeight: height, keyboardOffset: 0, isMobile };
      });
      return;
    }

    const height = vv.height;
    const width = vv.width;
    const offset = window.innerHeight - (vv.offsetTop + vv.height);
    const keyboardOpen = offset > KEYBOARD_THRESHOLD;

    setState(prev => {
      if (
        prev.keyboardOpen === keyboardOpen &&
        Math.abs(prev.viewportHeight - height) < 1 &&
        Math.abs(prev.keyboardOffset - offset) < 1 &&
        prev.isMobile === (width < 640)
      ) {
        return prev;
      }
      return {
        keyboardOpen,
        viewportHeight: height,
        keyboardOffset: Math.max(0, offset),
        isMobile: width < 640,
      };
    });
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;

    const handleResize = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(update, DEBOUNCE_MS);
    };

    if (vv) {
      vv.addEventListener('resize', handleResize);
      vv.addEventListener('scroll', handleResize);
    }

    // Also listen to window resize for isMobile changes on desktop
    window.addEventListener('resize', handleResize);

    // Initial update
    update();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (vv) {
        vv.removeEventListener('resize', handleResize);
        vv.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [update]);

  return state;
}
