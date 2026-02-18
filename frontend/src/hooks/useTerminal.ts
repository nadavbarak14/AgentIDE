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

    terminal.open(container);
    fitAddon.fit();

    terminal.onData((data) => options.onData?.(data));
    terminal.onResize(({ cols, rows }) => options.onResize?.(cols, rows));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle container resize — hide terminal during resize to prevent visible re-flow glitch.
    // On size change: immediately hide content, then after layout settles, fit and reveal.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = container.offsetWidth;
    let lastHeight = container.offsetHeight;
    const termElement = container.querySelector('.xterm') as HTMLElement | null;

    const resizeObserver = new ResizeObserver(() => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      // Ignore sub-pixel / no-op changes
      if (Math.abs(w - lastWidth) < 2 && Math.abs(h - lastHeight) < 2) return;

      // Hide terminal content immediately to avoid visible re-flow
      if (termElement) termElement.style.opacity = '0';

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        lastWidth = container.offsetWidth;
        lastHeight = container.offsetHeight;
        fitAddon.fit();
        // Reveal after fit
        if (termElement) termElement.style.opacity = '1';
      }, 100);
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
    if (typeof data === 'string') {
      terminal.write(data);
    } else {
      terminal.write(new Uint8Array(data));
    }
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  return {
    initTerminal,
    write,
    fit,
    clear,
    focus,
    terminal: terminalRef,
  };
}
