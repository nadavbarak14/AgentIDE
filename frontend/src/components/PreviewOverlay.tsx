import { useState, useCallback, useEffect, useRef } from 'react';
import type { UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import type { CreatePreviewCommentInput } from '../services/api';
import { previewComments, screenshots } from '../services/api';
import { AnnotationCanvas } from './AnnotationCanvas';
import { RecordingPlayer } from './RecordingPlayer';

interface PreviewOverlayProps {
  sessionId: string;
  bridge: UsePreviewBridgeReturn;
  containerWidth: number;
  containerHeight: number;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function PreviewOverlay({ sessionId, bridge, containerWidth, containerHeight, isFullscreen = false, onToggleFullscreen }: PreviewOverlayProps) {
  const [commentInput, setCommentInput] = useState('');
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [sending, setSending] = useState(false);
  // Screenshot state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotDropdownOpen, setScreenshotDropdownOpen] = useState(false);
  const screenshotDropdownRef = useRef<HTMLDivElement>(null);
  // Recording state
  const [showRecordingPlayer, setShowRecordingPlayer] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [recordDropdownOpen, setRecordDropdownOpen] = useState(false);
  const recordDropdownRef = useRef<HTMLDivElement>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle element selection from bridge
  useEffect(() => {
    if (bridge.selectedElement && bridge.inspectMode) {
      setShowCommentForm(true);
      setCommentInput('');
    }
  }, [bridge.selectedElement, bridge.inspectMode]);

  const handleSubmitComment = useCallback(async () => {
    if (!commentInput.trim() || !bridge.selectedElement || sending) return;
    setSending(true);

    const el = bridge.selectedElement;
    const input: CreatePreviewCommentInput = {
      commentText: commentInput.trim(),
      elementSelector: el.selector,
      elementTag: el.tag,
      elementRect: el.rect,
      pageUrl: el.pageUrl,
      pinX: (el.rect.x + el.rect.width / 2) / containerWidth,
      pinY: (el.rect.y + el.rect.height / 2) / containerHeight,
      viewportWidth: containerWidth,
      viewportHeight: containerHeight,
    };

    try {
      await previewComments.create(sessionId, input);
      await previewComments.deliver(sessionId);
      setCommentInput('');
      setShowCommentForm(false);
      bridge.exitInspectMode();
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setSending(false);
    }
  }, [commentInput, bridge, sessionId, containerWidth, containerHeight, sending]);

  // Screenshot: listen for bridge screenshot captured event
  useEffect(() => {
    if (bridge.screenshotDataUrl) {
      setScreenshotDataUrl(bridge.screenshotDataUrl);
    }
  }, [bridge.screenshotDataUrl]);

  const handleCaptureScreenshot = useCallback((mode: 'full' | 'viewport') => {
    bridge.captureScreenshot(mode);
    setScreenshotDropdownOpen(false);
  }, [bridge]);

  const handleSaveAnnotatedScreenshot = useCallback(async (annotatedDataUrl: string) => {
    try {
      const result = await screenshots.save(sessionId, { dataUrl: annotatedDataUrl });
      await screenshots.deliver(sessionId, result.id, { screenshotPath: result.storedPath, message: 'Please review this annotated screenshot.' });
      setScreenshotDataUrl(null);
    } catch (err) {
      console.error('Failed to save/deliver screenshot:', err);
    }
  }, [sessionId]);

  // Recording handlers
  const handleStopRecording = useCallback(() => {
    bridge.stopRecording();
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setShowRecordingPlayer(true);
  }, [bridge]);

  const handleStartRecording = useCallback((mode: 'full' | 'viewport') => {
    bridge.startRecording(mode);
    setRecordingTimer(0);
    recordingIntervalRef.current = setInterval(() => {
      setRecordingTimer((t) => t + 1);
    }, 1000);
    setRecordDropdownOpen(false);
  }, [bridge]);

  const handleRecordButtonClick = useCallback(() => {
    if (bridge.isRecording) {
      handleStopRecording();
    } else {
      setRecordDropdownOpen((prev) => !prev);
      setScreenshotDropdownOpen(false);
    }
  }, [bridge.isRecording, handleStopRecording]);

  const handleSendRecording = useCallback(async () => {
    // For video recordings, save the video data URL as a screenshot (it's a data URL)
    if (!bridge.videoDataUrl) return;
    try {
      const result = await screenshots.save(sessionId, { dataUrl: bridge.videoDataUrl });
      await screenshots.deliver(sessionId, result.id, {
        screenshotPath: result.storedPath,
        message: 'Please review this screen recording video.',
      });
      setShowRecordingPlayer(false);
    } catch (err) {
      console.error('Failed to save/deliver recording:', err);
    }
  }, [sessionId, bridge.videoDataUrl]);

  // Cleanup recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  // Click-outside and Escape handler for dropdowns
  useEffect(() => {
    if (!screenshotDropdownOpen && !recordDropdownOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (screenshotDropdownOpen && screenshotDropdownRef.current && !screenshotDropdownRef.current.contains(e.target as Node)) {
        setScreenshotDropdownOpen(false);
      }
      if (recordDropdownOpen && recordDropdownRef.current && !recordDropdownRef.current.contains(e.target as Node)) {
        setRecordDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScreenshotDropdownOpen(false);
        setRecordDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [screenshotDropdownOpen, recordDropdownOpen]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-auto">
        {/* Inspect mode toggle */}
        <button
          onClick={() => bridge.toggleInspectMode()}
          className={`w-7 h-7 flex items-center justify-center rounded text-sm ${
            bridge.inspectMode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
          }`}
          title={bridge.inspectMode ? 'Exit inspect mode' : 'Select element'}
          disabled={!bridge.isReady}
        >
          👁️
        </button>

        {/* Screenshot button with dropdown */}
        <div className="relative" ref={screenshotDropdownRef}>
          <button
            onClick={() => { setScreenshotDropdownOpen((prev) => !prev); setRecordDropdownOpen(false); }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600"
            title="Capture screenshot"
            disabled={!bridge.isReady}
          >
            📸
          </button>
          {screenshotDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-28 bg-gray-800 border border-gray-600 rounded shadow-lg py-0.5">
              <button
                onClick={() => handleCaptureScreenshot('viewport')}
                className="w-full px-3 py-1.5 text-xs text-left text-gray-300 hover:bg-gray-700"
              >
                View
              </button>
              <button
                onClick={() => handleCaptureScreenshot('full')}
                className="w-full px-3 py-1.5 text-xs text-left text-gray-300 hover:bg-gray-700"
              >
                Full Page
              </button>
            </div>
          )}
        </div>

        {/* Record button with dropdown */}
        <div className="relative" ref={recordDropdownRef}>
          <button
            onClick={handleRecordButtonClick}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm ${
              bridge.isRecording
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
            }`}
            title={bridge.isRecording ? `Stop recording (${recordingTimer}s)` : 'Record video'}
            disabled={!bridge.isReady}
          >
            {bridge.isRecording ? '⏹️' : '⏺️'}
          </button>
          {recordDropdownOpen && !bridge.isRecording && (
            <div className="absolute right-0 top-full mt-1 z-50 w-28 bg-gray-800 border border-gray-600 rounded shadow-lg py-0.5">
              <button
                onClick={() => handleStartRecording('viewport')}
                className="w-full px-3 py-1.5 text-xs text-left text-gray-300 hover:bg-gray-700"
              >
                View
              </button>
              <button
                onClick={() => handleStartRecording('full')}
                className="w-full px-3 py-1.5 text-xs text-left text-gray-300 hover:bg-gray-700"
              >
                Full Page
              </button>
            </div>
          )}
        </div>

        {/* Recording timer */}
        {bridge.isRecording && (
          <span className="text-xs text-red-400 font-mono">{recordingTimer}s</span>
        )}

        {/* Fullscreen toggle */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm ${
              isFullscreen
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
            }`}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Screenshot annotation modal */}
      {screenshotDataUrl && (
        <AnnotationCanvas
          imageDataUrl={screenshotDataUrl}
          onSave={handleSaveAnnotatedScreenshot}
          onCancel={() => setScreenshotDataUrl(null)}
        />
      )}

      {/* Recording player modal */}
      {showRecordingPlayer && (
        <RecordingPlayer
          videoDataUrl={bridge.videoDataUrl}
          onClose={() => setShowRecordingPlayer(false)}
          onSendToSession={handleSendRecording}
        />
      )}

      {/* Comment input form (shown when element is selected) */}
      {showCommentForm && bridge.selectedElement && (
        <div
          className="absolute pointer-events-auto z-30"
          style={{
            left: `${Math.min(bridge.selectedElement.rect.x + bridge.selectedElement.rect.width, containerWidth - 280)}px`,
            top: `${Math.min(bridge.selectedElement.rect.y, containerHeight - 180)}px`,
          }}
        >
          <div className="w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3">
            <div className="text-xs text-gray-400 mb-1">
              <span className="text-blue-400">{bridge.selectedElement.selector}</span>
            </div>
            {bridge.selectedElement.text && (
              <div className="text-xs text-gray-500 mb-1.5 truncate max-w-full">
                &ldquo;{bridge.selectedElement.text.substring(0, 60)}&rdquo;
              </div>
            )}
            <textarea
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Describe the issue or feedback..."
              className="w-full h-16 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 resize-none outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
                if (e.key === 'Escape') {
                  setShowCommentForm(false);
                  bridge.exitInspectMode();
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setShowCommentForm(false);
                  bridge.exitInspectMode();
                }}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitComment}
                disabled={!commentInput.trim() || sending}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send to Claude'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
