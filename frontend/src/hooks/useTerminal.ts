import { useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Buffer data that arrives before xterm.js is initialized, so nothing is lost
  const pendingWritesRef = useRef<Array<string | ArrayBuffer | Uint8Array>>([]);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const isScrolledUpRef = useRef(false);

  const initTerminal = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    containerRef.current = container;

    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const clipboardAddon = new ClipboardAddon();
    terminal.loadAddon(clipboardAddon);

    // Let certain key combos pass through xterm to global handlers.
    terminal.attachCustomKeyEventHandler((arg) => {
      if (arg.type !== 'keydown') return true;
      // Ctrl+. → global prefix chord handler
      if (arg.key === '.' && arg.ctrlKey && !arg.shiftKey && !arg.altKey && !arg.metaKey) {
        return false;
      }
      // Ctrl+Shift+F → project search
      if (arg.key === 'F' && arg.ctrlKey && arg.shiftKey && !arg.altKey && !arg.metaKey) {
        return false;
      }
      return true;
    });

    terminal.open(container);
    terminal.options.scrollSensitivity = 5;     // lines per mouse wheel tick
    terminal.options.fastScrollSensitivity = 10; // lines per Alt+wheel tick
    fitAddon.fit();

    terminal.onData((data) => options.onData?.(data));
    terminal.onResize(({ cols, rows }) => options.onResize?.(cols, rows));

    // Track scroll position for scroll-to-bottom button and auto-scroll gating
    terminal.onScroll(() => {
      const maxScroll = terminal.buffer.active.length - terminal.rows;
      const atBottom = terminal.buffer.active.viewportY >= maxScroll - 1;
      isScrolledUpRef.current = !atBottom;
      setIsScrolledUp(!atBottom);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Flush any data that arrived before the terminal was ready
    if (pendingWritesRef.current.length > 0) {
      for (const chunk of pendingWritesRef.current) {
        if (typeof chunk === 'string') {
          terminal.write(chunk);
        } else {
          terminal.write(new Uint8Array(chunk instanceof ArrayBuffer ? chunk : chunk));
        }
      }
      pendingWritesRef.current = [];
      terminal.scrollToBottom();
    }

    // Debounced resize handler — re-fit terminal when container size changes.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = container.offsetWidth;
    let lastHeight = container.offsetHeight;

    const resizeObserver = new ResizeObserver(() => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (Math.abs(w - lastWidth) < 2 && Math.abs(h - lastHeight) < 2) return;
      lastWidth = w;
      lastHeight = h;

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
      }, 50);
    });
    resizeObserver.observe(container);

    // Heartbeat: periodically call fit() and nudge the PTY to force a redraw.
    // fit() alone no-ops when container dimensions haven't changed, but TUI apps
    // (vim, htop, etc.) can still drift. The nudge shrinks by 1 col then restores,
    // which triggers SIGWINCH and forces the app to repaint.
    // Skip when the terminal is focused (user is typing / agent awaiting input).
    const heartbeat = setInterval(() => {
      fitAddon.fit();
      const t = terminalRef.current;
      if (t && t.cols > 2 && !container.contains(document.activeElement)) {
        options.onResize?.(t.cols - 1, t.rows);
        setTimeout(() => options.onResize?.(t.cols, t.rows), 80);
      }
    }, 60000);

    return () => {
      clearInterval(heartbeat);
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // stable ref — options are captured at first call

  const write = useCallback((data: string | ArrayBuffer | Uint8Array) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      // Buffer data until terminal is initialized — prevents silent data loss
      pendingWritesRef.current.push(data);
      return;
    }
    // Only auto-scroll if user hasn't scrolled up — respect their reading position.
    // Uses a ref (not state) because write() fires rapidly and state would be stale.
    const scrollCb = isScrolledUpRef.current ? undefined : () => {
      terminal.scrollToBottom();
    };
    if (typeof data === 'string') {
      terminal.write(data, scrollCb);
    } else {
      terminal.write(new Uint8Array(data), scrollCb);
    }
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.reset();
    fitAddonRef.current?.fit();
  }, []);

  const nudge = useCallback(() => {
    const t = terminalRef.current;
    if (t && t.cols > 2) {
      fitAddonRef.current?.fit();
      options.onResize?.(t.cols - 1, t.rows);
      setTimeout(() => options.onResize?.(t.cols, t.rows), 80);
    }
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const setFontSize = useCallback((size: number) => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = size;
      fitAddonRef.current?.fit();
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
    isScrolledUpRef.current = false;
    setIsScrolledUp(false);
  }, []);

  return {
    initTerminal,
    write,
    fit,
    nudge,
    clear,
    reset,
    focus,
    setFontSize,
    scrollToBottom,
    isScrolledUp,
    terminal: terminalRef,
  };
}
