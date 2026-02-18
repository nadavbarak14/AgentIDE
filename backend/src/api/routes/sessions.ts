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

  return router;
}
