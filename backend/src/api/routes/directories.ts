import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../../services/logger.js';

export function createDirectoriesRouter(): Router {
  const router = Router();

  // GET /api/directories?path=&query= — list/autocomplete directories
  router.get('/', (req, res) => {
    const basePath = String(req.query.path || os.homedir());
    const query = String(req.query.query || '');

    // Reject path traversal
    if (basePath.includes('..') || basePath.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    // If query is provided, it's the partial name being typed (last segment)
    // basePath is the parent directory to search in
    let searchDir: string;
    let prefix: string;

    if (query) {
      // User is typing a path like "/home/ubuntu/pro" —
      // searchDir = /home/ubuntu, prefix = "pro"
      searchDir = basePath;
      prefix = query.toLowerCase();
    } else {
      searchDir = basePath;
      prefix = '';
    }

    // Resolve the directory
    const resolved = path.resolve(searchDir);

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        res.json({ path: resolved, entries: [], exists: false });
        return;
      }
    } catch {
      // Directory doesn't exist — return empty with exists: false
      res.json({ path: resolved, entries: [], exists: false });
      return;
    }

    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const directories = entries
        .filter((e) => {
          if (!e.isDirectory()) return false;
          // Skip hidden dirs and common non-project dirs
          if (e.name.startsWith('.') && e.name !== '.config') return false;
          if (e.name === 'node_modules') return false;
          // Apply prefix filter
          if (prefix && !e.name.toLowerCase().startsWith(prefix)) return false;
          return true;
        })
        .map((e) => ({
          name: e.name,
          path: path.join(resolved, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20); // Limit results

      res.json({ path: resolved, entries: directories, exists: true });
    } catch (err) {
      logger.error({ err, resolved }, 'failed to list directories');
      res.status(500).json({ error: 'Unable to list directories' });
    }
  });

  // POST /api/directories — create a new directory
  router.post('/', (req, res) => {
    const { path: dirPath } = req.body;

    if (!dirPath || typeof dirPath !== 'string') {
      res.status(400).json({ error: 'path is required' });
      return;
    }

    if (dirPath.includes('..') || dirPath.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const resolved = path.resolve(dirPath);

    try {
      if (fs.existsSync(resolved)) {
        res.json({ path: resolved, created: false, exists: true });
        return;
      }
      fs.mkdirSync(resolved, { recursive: true });
      logger.info({ path: resolved }, 'directory created');
      res.status(201).json({ path: resolved, created: true, exists: true });
    } catch (err) {
      logger.error({ err, resolved }, 'failed to create directory');
      res.status(500).json({ error: 'Unable to create directory' });
    }
  });

  return router;
}
