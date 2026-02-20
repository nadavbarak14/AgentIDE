import { useState, useRef, useEffect, useCallback } from 'react';

interface RecordingPlayerProps {
  events: unknown[];
  width?: number;
  height?: number;
  onClose: () => void;
  onSendToSession?: () => void;
}

interface TimestampedEvent { timestamp: number; [key: string]: unknown }

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function RecordingPlayer({
  events, width = 1024, height = 768, onClose, onSendToSession,
}: RecordingPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<unknown>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Calculate duration from event timestamps
  useEffect(() => {
    if (events.length < 2) { setTotalTime(0); setFallback(true); return; }
    const first = events[0] as TimestampedEvent;
    const last = events[events.length - 1] as TimestampedEvent;
    if (first.timestamp && last.timestamp) {
      setTotalTime(last.timestamp - first.timestamp);
    }
  }, [events]);

  // Try to load rrweb-player dynamically
  useEffect(() => {
    if (!containerRef.current || events.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('rrweb-player');
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        const player = new mod.default({
          target: containerRef.current,
          props: { events: events as never[], width, height, autoPlay: false, showController: false },
        });
        replayerRef.current = player;
        setLoaded(true);
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();
    return () => {
      cancelled = true;
      const r = replayerRef.current as { destroy?: () => void } | null;
      if (r?.destroy) r.destroy();
      replayerRef.current = null;
    };
  }, [events, width, height]);

  // Update progress ticker when playing
  useEffect(() => {
    if (!playing || totalTime === 0) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 100;
        if (next >= totalTime) {
          setPlaying(false);
          setProgress(100);
          return totalTime;
        }
        setProgress((next / totalTime) * 100);
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, totalTime]);

  const handlePlayPause = useCallback(() => {
    if (totalTime === 0) return;
    if (progress >= 100) { setCurrentTime(0); setProgress(0); }
    setPlaying((prev) => !prev);
  }, [totalTime, progress]);

  const handleProgressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setProgress(value);
      setCurrentTime((value / 100) * totalTime);
      setPlaying(false);
    },
    [totalTime],
  );

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-200">Recording Player</h3>
          <div className="flex items-center gap-2">
            {onSendToSession && (
              <button
                onClick={onSendToSession}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
              >
                Send to Session
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 text-xl leading-none px-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Player area */}
        <div
          className="bg-white relative flex items-center justify-center"
          style={{ minHeight: Math.min(height * 0.6, 480) }}
        >
          {fallback ? (
            <div className="text-center text-gray-600 p-8">
              <div className="text-lg font-medium mb-2">DOM Recording</div>
              <div className="text-sm">
                {events.length} events &middot; {formatTime(totalTime)} duration
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Install rrweb-player for full playback
              </div>
            </div>
          ) : !loaded ? (
            <div className="text-gray-400 text-sm">Loading player...</div>
          ) : null}
          <div ref={containerRef} className={fallback ? 'hidden' : ''} />
        </div>

        {/* Controls bar */}
        <div className="bg-gray-800 px-4 py-2 flex items-center gap-3 border-t border-gray-700">
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            disabled={totalTime === 0}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2l10 6-10 6V2z" />
              </svg>
            )}
          </button>
          <input
            type="range" min="0" max="100" step="0.1"
            value={progress} onChange={handleProgressChange}
            className="flex-1 accent-blue-500 h-1" disabled={totalTime === 0}
          />
          <span className="text-xs text-gray-400 tabular-nums min-w-[80px] text-right">
            {formatTime(currentTime)} / {formatTime(totalTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
