import { Router } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { sanitizePath } from '../middleware.js';
import { listDirectory, readFile, writeFile, searchFiles } from '../../worker/file-reader.js';
import { getDiff } from '../../worker/git-operations.js';
import { logger } from '../../services/logger.js';
import {
  decompressBuffer,
  cleanSetCookieHeaders,
  rewriteHtmlForProxy,
  rewriteCssForProxy,
  injectBridgeScript,
  MIME_TYPES,
} from '../proxy-utils.js';
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

  // ── Preview proxy (US1) ──
  router.all('/sessions/:id/proxy/:port/*', (req, res) => {
    const session = sessionRegistry.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not registered with agent' });
      return;
    }

    const targetPort = parseInt(req.params.port as string, 10);
    if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      res.status(400).json({ error: 'Invalid port number' });
      return;
    }

    const targetPath = '/' + ((req.params as unknown as Record<string, string>)[0] || '');
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const proxyBase = `/api/sessions/${req.params.id}/proxy/${targetPort}`;

    const forwardHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['connection'];
    delete forwardHeaders['upgrade'];
    delete forwardHeaders['accept-encoding'];
    delete forwardHeaders['transfer-encoding']; // Prevent Content-Length + Transfer-Encoding conflict
    forwardHeaders['host'] = `localhost:${targetPort}`;

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath + queryString,
        method: req.method,
        headers: forwardHeaders as http.OutgoingHttpHeaders,
      },
      (proxyRes) => {
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');

        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
        const cleanedCookies = cleanSetCookieHeaders(proxyRes.headers['set-cookie']);
        if (cleanedCookies.length > 0) {
          responseHeaders['set-cookie'] = cleanedCookies;
        }
        responseHeaders['access-control-allow-origin'] = '*';

        if (responseHeaders['location']) {
          const loc = responseHeaders['location'] as string;
          if (loc.startsWith('/')) {
            responseHeaders['location'] = proxyBase + loc;
          } else if (loc.startsWith('http://localhost:') || loc.startsWith('http://127.0.0.1:')) {
            try {
              const locUrl = new URL(loc);
              responseHeaders['location'] = proxyBase + locUrl.pathname + locUrl.search + locUrl.hash;
            } catch { /* leave as-is */ }
          }
        }

        if (responseHeaders['link']) {
          const linkVal = responseHeaders['link'] as string;
          responseHeaders['link'] = linkVal.replace(/<\//g, `<${proxyBase}/`);
        }

        const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
        const isNavigationRequest = req.method === 'GET' && !req.headers['rsc'] && !req.headers['next-action'] &&
          req.headers['accept']?.includes('text/html') && !req.headers['x-requested-with'];
        const shouldRewriteHtml = contentType.includes('text/html') && isNavigationRequest;
        const isJavaScript = contentType.includes('javascript');
        const isCss = contentType.includes('text/css');
        const shouldBuffer = shouldRewriteHtml || isJavaScript || isCss;

        if (shouldBuffer) {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            try {
              let raw: Buffer = Buffer.concat(chunks);
              const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
              if (encoding) {
                raw = decompressBuffer(raw, encoding) as Buffer;
                delete responseHeaders['content-encoding'];
              }
              let body = raw.toString('utf-8');
              if (shouldRewriteHtml) {
                body = rewriteHtmlForProxy(body, proxyBase);
              } else if (isJavaScript) {
                body = body.replaceAll('CHUNK_BASE_PATH = "/_next/"', `CHUNK_BASE_PATH = "${proxyBase}/_next/"`);
                body = body.replaceAll('RUNTIME_PUBLIC_PATH = "/_next/"', `RUNTIME_PUBLIC_PATH = "${proxyBase}/_next/"`);
              } else if (isCss) {
                body = rewriteCssForProxy(body, proxyBase);
              }
              delete responseHeaders['content-length'];
              responseHeaders['content-length'] = String(Buffer.byteLength(body));
              res.writeHead(proxyRes.statusCode || 200, responseHeaders);
              res.end(body);
            } catch (err) {
              logger.warn({ error: (err as Error).message }, 'Failed to process proxied response');
              const raw = Buffer.concat(chunks);
              delete responseHeaders['content-length'];
              responseHeaders['content-length'] = String(raw.length);
              res.writeHead(proxyRes.statusCode || 200, responseHeaders);
              res.end(raw);
            }
          });
        } else {
          // Prevent Content-Length + Transfer-Encoding conflict (Node HTTP parser rejects it)
          if (responseHeaders['transfer-encoding'] && responseHeaders['content-length']) {
            delete responseHeaders['content-length'];
          }
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          proxyRes.pipe(res);
        }
      },
    );

    proxyReq.on('error', (err) => {
      logger.warn({ port: targetPort, error: err.message }, 'agent proxy connection failed');
      if (!res.headersSent) {
        res.status(502).send(`Cannot connect to localhost:${targetPort} — is the dev server running?`);
      }
    });

    req.pipe(proxyReq);
  });

  // Handle root proxy path (no trailing path) — redirect to trailing slash
  router.all('/sessions/:id/proxy/:port', (req, res) => {
    res.redirect(301, req.originalUrl + '/');
  });

  return router;
}
