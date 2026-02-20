import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import { validateUuid } from '../middleware.js';
import { checkGhStatus, listIssues, getIssueDetail } from '../../worker/github-cli.js';
import { logger } from '../../services/logger.js';

export function createGitHubRouter(repo: Repository): Router {
  const router = Router();

  // GET /api/sessions/:id/github/status — check gh CLI installation, auth, and repo detection
  router.get('/:id/github/status', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const status = checkGhStatus(session.workingDirectory);
      res.json(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, err }, 'failed to check gh status');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/sessions/:id/github/issues — list issues for the repo
  router.get('/:id/github/issues', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const rawAssignee = req.query.assignee as string | undefined;
    // Strip leading @ and reject bare "@" or empty strings
    const assignee = rawAssignee?.replace(/^@/, '').trim() || undefined;
    const state = req.query.state as string | undefined;
    const search = req.query.search as string | undefined;
    const limitStr = req.query.limit as string | undefined;
    const labelsStr = req.query.labels as string | undefined;

    // Validate state if provided
    if (state && !['open', 'closed', 'all'].includes(state)) {
      res.status(400).json({ error: 'Invalid state filter. Must be open, closed, or all' });
      return;
    }

    // Parse limit
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : undefined;

    // Parse labels (comma-separated)
    const labels = labelsStr ? labelsStr.split(',').map((l) => l.trim()).filter(Boolean) : undefined;

    try {
      const result = listIssues(session.workingDirectory, {
        assignee,
        state,
        limit,
        labels,
        search,
      });

      if (result.error) {
        logger.warn({ sessionId, error: result.error }, 'gh issue list returned error');
      }

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, err }, 'failed to list issues');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/sessions/:id/github/issues/:number — get issue detail
  router.get('/:id/github/issues/:number', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const issueNumber = parseInt(req.params.number as string, 10);
    if (isNaN(issueNumber) || issueNumber < 1) {
      res.status(400).json({ error: 'Invalid issue number' });
      return;
    }

    try {
      const result = getIssueDetail(session.workingDirectory, issueNumber);

      if (result.error) {
        logger.warn({ sessionId, issueNumber, error: result.error }, 'gh issue view returned error');
        // If the issue just wasn't found, return 404; otherwise return the error inline
        if (result.error.includes('not found') || result.error.includes('Could not resolve')) {
          res.status(404).json({ error: result.error });
          return;
        }
      }

      if (!result.issue) {
        res.status(404).json({ error: result.error || 'Issue not found' });
        return;
      }

      res.json(result.issue);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, issueNumber, err }, 'failed to get issue detail');
      res.status(500).json({ error: message });
    }
  });

  return router;
}
