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
}

export function PreviewOverlay({ sessionId, bridge, containerWidth, containerHeight }: PreviewOverlayProps) {
  const [commentInput, setCommentInput] = useState('');
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [sending, setSending] = useState(false);
  // Screenshot state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  // Recording state
  const [showRecordingPlayer, setShowRecordingPlayer] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
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

  const handleCaptureScreenshot = useCallback(() => {
    bridge.captureScreenshot();
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
  const handleToggleRecording = useCallback(() => {
    if (bridge.isRecording) {
      bridge.stopRecording();
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      // Player will show when videoDataUrl arrives from bridge
      setShowRecordingPlayer(true);
    } else {
      bridge.startRecording();
      setRecordingTimer(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTimer((t) => t + 1);
      }, 1000);
    }
  }, [bridge]);

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

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-auto">
        {/* Inspect mode toggle */}
        <button
          onClick={() => bridge.toggleInspectMode()}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs ${
            bridge.inspectMode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
          }`}
          title={bridge.inspectMode ? 'Exit inspect mode' : 'Inspect element'}
          disabled={!bridge.isReady}
        >
          +
        </button>

        {/* Screenshot button */}
        <button
          onClick={handleCaptureScreenshot}
          className="w-7 h-7 flex items-center justify-center rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600"
          title="Capture screenshot"
          disabled={!bridge.isReady}
        >
          S
        </button>

        {/* Record button */}
        <button
          onClick={handleToggleRecording}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs ${
            bridge.isRecording
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
          }`}
          title={bridge.isRecording ? `Stop recording (${recordingTimer}s)` : 'Start recording'}
          disabled={!bridge.isReady}
        >
          {bridge.isRecording ? 'X' : 'R'}
        </button>

        {/* Recording timer */}
        {bridge.isRecording && (
          <span className="text-xs text-red-400 font-mono">{recordingTimer}s</span>
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
