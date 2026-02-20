import { useRef, useCallback } from 'react';
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
    fitAddon.fit();

    terminal.onData((data) => options.onData?.(data));
    terminal.onResize(({ cols, rows }) => options.onResize?.(cols, rows));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

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

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // stable ref — options are captured at first call

  const write = useCallback((data: string | ArrayBuffer | Uint8Array) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    // Use write callback to scroll after data is parsed — xterm.js write() is async
    const scrollCb = () => terminal.scrollToBottom();
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

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const setFontSize = useCallback((size: number) => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = size;
      fitAddonRef.current?.fit();
    }
  }, []);

  return {
    initTerminal,
    write,
    fit,
    clear,
    reset,
    focus,
    setFontSize,
    terminal: terminalRef,
  };
}
