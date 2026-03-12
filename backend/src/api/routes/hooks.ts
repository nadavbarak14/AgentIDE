import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import { logger } from '../../services/logger.js';

export function createHooksRouter(
  repo: Repository,
  isRemote = false,
  onNeedsInputChanged?: (sessionId: string, needsInput: boolean, waitReason: string | null) => void,
): Router {
  const router = Router();

  // POST /api/hooks/event — receive hook callbacks from spawned Claude processes
  // When server binds to non-localhost, restrict to localhost-only callers
  router.post('/event', (req, res) => {
    if (isRemote) {
      const ip = req.ip || req.socket.remoteAddress || '';
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
      if (!isLocal) {
        res.status(403).json({ error: 'Hooks endpoint is restricted to localhost' });
        return;
      }
    }
    const { event, c3SessionId, claudeSessionId, cwd, notificationType, message } = req.body;

    logger.info(
      { event, c3SessionId, claudeSessionId, cwd, notificationType, message },
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
    } else if (event === 'Notification') {
      // Claude is showing a notification — check if it's a permission or question prompt
      if (session.status === 'active') {
        if (notificationType === 'permission_prompt') {
          logger.info({ c3SessionId, notificationType, message }, 'permission prompt — marking needs_input');
          repo.setNeedsInput(c3SessionId, true, 'permission');
          onNeedsInputChanged?.(c3SessionId, true, 'permission');
        } else if (notificationType === 'elicitation_dialog') {
          logger.info({ c3SessionId, notificationType, message }, 'elicitation dialog — marking needs_input');
          repo.setNeedsInput(c3SessionId, true, 'question');
          onNeedsInputChanged?.(c3SessionId, true, 'question');
        }
        // Other notification types (auth_success, idle_prompt, etc.) are ignored
      }
    } else if (event === 'Stop') {
      // Claude finished responding — session is now waiting for user input
      if (session.status === 'active') {
        logger.info({ c3SessionId, waitReason: 'stopped' }, 'claude stopped responding — marking needs_input');
        repo.setNeedsInput(c3SessionId, true, 'stopped');
        onNeedsInputChanged?.(c3SessionId, true, 'stopped');
      }
    }

    res.json({ ok: true });
  });

  return router;
}
