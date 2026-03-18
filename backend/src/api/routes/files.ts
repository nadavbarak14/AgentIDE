import { Router } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import type { Repository } from '../../models/repository.js';
import type { AgentTunnelManager } from '../../hub/agent-tunnel.js';
import { validateUuid, sanitizePath } from '../middleware.js';
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

/**
 * Proxy an HTTP request to the remote agent via the SSH tunnel.
 * Returns true if the request was proxied, false if it should be handled locally.
 */
function proxyToAgent(
  req: import('express').Request,
  res: import('express').Response,
  agentTunnel: AgentTunnelManager,
  repo: Repository,
): boolean {
  const sessionId = req.params.id as string;
  const session = repo.getSession(sessionId);
  if (!session || !session.workerId) return false;

  const worker = repo.getWorker(session.workerId);
  if (!worker || worker.type !== 'remote' || !worker.remoteAgentPort) return false;

  const agentPort = agentTunnel.getLocalPort(worker.id);
  if (!agentPort) {
    logger.warn({ sessionId, workerId: worker.id }, 'remote session but no agent tunnel');
    res.status(502).json({ error: `Remote agent unavailable for worker ${worker.name}` });
    return true;
  }

  // Rebuild the path: /api/sessions/:id/... → /api/sessions/:id/...
  // The agent expects the same route structure under /api/
  const agentPath = req.originalUrl;

  const forwardHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['connection'];
  delete forwardHeaders['transfer-encoding'];
  forwardHeaders['host'] = `127.0.0.1:${agentPort}`;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: agentPort,
      path: agentPath,
      method: req.method,
      headers: forwardHeaders as http.OutgoingHttpHeaders,
    },
    (proxyRes) => {
      // Forward all response headers
      const responseHeaders = { ...proxyRes.headers };
      // Strip transfer-encoding to avoid double-chunking when piping.
      delete responseHeaders['transfer-encoding'];
      // Remove restrictive headers for serve routes
      if (agentPath.includes('/serve/')) {
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
      }
      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    logger.warn({ sessionId, workerId: worker.id, error: err.message }, 'agent proxy request failed');
    if (!res.headersSent) {
      res.status(502).json({ error: `Remote agent request failed: ${err.message}` });
    }
  });

  // For POST/PUT: express.json() has already consumed the stream, so re-serialize req.body.
  // For GET/DELETE: just end the request.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (req.body !== undefined && req.body !== null) {
      const bodyStr = JSON.stringify(req.body);
      proxyReq.setHeader('content-type', 'application/json');
      proxyReq.setHeader('content-length', Buffer.byteLength(bodyStr));
      proxyReq.end(bodyStr);
    } else {
      req.pipe(proxyReq);
    }
  } else {
    proxyReq.end();
  }
  return true;
}

export function createFilesRouter(repo: Repository, agentTunnelManager?: AgentTunnelManager): Router {
  const router = Router();

  // GET /api/sessions/:id/files — list directory contents (file tree)
  router.get('/:id/files', validateUuid('id'), (req, res) => {
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

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
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

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
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

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

  // GET /api/sessions/:id/search — project-wide text search
  router.get('/:id/search', validateUuid('id'), (req, res) => {
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
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
      logger.info({ sessionId, query, limit, offset }, 'search request');
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

  // GET /api/sessions/:id/serve/* — serve raw files from session working directory (for preview)
  router.get('/:id/serve/*', validateUuid('id'), (req, res) => {
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Extract file path from wildcard — everything after /serve/
    const rawPath = (req.params as Record<string, string>)[0] || 'index.html';
    const sanitized = sanitizePath(rawPath);
    if (!sanitized) {
      res.status(400).send('Invalid path');
      return;
    }

    const fullPath = path.resolve(session.workingDirectory, sanitized);
    // Defense-in-depth: verify resolved path stays within working directory
    if (!fullPath.startsWith(path.resolve(session.workingDirectory))) {
      res.status(400).send('Invalid path');
      return;
    }

    // If path is a directory, try index.html
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
    // Remove restrictive headers for preview iframe content
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Inject bridge script into HTML files
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

  // GET /api/sessions/:id/diff — get git diff for session working directory
  router.get('/:id/diff', validateUuid('id'), (req, res) => {
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

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
