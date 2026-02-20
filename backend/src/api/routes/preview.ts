import { Router } from 'express';
import fs from 'node:fs';
import type { Repository } from '../../models/repository.js';
import type { PreviewService } from '../../services/preview-service.js';
import type { CreatePreviewCommentInput, PreviewCommentStatus } from '../../models/types.js';
import { validateUuid } from '../middleware.js';
import { logger } from '../../services/logger.js';

export function createPreviewRouter(repo: Repository, previewService: PreviewService): Router {
  const router = Router();

  // POST /api/sessions/:id/preview-comments — create a preview comment
  router.post('/:id/preview-comments', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const {
      commentText,
      elementSelector,
      elementTag,
      elementRect,
      screenshotDataUrl,
      pageUrl,
      pinX,
      pinY,
      viewportWidth,
      viewportHeight,
    } = req.body;

    if (typeof commentText !== 'string' || !commentText.trim()) {
      res.status(400).json({ error: 'commentText is required' });
      return;
    }
    if (typeof pinX !== 'number' || typeof pinY !== 'number') {
      res.status(400).json({ error: 'pinX and pinY are required numbers' });
      return;
    }

    try {
      const input: CreatePreviewCommentInput = {
        commentText: commentText.trim(),
        elementSelector: elementSelector || undefined,
        elementTag: elementTag || undefined,
        elementRect: elementRect || undefined,
        pageUrl: pageUrl || undefined,
        pinX,
        pinY,
        viewportWidth: viewportWidth || undefined,
        viewportHeight: viewportHeight || undefined,
      };

      const comment = repo.createPreviewComment(sessionId, input);

      // If a screenshot data URL was provided, save it and update the comment
      if (screenshotDataUrl && typeof screenshotDataUrl === 'string') {
        try {
          const screenshotResult = previewService.saveScreenshotDataUrl(sessionId, screenshotDataUrl, pageUrl);
          repo.updatePreviewCommentScreenshotPath(comment.id, screenshotResult.storedPath);
          // Re-fetch to get the updated screenshot path
          const updated = repo.getPreviewComment(comment.id);
          logger.info(
            { sessionId, commentId: comment.id, screenshotPath: screenshotResult.storedPath },
            'preview comment created with screenshot',
          );
          res.status(201).json(updated);
          return;
        } catch (err) {
          logger.warn(
            { sessionId, commentId: comment.id, err: err instanceof Error ? err.message : err },
            'failed to save screenshot for preview comment — comment created without screenshot',
          );
        }
      }

      logger.info({ sessionId, commentId: comment.id }, 'preview comment created');
      res.status(201).json(comment);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to create preview comment');
      res.status(500).json({ error: 'Failed to create preview comment' });
    }
  });

  // GET /api/sessions/:id/preview-comments — list preview comments
  router.get('/:id/preview-comments', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const status = req.query.status as PreviewCommentStatus | undefined;
    if (status && !['pending', 'sent', 'stale'].includes(status)) {
      res.status(400).json({ error: 'Invalid status filter. Must be pending, sent, or stale' });
      return;
    }

    try {
      const comments = status
        ? repo.getPreviewCommentsByStatus(sessionId, status)
        : repo.getPreviewComments(sessionId);
      res.json(comments);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to list preview comments');
      res.status(500).json({ error: 'Failed to list preview comments' });
    }
  });

  // POST /api/sessions/:id/preview-comments/deliver — deliver all pending comments
  router.post('/:id/preview-comments/deliver', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = previewService.deliverAllPreviewComments(sessionId);
      res.json({ delivered: result.delivered, message: result.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, err: message }, 'failed to deliver preview comments');
      res.status(500).json({ error: 'Failed to deliver preview comments' });
    }
  });

  // POST /api/sessions/:id/preview-comments/:commentId/deliver — deliver single comment
  router.post('/:id/preview-comments/:commentId/deliver', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = previewService.deliverPreviewComment(sessionId, commentId);
      res.json({ delivered: true, commentId: result.commentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, commentId, err: message }, 'failed to deliver preview comment');
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('not pending') || message.includes('not active')) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: 'Failed to deliver preview comment' });
      }
    }
  });

  // PATCH /api/sessions/:id/preview-comments/:commentId — update comment status
  router.patch('/:id/preview-comments/:commentId', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { status } = req.body;
    if (!status || !['pending', 'sent', 'stale'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be pending, sent, or stale' });
      return;
    }

    try {
      const updated = repo.updatePreviewCommentStatus(commentId, status as PreviewCommentStatus);
      if (!updated) {
        res.status(404).json({ error: 'Preview comment not found' });
        return;
      }
      logger.info({ sessionId, commentId, status }, 'preview comment status updated');
      res.json(updated);
    } catch (err) {
      logger.error({ sessionId, commentId, err: err instanceof Error ? err.message : err }, 'failed to update preview comment status');
      res.status(500).json({ error: 'Failed to update preview comment status' });
    }
  });

  // DELETE /api/sessions/:id/preview-comments/:commentId — delete a comment
  router.delete('/:id/preview-comments/:commentId', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const deleted = repo.deletePreviewComment(commentId);
      if (!deleted) {
        res.status(404).json({ error: 'Preview comment not found' });
        return;
      }
      logger.info({ sessionId, commentId }, 'preview comment deleted');
      res.status(204).send();
    } catch (err) {
      logger.error({ sessionId, commentId, err: err instanceof Error ? err.message : err }, 'failed to delete preview comment');
      res.status(500).json({ error: 'Failed to delete preview comment' });
    }
  });

  // POST /api/sessions/:id/screenshots — save a screenshot
  router.post('/:id/screenshots', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { dataUrl, pageUrl } = req.body;
    if (typeof dataUrl !== 'string' || !dataUrl) {
      res.status(400).json({ error: 'dataUrl is required' });
      return;
    }

    try {
      const result = previewService.saveScreenshotDataUrl(sessionId, dataUrl, pageUrl);
      logger.info({ sessionId, screenshotId: result.id, pageUrl }, 'screenshot saved');
      res.status(201).json({
        id: result.id,
        storedPath: result.storedPath,
        pageUrl: pageUrl || null,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to save screenshot');
      res.status(500).json({ error: 'Failed to save screenshot' });
    }
  });

  // POST /api/sessions/:id/screenshots/:screenshotId/deliver — deliver a screenshot
  router.post('/:id/screenshots/:screenshotId/deliver', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const screenshotId = String(req.params.screenshotId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { message, screenshotPath } = req.body;
    if (typeof screenshotPath !== 'string' || !screenshotPath) {
      res.status(400).json({ error: 'screenshotPath is required' });
      return;
    }

    try {
      previewService.deliverScreenshot(sessionId, screenshotPath, message);
      logger.info({ sessionId, screenshotId, screenshotPath }, 'screenshot delivered');
      res.json({ delivered: true, screenshotId });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, screenshotId, err: errMessage }, 'failed to deliver screenshot');
      if (errMessage.includes('not found')) {
        res.status(404).json({ error: errMessage });
      } else if (errMessage.includes('not active')) {
        res.status(400).json({ error: errMessage });
      } else {
        res.status(500).json({ error: 'Failed to deliver screenshot' });
      }
    }
  });

  // POST /api/sessions/:id/recordings — save a recording
  router.post('/:id/recordings', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { events, durationMs, pageUrl, viewportWidth, viewportHeight, thumbnailDataUrl } = req.body;
    if (!Array.isArray(events)) {
      res.status(400).json({ error: 'events must be an array' });
      return;
    }

    try {
      const result = previewService.saveRecordingEvents(
        sessionId,
        events,
        pageUrl,
        viewportWidth,
        viewportHeight,
        thumbnailDataUrl,
      );

      const recording = repo.createVideoRecording({
        sessionId,
        eventsPath: result.eventsPath,
        thumbnailPath: result.thumbnailPath || undefined,
        durationMs: durationMs || undefined,
        eventCount: events.length,
        pageUrl: pageUrl || undefined,
        viewportWidth: viewportWidth || undefined,
        viewportHeight: viewportHeight || undefined,
      });

      logger.info({ sessionId, recordingId: recording.id, eventCount: events.length }, 'recording saved');
      res.status(201).json(recording);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to save recording');
      res.status(500).json({ error: 'Failed to save recording' });
    }
  });

  // GET /api/sessions/:id/recordings — list recordings
  router.get('/:id/recordings', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const recordings = repo.getVideoRecordings(sessionId);
      res.json(recordings);
    } catch (err) {
      logger.error({ sessionId, err: err instanceof Error ? err.message : err }, 'failed to list recordings');
      res.status(500).json({ error: 'Failed to list recordings' });
    }
  });

  // GET /api/sessions/:id/recordings/:recordingId — get recording with events
  router.get('/:id/recordings/:recordingId', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const recordingId = String(req.params.recordingId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const recording = repo.getVideoRecording(recordingId);
      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // Read events JSON from disk
      let events: unknown[] = [];
      if (recording.eventsPath && fs.existsSync(recording.eventsPath)) {
        const raw = fs.readFileSync(recording.eventsPath, 'utf-8');
        events = JSON.parse(raw);
      }

      res.json({ ...recording, events });
    } catch (err) {
      logger.error({ sessionId, recordingId, err: err instanceof Error ? err.message : err }, 'failed to get recording');
      res.status(500).json({ error: 'Failed to get recording' });
    }
  });

  // POST /api/sessions/:id/recordings/:recordingId/deliver — deliver recording
  router.post('/:id/recordings/:recordingId/deliver', validateUuid('id'), (req, res) => {
    const sessionId = String(req.params.id);
    const recordingId = String(req.params.recordingId);
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = previewService.deliverRecording(sessionId, recordingId);
      res.json(result);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, recordingId, err: errMessage }, 'failed to deliver recording');
      if (errMessage.includes('not found')) {
        res.status(404).json({ error: errMessage });
      } else if (errMessage.includes('not active')) {
        res.status(400).json({ error: errMessage });
      } else {
        res.status(500).json({ error: 'Failed to deliver recording' });
      }
    }
  });

  return router;
}
