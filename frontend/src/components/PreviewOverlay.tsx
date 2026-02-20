import { useState, useCallback, useEffect, useRef } from 'react';
import type { UsePreviewBridgeReturn } from '../hooks/usePreviewBridge';
import type { PreviewCommentData, CreatePreviewCommentInput } from '../services/api';
import { previewComments, screenshots, recordings } from '../services/api';
import { AnnotationCanvas } from './AnnotationCanvas';
import { RecordingPlayer } from './RecordingPlayer';

interface PreviewOverlayProps {
  sessionId: string;
  bridge: UsePreviewBridgeReturn;
  containerWidth: number;
  containerHeight: number;
}

export function PreviewOverlay({ sessionId, bridge, containerWidth, containerHeight }: PreviewOverlayProps) {
  const [comments, setComments] = useState<PreviewCommentData[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [activePin, setActivePin] = useState<string | null>(null);
  const [showCommentForm, setShowCommentForm] = useState(false);
  // Screenshot state
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
    // Recording state
  const [showRecordingPlayer, setShowRecordingPlayer] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load comments on mount
  useEffect(() => {
    previewComments.list(sessionId).then(setComments).catch(() => {});
  }, [sessionId]);

  // Handle element selection from bridge
  useEffect(() => {
    if (bridge.selectedElement && bridge.inspectMode) {
      setShowCommentForm(true);
      setCommentInput('');
    }
  }, [bridge.selectedElement, bridge.inspectMode]);

  // Stale comment detection: when bridge becomes ready (after reload), check selectors
  const prevBridgeReady = useRef(false);
  useEffect(() => {
    if (bridge.isReady && !prevBridgeReady.current && comments.length > 0) {
      const selectors = comments
        .filter((c) => c.status !== 'stale')
        .map((c) => c.elementSelector)
        .filter(Boolean) as string[];
      if (selectors.length > 0) {
        bridge.checkElements(selectors);
      }
    }
    prevBridgeReady.current = bridge.isReady;
  }, [bridge.isReady, bridge, comments]);

  // Handle elements check results — mark missing elements as stale
  useEffect(() => {
    if (!bridge.elementsCheckResult) return;
    const results = bridge.elementsCheckResult;
    setComments((prev) =>
      prev.map((c) => {
        if (c.elementSelector && results[c.elementSelector] === false && c.status !== 'stale') {
          previewComments.update(sessionId, c.id, 'stale').catch(() => {});
          return { ...c, status: 'stale' as const };
        }
        return c;
      }),
    );
  }, [bridge.elementsCheckResult, sessionId]);

  const handleSubmitComment = useCallback(async () => {
    if (!commentInput.trim() || !bridge.selectedElement) return;

    const el = bridge.selectedElement;
    const input: CreatePreviewCommentInput = {
      commentText: commentInput.trim(),
      elementSelector: el.selector,
      elementTag: el.tag,
      elementRect: el.rect,
      pinX: (el.rect.x + el.rect.width / 2) / containerWidth,
      pinY: (el.rect.y + el.rect.height / 2) / containerHeight,
      viewportWidth: containerWidth,
      viewportHeight: containerHeight,
    };

    // Capture element screenshot if possible
    bridge.captureElement(el.selector);

    try {
      const comment = await previewComments.create(sessionId, input);
      setComments((prev) => [...prev, comment]);
      setCommentInput('');
      setShowCommentForm(false);
      bridge.exitInspectMode();
    } catch (err) {
      console.error('Failed to create preview comment:', err);
    }
  }, [commentInput, bridge, sessionId, containerWidth, containerHeight]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      await previewComments.delete(sessionId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setActivePin(null);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  }, [sessionId]);

  const handleDeliverAll = useCallback(async () => {
    try {
      const result = await previewComments.deliver(sessionId);
      if (result.delivered > 0) {
        // Refresh list to get updated statuses
        const updated = await previewComments.list(sessionId);
        setComments(updated);
      }
    } catch (err) {
      console.error('Failed to deliver comments:', err);
    }
  }, [sessionId]);

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
    try {
      const events = bridge.recordedEvents?.current || [];
      if (events.length === 0) return;
      const result = await recordings.save(sessionId, {
        events,
        durationMs: recordingTimer * 1000,
      });
      await recordings.deliver(sessionId, result.id);
      setShowRecordingPlayer(false);
    } catch (err) {
      console.error('Failed to save/deliver recording:', err);
    }
  }, [sessionId, bridge, recordingTimer]);

  // Cleanup recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  const pendingCount = comments.filter((c) => c.status === 'pending').length;

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
          📷
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
          {bridge.isRecording ? '⏹' : '⏺'}
        </button>

        {/* Recording timer */}
        {bridge.isRecording && (
          <span className="text-xs text-red-400 font-mono">{recordingTimer}s</span>
        )}

        {/* Deliver all pending */}
        {pendingCount > 0 && (
          <button
            onClick={handleDeliverAll}
            className="px-2 h-7 flex items-center gap-1 rounded text-xs bg-green-600/80 text-white hover:bg-green-600 border border-green-500"
            title={`Send ${pendingCount} comment(s) to Claude`}
          >
            Send {pendingCount}
          </button>
        )}
      </div>

      {/* Comment pins */}
      {comments.map((comment, index) => (
        <div
          key={comment.id}
          className="absolute pointer-events-auto"
          style={{
            left: `${comment.pinX * 100}%`,
            top: `${comment.pinY * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <button
            onClick={() => setActivePin(activePin === comment.id ? null : comment.id)}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-lg ${
              comment.status === 'sent'
                ? 'bg-green-600 border-green-400 text-white'
                : comment.status === 'stale'
                  ? 'bg-yellow-600 border-yellow-400 text-white'
                  : 'bg-blue-600 border-blue-400 text-white'
            }`}
            title={comment.commentText}
          >
            {index + 1}
          </button>

          {/* Popover */}
          {activePin === comment.id && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 z-30">
              <div className="text-xs text-gray-400 mb-1">
                {comment.elementSelector || 'Element'}
              </div>
              <div className="text-sm text-gray-200 mb-2">
                {comment.commentText}
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  comment.status === 'sent'
                    ? 'bg-green-900/50 text-green-400'
                    : comment.status === 'stale'
                      ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-blue-900/50 text-blue-400'
                }`}>
                  {comment.status}
                </span>
                <div className="flex-1" />
                {comment.status === 'pending' && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

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
          events={bridge.recordedEvents?.current || []}
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
            top: `${Math.min(bridge.selectedElement.rect.y, containerHeight - 120)}px`,
          }}
        >
          <div className="w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3">
            <div className="text-xs text-gray-400 mb-1.5">
              Comment on: <span className="text-blue-400">{bridge.selectedElement.selector}</span>
            </div>
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
                disabled={!commentInput.trim()}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
