import { useEffect } from 'react';

interface RecordingPlayerProps {
  videoDataUrl: string | null;
  onClose: () => void;
  onSendToSession?: () => void;
}

export function RecordingPlayer({ videoDataUrl, onClose, onSendToSession }: RecordingPlayerProps) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center pointer-events-auto" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-200">Recording</h3>
          <div className="flex items-center gap-2">
            {onSendToSession && videoDataUrl && (
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

        {/* Video player */}
        <div className="bg-black flex items-center justify-center" style={{ minHeight: 300 }}>
          {videoDataUrl ? (
            <video
              src={videoDataUrl}
              controls
              autoPlay
              className="max-w-full max-h-[70vh]"
              style={{ background: '#000' }}
            />
          ) : (
            <div className="text-gray-400 text-sm p-8">Processing recording...</div>
          )}
        </div>
      </div>
    </div>
  );
}
