import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { sanitizePath } from '../middleware.js';
import { listDirectory, readFile, writeFile, searchFiles } from '../../worker/file-reader.js';
import { getDiff } from '../../worker/git-operations.js';
import { logger } from '../../services/logger.js';
const BRIDGE_VERSION = '7';
const BRIDGE_SCRIPT_TAG = `<script data-c3-bridge>(function(){var f=window.__c3NativeFetch||window.fetch;f.call(window,location.origin+'/api/inspect-bridge.js?v=${BRIDGE_VERSION}').then(function(r){return r.text()}).then(function(t){var s=document.createElement('script');s.textContent=t;document.head.appendChild(s)}).catch(function(){})})()</script>`;

function injectBridgeScript(html: string): string {
  if (html.includes('</head>')) return html.replace('</head>', BRIDGE_SCRIPT_TAG + '</head>');
  if (html.includes('</body>')) return html.replace('</body>', BRIDGE_SCRIPT_TAG + '</body>');
  return html + BRIDGE_SCRIPT_TAG;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.xml': 'application/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain',
  '.ts': 'text/plain', '.tsx': 'text/plain', '.jsx': 'text/plain',
};
import type { FileWatcher } from '../../worker/file-watcher.js';

/** In-memory registry of sessions → workingDirectory */
const sessionRegistry = new Map<string, { workingDirectory: string; pid?: number }>();

export function getSessionRegistry(): Map<string, { workingDirectory: string; pid?: number }> {
  return sessionRegistry;
}

export function createAgentFilesRouter(fileWatcher: FileWatcher): Router {
  const router = Router();

  // ── Health check ──
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', agent: true, sessions: sessionRegistry.size });
  });

  // ── Session registration ──
  router.post('/sessions/:id/register', (req, res) => {
    const sessionId = req.params.id;
    const { workingDirectory, pid } = req.body;

    if (!workingDirectory || typeof workingDirectory !== 'string') {
      res.status(400).json({ error: 'Missing required field: workingDirectory' });
      return;
    }

    sessionRegistry.set(sessionId, { workingDirectory, pid });

    // Start file watching and port scanning for this session
    fileWatcher.startWatching(sessionId, workingDirectory, pid || undefined);

    logger.info({ sessionId, workingDirectory, pid }, 'session registered with agent');
    res.json({ watching: true });
  });

  router.delete('/sessions/:id/register', (req, res) => {
    const sessionId = req.params.id;
    sessionRegistry.delete(sessionId);
    fileWatcher.stopWatching(sessionId);
    logger.info({ sessionId }, 'session unregistered from agent');
    res.json({ stopped: true });
  });

  // ── File listing (US3) ──
  router.get('/sessions/:id/files', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
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

  // ── File read (US3) ──
  router.get('/sessions/:id/files/content', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
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

  // ── File write (US3) ──
  router.put('/sessions/:id/files/content', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
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

  // ── Search (US3) ──
  router.get('/sessions/:id/search', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
      return;
    }

    const query = req.query.q as string | undefined;
    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    try {
      const result = searchFiles(session.workingDirectory, query.trim(), limit, offset);
      res.json({ query: query.trim(), ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  // ── Git diff (US4) ──
  router.get('/sessions/:id/diff', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
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

  // ── Serve static files (US1, US2) ──
  router.get('/sessions/:id/serve/*', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
      return;
    }

    const rawPath = (req.params as unknown as Record<string, string>)[0] || 'index.html';
    const sanitized = sanitizePath(rawPath);
    if (!sanitized) {
      res.status(400).send('Invalid path');
      return;
    }

    const fullPath = path.resolve(session.workingDirectory, sanitized);
    if (!fullPath.startsWith(path.resolve(session.workingDirectory))) {
      res.status(400).send('Invalid path');
      return;
    }

    let servePath = fullPath;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const indexPath = path.join(fullPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          servePath = indexPath;
        } else {
          res.status(404).send('No index.html found in directory');
          return;
        }
      }
    } catch {
      res.status(404).send('File not found');
      return;
    }

    const ext = path.extname(servePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (ext === '.html' || ext === '.htm') {
      try {
        const html = fs.readFileSync(servePath, 'utf-8');
        const modified = injectBridgeScript(html);
        res.setHeader('Content-Length', Buffer.byteLength(modified));
        res.send(modified);
      } catch {
        res.status(500).send('Failed to read file');
      }
    } else {
      res.sendFile(servePath);
    }
  });

  // ── Screenshot save (remote) ──
  router.post('/sessions/:id/screenshots', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
      return;
    }

    const { dataUrl, pageUrl } = req.body as { dataUrl?: string; pageUrl?: string };
    if (typeof dataUrl !== 'string' || !dataUrl) {
      res.status(400).json({ error: 'dataUrl is required' });
      return;
    }

    try {
      const dir = path.join(session.workingDirectory, '.c3-uploads', 'screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const id = crypto.randomUUID();
      const filename = `${id}.png`;
      const storedPath = path.join(dir, filename);
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(storedPath, Buffer.from(base64Data, 'base64'));
      logger.info({ sessionId: req.params.id, storedPath }, 'screenshot saved on remote agent');
      res.status(201).json({ id, storedPath, pageUrl: pageUrl || null, createdAt: new Date().toISOString() });
    } catch (err) {
      logger.error({ sessionId: req.params.id, err: (err as Error).message }, 'failed to save screenshot on agent');
      res.status(500).json({ error: 'Failed to save screenshot' });
    }
  });

  // ── Recording save (remote) ──
  router.post('/sessions/:id/recordings', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
      return;
    }

    const { events, durationMs, pageUrl, viewportWidth, viewportHeight, thumbnailDataUrl } = req.body as Record<string, unknown>;
    if (!Array.isArray(events)) {
      res.status(400).json({ error: 'events must be an array' });
      return;
    }

    try {
      const dir = path.join(session.workingDirectory, '.c3-uploads', 'recordings');
      fs.mkdirSync(dir, { recursive: true });
      const id = crypto.randomUUID();
      const eventsPath = path.join(dir, `${id}.json`);
      fs.writeFileSync(eventsPath, JSON.stringify(events));

      let thumbnailPath: string | null = null;
      if (typeof thumbnailDataUrl === 'string' && thumbnailDataUrl) {
        thumbnailPath = path.join(dir, `${id}-thumb.png`);
        const base64 = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(thumbnailPath, Buffer.from(base64, 'base64'));
      }

      logger.info({ sessionId: req.params.id, eventsPath, eventCount: events.length }, 'recording saved on remote agent');
      res.status(201).json({
        id, videoPath: eventsPath, thumbnailPath,
        durationMs: durationMs || null, eventCount: events.length,
        pageUrl: pageUrl || null, viewportWidth: viewportWidth || null, viewportHeight: viewportHeight || null,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error({ sessionId: req.params.id, err: (err as Error).message }, 'failed to save recording on agent');
      res.status(500).json({ error: 'Failed to save recording' });
    }
  });

  return router;
}
