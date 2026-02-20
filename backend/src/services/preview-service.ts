import type { Repository } from '../models/repository.js';
import type { SessionManager } from './session-manager.js';
import { logger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';

export class PreviewService {
  constructor(
    private repo: Repository,
    private sessionManager: SessionManager,
  ) {}

  // ─── Preview Comment Delivery ───

  /**
   * Deliver a single pending preview comment to the active session via PTY stdin.
   */
  deliverPreviewComment(
    sessionId: string,
    commentId: string,
  ): { delivered: boolean; commentId: string } {
    const comment = this.repo.getPreviewComment(commentId);
    if (!comment) {
      throw new Error(`Preview comment not found: ${commentId}`);
    }
    if (comment.status !== 'pending') {
      throw new Error(`Preview comment is not pending: ${commentId} (status: ${comment.status})`);
    }

    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId} (status: ${session.status})`);
    }

    const rect = comment.elementRectJson ? JSON.parse(comment.elementRectJson) : null;
    const selector = comment.elementSelector || 'unknown';
    const rectStr = rect ? `(${rect.x},${rect.y})` : '(unknown)';
    const screenshotStr = comment.screenshotPath || 'none';

    const message = `[Visual Feedback] Element: ${selector} at ${rectStr}, Screenshot: ${screenshotStr}, Comment: ${comment.commentText}. Please address this feedback.\n`;

    logger.info(
      { sessionId, commentId, selector },
      'delivering preview comment',
    );

    this.sessionManager.sendInput(sessionId, message);
    this.repo.markPreviewCommentSent(commentId);

    return { delivered: true, commentId };
  }

  /**
   * Deliver all pending preview comments for a session as a single batch message.
   */
  deliverAllPreviewComments(
    sessionId: string,
  ): { delivered: number; message: string } {
    const pending = this.repo.getPreviewCommentsByStatus(sessionId, 'pending');

    if (pending.length === 0) {
      return { delivered: 0, message: '' };
    }

    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId} (status: ${session.status})`);
    }

    let message: string;

    if (pending.length === 1) {
      const c = pending[0];
      const selector = c.elementSelector || 'unknown';
      message = `[Visual Feedback] Element: ${selector}, Comment: ${c.commentText}. Please address this feedback.\n`;
    } else {
      const items = pending.map((c, i) => {
        const selector = c.elementSelector || 'unknown';
        return `(${i + 1}) Element: ${selector}, Comment: ${c.commentText}`;
      });
      message = `[Visual Feedback — ${pending.length} comments] ${items.join(' ')}. Please address all visual feedback.\n`;
    }

    logger.info(
      { sessionId, count: pending.length },
      'delivering batch preview comments',
    );

    this.sessionManager.sendInput(sessionId, message);

    for (const comment of pending) {
      this.repo.markPreviewCommentSent(comment.id);
    }

    return { delivered: pending.length, message };
  }

  // ─── Screenshot Management ───

  /**
   * Save a screenshot from a data URL to disk within the session's working directory.
   */
  saveScreenshotDataUrl(
    sessionId: string,
    dataUrl: string,
    pageUrl?: string,
  ): { id: string; storedPath: string } {
    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const dir = path.join(session.workingDirectory, '.c3-uploads', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });

    const id = uuid();
    const filename = `${id}.png`;
    const storedPath = path.join(dir, filename);

    // Strip data URL prefix (e.g., "data:image/png;base64,")
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(storedPath, buffer);

    logger.info(
      { sessionId, id, storedPath, pageUrl: pageUrl || null },
      'saved screenshot from data URL',
    );

    return { id, storedPath };
  }

  // ─── Image Delivery ───

  /**
   * Deliver an uploaded image reference to the active session via PTY stdin.
   */
  deliverImage(
    sessionId: string,
    imageId: string,
    message?: string,
  ): { delivered: boolean; imageId: string; deliveredPath: string } {
    const image = this.repo.getUploadedImage(imageId);
    if (!image) {
      throw new Error(`Uploaded image not found: ${imageId}`);
    }

    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId} (status: ${session.status})`);
    }

    const deliveryMessage = `[Image attached: ${image.originalFilename}] Path: ${image.storedPath}. ${message || ''}\n`;

    logger.info(
      { sessionId, imageId, filename: image.originalFilename },
      'delivering image to session',
    );

    this.sessionManager.sendInput(sessionId, deliveryMessage);
    this.repo.markUploadedImageSent(imageId);

    return { delivered: true, imageId, deliveredPath: image.storedPath };
  }

  /**
   * Deliver a screenshot path reference to the active session via PTY stdin.
   */
  deliverScreenshot(
    sessionId: string,
    screenshotPath: string,
    message?: string,
  ): void {
    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId} (status: ${session.status})`);
    }

    const deliveryMessage = `[Screenshot] Path: ${screenshotPath}. ${message || 'Please review this screenshot.'}\n`;

    logger.info(
      { sessionId, screenshotPath },
      'delivering screenshot to session',
    );

    this.sessionManager.sendInput(sessionId, deliveryMessage);
  }

  // ─── Recording Management & Delivery ───

  /**
   * Save recording events and optional thumbnail to disk within the session's working directory.
   */
  saveRecordingEvents(
    sessionId: string,
    events: unknown[],
    pageUrl?: string,
    viewportWidth?: number,
    viewportHeight?: number,
    thumbnailDataUrl?: string,
  ): { id: string; eventsPath: string; thumbnailPath: string | null } {
    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const dir = path.join(session.workingDirectory, '.c3-uploads', 'recordings');
    fs.mkdirSync(dir, { recursive: true });

    const id = uuid();

    // Write events JSON
    const eventsPath = path.join(dir, `${id}-events.json`);
    fs.writeFileSync(eventsPath, JSON.stringify(events));

    // Write thumbnail if provided
    let thumbnailPath: string | null = null;
    if (thumbnailDataUrl) {
      thumbnailPath = path.join(dir, `${id}-thumb.png`);
      const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(thumbnailPath, buffer);
    }

    logger.info(
      {
        sessionId,
        id,
        eventsPath,
        thumbnailPath,
        eventCount: events.length,
        pageUrl: pageUrl || null,
        viewportWidth: viewportWidth || null,
        viewportHeight: viewportHeight || null,
      },
      'saved recording events',
    );

    return { id, eventsPath, thumbnailPath };
  }

  /**
   * Deliver a video recording reference to the active session via PTY stdin.
   */
  deliverRecording(
    sessionId: string,
    recordingId: string,
  ): { delivered: boolean; recordingId: string } {
    const recording = this.repo.getVideoRecording(recordingId);
    if (!recording) {
      throw new Error(`Video recording not found: ${recordingId}`);
    }

    const session = this.repo.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${sessionId} (status: ${session.status})`);
    }

    const durationStr = recording.durationMs != null
      ? `${(recording.durationMs / 1000).toFixed(1)}s`
      : 'unknown';
    const eventCountStr = recording.eventCount != null
      ? String(recording.eventCount)
      : 'unknown';
    const pageUrlStr = recording.pageUrl || 'unknown';

    const message = `[Video Recording] Duration: ${durationStr}, Events: ${eventCountStr}, Page: ${pageUrlStr}, Path: ${recording.eventsPath}. Review the recording for visual feedback.\n`;

    logger.info(
      { sessionId, recordingId, durationMs: recording.durationMs },
      'delivering recording to session',
    );

    this.sessionManager.sendInput(sessionId, message);

    return { delivered: true, recordingId };
  }
}
