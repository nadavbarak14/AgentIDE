import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Repository } from '../../models/repository.js';
import type { SessionManager } from '../../services/session-manager.js';
import type { ProjectService } from '../../services/project-service.js';
import type { SessionStatus } from '../../models/types.js';
import { validateUuid, validateBody } from '../middleware.js';
import { validateDirectoryForWorker } from './directories.js';
import { logger } from '../../services/logger.js';

import type { TunnelManager } from '../../hub/tunnel.js';

export function createSessionsRouter(repo: Repository, sessionManager: SessionManager, projectService?: ProjectService, tunnelManager?: TunnelManager): Router {
  const router = Router();

  // GET /api/sessions — list all sessions
  router.get('/', (req, res) => {
    const status = req.query.status as SessionStatus | undefined;
    if (status && !['active', 'completed', 'failed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status filter' });
      return;
    }
    const sessions = repo.listSessions(status);
    res.json(sessions);
  });

  // POST /api/sessions — create a new session (or auto-continue if existing session in same dir)
  router.post('/', validateBody(['workingDirectory', 'title']), async (req, res) => {
    const { workingDirectory, title, targetWorker, worktree, startFresh } = req.body;
    if (typeof workingDirectory !== 'string' || typeof title !== 'string') {
      res.status(400).json({ error: 'workingDirectory and title must be strings' });
      return;
    }

    // Worker-aware directory validation (FR-003)
    const resolvedDir = path.resolve(workingDirectory);

    // Get worker (default to local worker if not specified)
    const effectiveWorkerId = targetWorker || repo.getLocalWorker()?.id;
    if (!effectiveWorkerId) {
      res.status(500).json({ error: 'No workers available' });
      return;
    }

    const worker = repo.getWorker(effectiveWorkerId);
    if (!worker) {
      res.status(400).json({ error: 'Invalid targetWorker: worker not found', workerId: effectiveWorkerId });
      return;
    }

    // Validate directory based on worker type
    const validation = validateDirectoryForWorker(worker, resolvedDir);
    if (!validation.valid) {
      logger.warn(
        { path: resolvedDir, workerId: worker.id, workerType: worker.type, reason: validation.reason },
        'session creation rejected: directory validation failed',
      );
      res.status(403).json({
        error:
          validation.reason === 'local_restriction'
            ? 'Directory not allowed: path must be within home directory'
            : 'Directory not allowed',
        reason: validation.reason,
        path: resolvedDir,
        workerType: worker.type,
      });
      return;
    }

    // Auto-create directory if it doesn't exist (FR-027)
    // Only check/create directories locally for local workers
    if (worker.type === 'local') {
      if (!fs.existsSync(resolvedDir)) {
        try {
          fs.mkdirSync(resolvedDir, { recursive: true });
        } catch {
          res.status(400).json({ error: `Cannot create directory: ${resolvedDir}` });
          return;
        }
      }

      // Git auto-init for worktree sessions (FR-009)
      if (worktree) {
        const gitDir = path.join(resolvedDir, '.git');
        if (!fs.existsSync(gitDir)) {
          try {
            execSync('git init', { cwd: resolvedDir, stdio: 'pipe' });
            logger.info({ dir: resolvedDir }, 'auto-initialized git repository for worktree session');
          } catch (err) {
            const stderr = err instanceof Error ? (err as Error & { stderr?: Buffer }).stderr?.toString() : '';
            logger.error({ dir: resolvedDir, err }, 'git auto-init failed');
            res.status(422).json({ error: 'Failed to initialize git repository', details: stderr });
            return;
          }
        }
      }
    }
    // For remote workers, auto-create directory on remote server if it doesn't exist
    else if (worker.type === 'remote' && tunnelManager) {
      if (!tunnelManager.isConnected(worker.id)) {
        res.status(502).json({ error: 'Worker not connected' });
        return;
      }

      try {
        // Check if directory exists on remote server
        const checkCmd = `test -d ${escapeShellArg(resolvedDir)} && echo exists || echo missing`;
        const checkResult = await tunnelManager.exec(worker.id, checkCmd);

        if (checkResult.trim() === 'missing') {
          // Create directory recursively
          logger.info({ workerId: worker.id, path: resolvedDir }, 'creating remote directory');
          await tunnelManager.exec(worker.id, `mkdir -p ${escapeShellArg(resolvedDir)}`);
          logger.info({ workerId: worker.id, path: resolvedDir }, 'remote directory created successfully');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create directory';
        logger.error({ workerId: worker.id, path: resolvedDir, err }, 'failed to create remote directory');
        res.status(500).json({ error: `Cannot create remote directory: ${message}` });
        return;
      }
    }

    // Default targetWorker to local worker if not specified
    const effectiveWorker = targetWorker || repo.getLocalWorker()?.id || null;

    const session = sessionManager.createSession({
      workingDirectory: resolvedDir,
      title,
      targetWorker: effectiveWorker,
      worktree: !!worktree,
      startFresh: !!startFresh,
    });
    logger.info({ sessionId: session.id, status: session.status }, 'new session created');

    // Auto-track project (FR-003)
    if (projectService && effectiveWorker) {
      try {
        projectService.touchProject(effectiveWorker, resolvedDir);
      } catch (err) {
        logger.warn({ err, workerId: effectiveWorker, dir: resolvedDir }, 'failed to auto-track project');
      }
    }

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
    // Clean up shell scrollback files
    sessionManager.shellSpawner?.deleteScrollback(id);
    repo.deleteSession(id);
    res.status(204).send();
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

    const { activePanel, leftPanel, rightPanel, leftWidthPercent, rightWidthPercent, fileTabs, activeTabIndex, tabScrollPositions, gitScrollPosition, previewUrl, panelWidthPercent } = req.body;

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
      leftPanel,
      rightPanel,
      leftWidthPercent,
      rightWidthPercent,
      fileTabs,
      activeTabIndex,
      tabScrollPositions,
      gitScrollPosition,
      previewUrl,
      panelWidthPercent,
    });

    res.json({ success: true });
  });

  // ─── Shell Terminal ───

  // POST /api/sessions/:id/shell — open (spawn) a shell terminal
  router.post('/:id/shell', validateUuid('id'), async (req, res) => {
    const id = String(req.params.id);
    const { cols, rows } = req.body || {};
    try {
      const info = await sessionManager.openShell(id, cols, rows);
      res.status(201).json(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('already running')) {
        res.status(409).json({ error: message });
      } else if (message.includes('not active')) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // DELETE /api/sessions/:id/shell — close (kill) the shell terminal
  router.delete('/:id/shell', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    try {
      const info = sessionManager.closeShell(id);
      res.json(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('No shell running')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // GET /api/sessions/:id/shell — get shell terminal status
  router.get('/:id/shell', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const info = sessionManager.getShellStatus(id);
    res.json(info);
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

    const { filePath, startLine, endLine, codeSnippet, commentText, side } = req.body;

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

    // Validate side (optional, defaults to 'new')
    if (side !== undefined && side !== 'old' && side !== 'new') {
      res.status(400).json({ error: "side must be 'old' or 'new'" });
      return;
    }

    const comment = repo.createComment({ sessionId: id, filePath, startLine, endLine, codeSnippet, commentText, side });
    logger.info({ sessionId: id, commentId: comment.id, filePath, startLine, endLine }, 'comment created (pending)');

    // Comments are always created as 'pending'.
    // Use POST .../comments/deliver to send all pending comments at once.
    res.status(201).json(comment);
  });

  // PUT /api/sessions/:id/comments/:commentId — update a pending comment
  router.put('/:id/comments/:commentId', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { commentText } = req.body;
    if (typeof commentText !== 'string' || !commentText.trim()) {
      res.status(400).json({ error: 'commentText is required and must be a non-empty string' });
      return;
    }

    // Verify comment belongs to this session
    const comments = repo.getComments(id);
    const comment = comments.find((c) => c.id === commentId);
    if (!comment || comment.status !== 'pending') {
      res.status(404).json({ error: 'Comment not found or not pending' });
      return;
    }

    const updated = repo.updateComment(commentId, commentText.trim());
    if (!updated) {
      res.status(404).json({ error: 'Comment not found or not pending' });
      return;
    }

    logger.info({ sessionId: id, commentId }, 'comment updated');
    res.json(updated);
  });

  // DELETE /api/sessions/:id/comments/:commentId — delete a pending comment
  router.delete('/:id/comments/:commentId', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Verify comment belongs to this session
    const comments = repo.getComments(id);
    const comment = comments.find((c) => c.id === commentId);
    if (!comment || comment.status !== 'pending') {
      res.status(404).json({ error: 'Comment not found or not pending' });
      return;
    }

    const deleted = repo.deleteComment(commentId);
    if (!deleted) {
      res.status(404).json({ error: 'Comment not found or not pending' });
      return;
    }

    logger.info({ sessionId: id, commentId }, 'comment deleted');
    res.json({ success: true });
  });

  // POST /api/sessions/:id/comments/:commentId/deliver — deliver a single comment immediately
  router.post('/:id/comments/:commentId/deliver', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'active') {
      res.status(400).json({ error: 'Session is not active — comment remains pending' });
      return;
    }

    const comments = repo.getComments(id);
    const comment = comments.find((c) => c.id === commentId);
    if (!comment || comment.status !== 'pending') {
      res.status(404).json({ error: 'Comment not found or not pending' });
      return;
    }

    const message = composeBatchMessage([comment]);
    try {
      sessionManager.sendInput(id, message);
      repo.deleteCommentsByIds([commentId]);
      logger.info({ sessionId: id, commentId }, 'single comment delivered and deleted');
      res.json({ delivered: [commentId], count: 1 });
    } catch (err) {
      logger.error({ sessionId: id, commentId, err }, 'failed to deliver single comment');
      res.status(500).json({ error: 'Failed to deliver comment to session' });
    }
  });

  // POST /api/sessions/:id/comments/deliver — deliver pending comments as a single batch
  router.post('/:id/comments/deliver', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const session = repo.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'active') {
      res.status(400).json({ error: 'Session is not active — comments remain pending' });
      return;
    }

    const pending = repo.getCommentsByStatus(id, 'pending');
    if (pending.length === 0) {
      res.json({ delivered: [], count: 0 });
      return;
    }

    // Compose one single-line message for all comments and send as one PTY input
    const batchMessage = composeBatchMessage(pending);
    try {
      sessionManager.sendInput(id, batchMessage);
      const deliveredIds = pending.map((c) => c.id);
      repo.deleteCommentsByIds(deliveredIds);
      logger.info({ sessionId: id, count: deliveredIds.length }, 'batch comments delivered and deleted');
      res.json({ delivered: deliveredIds, count: deliveredIds.length });
    } catch (err) {
      logger.error({ sessionId: id, err }, 'failed to deliver batch comments');
      res.status(500).json({ error: 'Failed to deliver comments to session' });
    }
  });

  return router;
}

/**
 * Compose a single-line comment for one review item.
 * No trailing newline — callers batch these and add a final \n to submit.
 */
function composeSingleComment(
  filePath: string,
  startLine: number,
  endLine: number,
  codeSnippet: string,
  commentText: string,
  side?: string,
): string {
  const lineRange = startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  const snippet = codeSnippet.replace(/\n/g, ' ').slice(0, 200);
  const sideLabel = side === 'old' ? ' [old/removed code]' : ' [new/added code]';
  return `File: ${filePath} (${lineRange}${sideLabel}), Code: \`${snippet}\`, Feedback: ${commentText}`;
}

/**
 * Compose a batch message for delivering comments to the PTY.
 * Returns a single line ending with \n so the whole thing is submitted as one input.
 */
function composeBatchMessage(comments: Array<{ filePath: string; startLine: number; endLine: number; codeSnippet: string; commentText: string; side?: string }>): string {
  if (comments.length === 1) {
    const c = comments[0];
    return `[Code Review] ${composeSingleComment(c.filePath, c.startLine, c.endLine, c.codeSnippet, c.commentText, c.side)}. Please address this feedback.\n`;
  }
  const items = comments.map((c, i) =>
    `(${i + 1}) ${composeSingleComment(c.filePath, c.startLine, c.endLine, c.codeSnippet, c.commentText, c.side)}`
  ).join(' ');
  return `[Code Review — ${comments.length} comments] ${items}. Please address all comments.\n`;
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
