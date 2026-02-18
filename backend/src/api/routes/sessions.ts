import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Repository } from '../../models/repository.js';
import type { SessionManager } from '../../services/session-manager.js';
import type { SessionStatus } from '../../models/types.js';
import { validateUuid, validateBody } from '../middleware.js';
import { logger } from '../../services/logger.js';

export function createSessionsRouter(repo: Repository, sessionManager: SessionManager): Router {
  const router = Router();

  // GET /api/sessions — list all sessions
  router.get('/', (req, res) => {
    const status = req.query.status as SessionStatus | undefined;
    if (status && !['queued', 'active', 'completed', 'failed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status filter' });
      return;
    }
    const sessions = repo.listSessions(status);
    res.json(sessions);
  });

  // POST /api/sessions — create a new session (or auto-continue if existing session in same dir)
  router.post('/', validateBody(['workingDirectory', 'title']), (req, res) => {
    const { workingDirectory, title, targetWorker, startFresh } = req.body;
    if (typeof workingDirectory !== 'string' || typeof title !== 'string') {
      res.status(400).json({ error: 'workingDirectory and title must be strings' });
      return;
    }

    // Auto-create directory if it doesn't exist (FR-027)
    const resolvedDir = path.resolve(workingDirectory);
    if (!fs.existsSync(resolvedDir)) {
      try {
        fs.mkdirSync(resolvedDir, { recursive: true });
      } catch {
        res.status(400).json({ error: `Cannot create directory: ${resolvedDir}` });
        return;
      }
    }

    // FR-028: Auto-continue latest session in same directory (unless startFresh=true)
    if (!startFresh) {
      const existing = repo.findLatestContinuableSession(resolvedDir);
      if (existing) {
        logger.info(
          { dir: resolvedDir, existingId: existing.id, claudeSessionId: existing.claudeSessionId },
          'found continuable session in directory — auto-continuing',
        );
        try {
          const result = sessionManager.continueSession(existing.id);
          const continued = repo.getSession(existing.id)!;
          const statusCode = result.status === 'active' ? 200 : 202;
          res.status(statusCode).json({ ...continued, continued: true });
          return;
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : err, existingId: existing.id },
            'auto-continue failed, falling through to create new session',
          );
        }
      } else {
        logger.info({ dir: resolvedDir }, 'no continuable session found in directory — creating new');
      }
    } else {
      logger.info({ dir: resolvedDir }, 'startFresh=true — creating new session');
    }

    const session = sessionManager.createSession({
      workingDirectory: resolvedDir,
      title,
      targetWorker: targetWorker || null,
    });
    logger.info({ sessionId: session.id, status: session.status }, 'new session created');
    res.status(201).json(session);
  });

  // PATCH /api/sessions/:id — update session (reorder, title, lock)
  router.patch('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const updated = repo.updateSession(id, req.body);
    res.json(updated);
  });

  // DELETE /api/sessions/:id — remove a session
  router.delete('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status === 'active') {
      res.status(409).json({ error: 'Cannot delete an active session. Kill it first.' });
      return;
    }
    repo.deleteSession(id);
    res.status(204).send();
  });

  // POST /api/sessions/:id/continue — continue a completed session
  router.post('/:id/continue', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    try {
      const result = sessionManager.continueSession(id);
      const statusCode = result.status === 'active' ? 200 : 202;
      res.status(statusCode).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('already active')) {
        res.status(409).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(400).json({ error: message });
      }
    }
  });

  // POST /api/sessions/:id/kill — kill an active session
  router.post('/:id/kill', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'active') {
      res.status(409).json({ error: 'Session is not active' });
      return;
    }
    sessionManager.killSession(id);
    res.json({ ok: true });
  });

  // GET /api/sessions/:id/panel-state — retrieve panel state
  router.get('/:id/panel-state', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const state = repo.getPanelState(id);
    if (!state) {
      res.status(404).json({ error: 'No panel state found for session' });
      return;
    }
    res.json(state);
  });

  // PUT /api/sessions/:id/panel-state — save/update panel state
  router.put('/:id/panel-state', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { activePanel, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, panelWidthPercent } = req.body;

    // Validate activePanel
    const validPanels = ['none', 'files', 'git', 'preview'];
    if (!activePanel || !validPanels.includes(activePanel)) {
      res.status(400).json({ error: 'Invalid activePanel value. Must be one of: none, files, git, preview' });
      return;
    }

    // Validate fileTabs
    if (!Array.isArray(fileTabs)) {
      res.status(400).json({ error: 'fileTabs must be an array' });
      return;
    }

    // Validate activeTabIndex
    if (typeof activeTabIndex !== 'number' || activeTabIndex < 0) {
      res.status(400).json({ error: 'activeTabIndex must be a non-negative integer' });
      return;
    }

    // Validate tabScrollPositions
    if (typeof tabScrollPositions !== 'object' || tabScrollPositions === null || Array.isArray(tabScrollPositions)) {
      res.status(400).json({ error: 'tabScrollPositions must be an object' });
      return;
    }

    // Validate gitScrollPosition
    if (typeof gitScrollPosition !== 'number' || gitScrollPosition < 0) {
      res.status(400).json({ error: 'gitScrollPosition must be a non-negative integer' });
      return;
    }

    // Validate previewUrl
    if (typeof previewUrl !== 'string') {
      res.status(400).json({ error: 'previewUrl must be a string' });
      return;
    }

    // Validate panelWidthPercent
    if (typeof panelWidthPercent !== 'number' || panelWidthPercent < 20 || panelWidthPercent > 80) {
      res.status(400).json({ error: 'panelWidthPercent must be an integer between 20 and 80' });
      return;
    }

    repo.savePanelState(id, {
      activePanel,
      fileTabs,
      activeTabIndex,
      tabScrollPositions,
      gitScrollPosition,
      previewUrl,
      panelWidthPercent,
    });

    res.json({ success: true });
  });

  // POST /api/sessions/:id/input — send input to an active session
  router.post('/:id/input', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'active') {
      res.status(409).json({ error: 'Session is not active' });
      return;
    }
    const { text } = req.body;
    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text must be a string' });
      return;
    }
    sessionManager.sendInput(id, text);
    res.json({ ok: true });
  });

  // GET /api/sessions/:id/comments — list comments
  router.get('/:id/comments', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const status = req.query.status as string | undefined;
    if (status && !['pending', 'sent'].includes(status)) {
      res.status(400).json({ error: 'Invalid status filter. Must be pending or sent' });
      return;
    }

    const comments = status
      ? repo.getCommentsByStatus(id, status as 'pending' | 'sent')
      : repo.getComments(id);
    res.json({ comments });
  });

  // POST /api/sessions/:id/comments — create a comment
  router.post('/:id/comments', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { filePath, startLine, endLine, codeSnippet, commentText } = req.body;

    // Validate filePath
    if (typeof filePath !== 'string' || !filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }
    if (filePath.includes('..') || filePath.includes('\0')) {
      res.status(400).json({ error: 'filePath must not contain path traversal characters' });
      return;
    }

    // Validate line numbers
    if (typeof startLine !== 'number' || startLine < 1) {
      res.status(400).json({ error: 'startLine must be an integer >= 1' });
      return;
    }
    if (typeof endLine !== 'number' || endLine < startLine) {
      res.status(400).json({ error: 'endLine must be >= startLine' });
      return;
    }

    // Validate text fields
    if (typeof codeSnippet !== 'string' || !codeSnippet) {
      res.status(400).json({ error: 'codeSnippet is required' });
      return;
    }
    if (typeof commentText !== 'string' || !commentText) {
      res.status(400).json({ error: 'commentText is required' });
      return;
    }

    const comment = repo.createComment({ sessionId: id, filePath, startLine, endLine, codeSnippet, commentText });
    logger.info({ sessionId: id, commentId: comment.id, filePath, startLine, endLine }, 'comment created');

    // If session is active, inject comment into PTY
    if (session.status === 'active') {
      const message = composeCommentMessage(filePath, startLine, endLine, codeSnippet, commentText);
      try {
        sessionManager.sendInput(id, message);
        repo.markCommentSent(comment.id);
        comment.status = 'sent';
        comment.sentAt = new Date().toISOString();
        logger.info({ sessionId: id, commentId: comment.id }, 'comment delivered to active session');
      } catch (err) {
        logger.error({ sessionId: id, commentId: comment.id, err }, 'failed to deliver comment');
      }
    }

    res.status(201).json(comment);
  });

  // POST /api/sessions/:id/comments/deliver — deliver pending comments
  router.post('/:id/comments/deliver', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const pending = repo.getCommentsByStatus(id, 'pending');
    const delivered: string[] = [];

    for (const comment of pending) {
      const message = composeCommentMessage(comment.filePath, comment.startLine, comment.endLine, comment.codeSnippet, comment.commentText);
      try {
        sessionManager.sendInput(id, message);
        repo.markCommentSent(comment.id);
        delivered.push(comment.id);
        logger.info({ sessionId: id, commentId: comment.id }, 'pending comment delivered');
      } catch (err) {
        logger.error({ sessionId: id, commentId: comment.id, err }, 'failed to deliver pending comment');
      }
    }

    res.json({ delivered, count: delivered.length });
  });

  return router;
}

/**
 * Compose a contextual comment message for injection into the session PTY.
 * Format follows research.md R2 — structured message with file context.
 */
function composeCommentMessage(
  filePath: string,
  startLine: number,
  endLine: number,
  codeSnippet: string,
  commentText: string,
): string {
  const lineRange = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  return `\n[Code Review Comment]\nFile: ${filePath} (${lineRange})\nCode:\n${codeSnippet}\n\nFeedback: ${commentText}\n\nPlease address this feedback.\n`;
}
