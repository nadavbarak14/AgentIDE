import { useEffect, useRef } from 'react';

interface MobileTerminalOutputProps {
  output: string[];
  className?: string;
}

/** Strip ANSI escape codes from a string for plain-text rendering. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function MobileTerminalOutput({ output, className = '' }: MobileTerminalOutputProps) {
  const containerRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [output]);

  const plainText = output.map(stripAnsi).join('\n');

  return (
    <pre
      ref={containerRef}
      className={`font-mono text-xs sm:text-sm text-green-400 whitespace-pre-wrap break-all overflow-y-auto p-3 bg-gray-950 flex-1 ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {plainText || '\u00a0'}
    </pre>
  );
}
