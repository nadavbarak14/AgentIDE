import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import { logger } from '../../services/logger.js';

export function createHooksRouter(repo: Repository): Router {
  const router = Router();

  // POST /api/hooks/event — receive hook callbacks from spawned Claude processes
  router.post('/event', (req, res) => {
    const { event, c3SessionId, claudeSessionId, cwd } = req.body;

    logger.info(
      { event, c3SessionId, claudeSessionId, cwd },
      'hook event received',
    );

    if (!c3SessionId || !event) {
      res.status(400).json({ error: 'Missing c3SessionId or event' });
      return;
    }

    const session = repo.getSession(c3SessionId);
    if (!session) {
      logger.warn({ c3SessionId }, 'hook event for unknown session');
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (event === 'SessionEnd') {
      // Store the Claude session ID so we can use `claude -c` later
      if (claudeSessionId) {
        logger.info(
          { c3SessionId, claudeSessionId },
          'storing claude session ID from SessionEnd hook',
        );
        repo.setClaudeSessionId(c3SessionId, claudeSessionId);
      }
    } else if (event === 'Stop') {
      // Claude finished responding — session is now waiting for user input
      if (session.status === 'active') {
        logger.info({ c3SessionId }, 'claude stopped responding — marking needs_input');
        repo.setNeedsInput(c3SessionId, true);
      }
    }

    res.json({ ok: true });
  });

  return router;
}
