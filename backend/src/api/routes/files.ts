import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import { validateUuid, sanitizePath } from '../middleware.js';
import { listDirectory, readFile, writeFile } from '../../worker/file-reader.js';
import { getDiff } from '../../worker/git-operations.js';

export function createFilesRouter(repo: Repository): Router {
  const router = Router();

  // GET /api/sessions/:id/files — list directory contents (file tree)
  router.get('/:id/files', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const subpath = req.query.path as string | undefined;
    if (subpath) {
      const sanitized = sanitizePath(subpath);
      if (!sanitized) {
        res.status(400).json({ error: 'Invalid path: directory traversal is not allowed' });
        return;
      }
    }

    try {
      const entries = listDirectory(session.workingDirectory, subpath || undefined);
      res.json({ entries, path: subpath || '.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('traversal')) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // GET /api/sessions/:id/files/content — read file content
  router.get('/:id/files/content', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ error: 'Missing required query parameter: path' });
      return;
    }

    const sanitized = sanitizePath(filePath);
    if (!sanitized) {
      res.status(400).json({ error: 'Invalid path: directory traversal is not allowed' });
      return;
    }

    try {
      const file = readFile(session.workingDirectory, sanitized);
      res.json(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('traversal')) {
        res.status(400).json({ error: message });
      } else if (message.includes('too large')) {
        res.status(413).json({ error: message });
      } else if (message.includes('not a file')) {
        res.status(400).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // PUT /api/sessions/:id/files/content — save file content
  router.put('/:id/files/content', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { path: filePath, content } = req.body as { path?: string; content?: string };
    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'Missing required fields: path and content' });
      return;
    }

    const sanitized = sanitizePath(filePath);
    if (!sanitized) {
      res.status(400).json({ error: 'Invalid path: directory traversal is not allowed' });
      return;
    }

    try {
      writeFile(session.workingDirectory, sanitized, content);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('traversal')) {
        res.status(400).json({ error: message });
      } else if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // GET /api/sessions/:id/diff — get git diff for session working directory
  router.get('/:id/diff', validateUuid('id'), (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      const result = getDiff(session.workingDirectory);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
