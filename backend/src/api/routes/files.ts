import { Router } from 'express';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import type { Repository } from '../../models/repository.js';
import type { AgentTunnelManager } from '../../hub/agent-tunnel.js';
import { validateUuid, sanitizePath } from '../middleware.js';
import { listDirectory, readFile, writeFile, searchFiles } from '../../worker/file-reader.js';
import { getDiff } from '../../worker/git-operations.js';
import { logger } from '../../services/logger.js';
import {
  decompressBuffer,
  cleanSetCookieHeaders,
  rewriteHtmlForProxy,
  injectBridgeScript,
  isPrivateIp,
  MIME_TYPES,
} from '../proxy-utils.js';

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
      // Remove restrictive headers for proxy/serve routes
      if (agentPath.includes('/proxy/') || agentPath.includes('/serve/')) {
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
      // Raw stream not yet consumed (e.g. proxy routes excluded from JSON parsing)
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

  // ALL /api/sessions/:id/proxy/:port/* — reverse proxy to localhost:<port> for preview
  router.all('/:id/proxy/:port/*', validateUuid('id'), (req, res) => {
    if (agentTunnelManager && proxyToAgent(req, res, agentTunnelManager, repo)) return;

    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const targetPort = parseInt(req.params.port as string, 10);
    if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      res.status(400).json({ error: 'Invalid port number' });
      return;
    }

    const targetPath = '/' + ((req.params as Record<string, string>)[0] || '');
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

    const proxyBase = `/api/sessions/${sessionId}/proxy/${targetPort}`;

    logger.debug({ method: req.method, targetPath }, `proxy ${req.method} ${targetPath}`);

    // Strip hop-by-hop headers; forward only proxy-scoped cookies
    const forwardHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['connection'];
    delete forwardHeaders['upgrade'];
    delete forwardHeaders['accept-encoding']; // Request uncompressed so we can rewrite HTML
    forwardHeaders['host'] = `localhost:${targetPort}`;
    // Forward all cookies — the browser scopes cookies by path, so cookies
    // on the proxy path were set by the proxied app (via Set-Cookie or JS).
    // We leave req.headers.cookie as-is.

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath + queryString,
        method: req.method,
        headers: forwardHeaders as http.OutgoingHttpHeaders,
      },
      (proxyRes) => {
        logger.debug({ status: proxyRes.statusCode }, `proxy ${proxyRes.statusCode} ${req.method} ${targetPath}`);

        // Remove restrictive headers set by the global security middleware —
        // these would otherwise merge into writeHead() and block iframe embedding
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');

        // Remove headers from upstream that could also cause issues
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
        // Rewrite Set-Cookie headers to scope cookies to the proxy path
        // Pass through cookies — only strip Domain/Secure so they work over HTTP
        const cleanedCookies = cleanSetCookieHeaders(proxyRes.headers['set-cookie']);
        if (cleanedCookies.length > 0) {
          responseHeaders['set-cookie'] = cleanedCookies;
        }
        // Allow cross-origin access for fonts/scripts loaded by the iframe
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

        // Rewrite Link header preload hints (e.g. Next.js font preloads)
        // These contain absolute paths that the browser fetches before HTML is processed
        if (responseHeaders['link']) {
          const linkVal = responseHeaders['link'] as string;
          responseHeaders['link'] = linkVal.replace(/<\//g, `<${proxyBase}/`);
        }

        const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
        // Only rewrite full HTML documents (navigation requests).
        // Skip rewriting for fetch/XHR responses (RSC, server actions, API calls)
        // which may also come back as text/html but contain non-HTML payloads.
        const isNavigationRequest = req.method === 'GET' && !req.headers['rsc'] && !req.headers['next-action'] &&
          req.headers['accept']?.includes('text/html') && !req.headers['x-requested-with'];
        const shouldRewriteHtml = contentType.includes('text/html') && isNavigationRequest;
        const isJavaScript = contentType.includes('javascript');
        const shouldBuffer = shouldRewriteHtml || isJavaScript;
        if (shouldBuffer) {
          // Buffer response to rewrite paths
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
                // Rewrite Turbopack/Webpack runtime chunk base paths so dynamic
                // imports resolve through the proxy instead of the dashboard root
                body = body.replaceAll('CHUNK_BASE_PATH = "/_next/"', `CHUNK_BASE_PATH = "${proxyBase}/_next/"`);
                body = body.replaceAll('RUNTIME_PUBLIC_PATH = "/_next/"', `RUNTIME_PUBLIC_PATH = "${proxyBase}/_next/"`);
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
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          proxyRes.pipe(res);
        }
      },
    );

    proxyReq.on('error', (err) => {
      logger.warn({ port: targetPort, error: err.message }, 'proxy connection failed');
      if (!res.headersSent) {
        res.status(502).send(`Cannot connect to localhost:${targetPort} — is the dev server running?`);
      }
    });

    // Pipe request body for POST/PUT/etc.
    // The proxy route is excluded from express.json() so the raw stream is intact.
    req.pipe(proxyReq);
  });

  // Handle root proxy path (no trailing path)
  router.all('/:id/proxy/:port', validateUuid('id'), (req, res) => {
    // Redirect to trailing slash so relative paths resolve correctly
    res.redirect(301, req.originalUrl + '/');
  });

  // GET /api/sessions/:id/proxy-url/:encodedUrl — proxy external URLs (strip X-Frame-Options/CSP)
  router.all('/:id/proxy-url/:encodedUrl', validateUuid('id'), async (req, res) => {
    const sessionId = req.params.id as string;
    const session = repo.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(decodeURIComponent(req.params.encodedUrl as string));
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      res.status(400).json({ error: 'Only http/https URLs are supported' });
      return;
    }

    // SSRF protection: resolve hostname and block private/internal IPs
    try {
      const hostname = targetUrl.hostname;
      // Check if hostname is already an IP
      if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) {
          res.status(403).json({ error: 'Proxying to private/internal addresses is not allowed' });
          return;
        }
      } else {
        // Resolve DNS and check all returned IPs
        const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
        const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
        const allAddresses = [...addresses, ...addresses6];
        if (allAddresses.some(isPrivateIp)) {
          res.status(403).json({ error: 'Proxying to private/internal addresses is not allowed' });
          return;
        }
      }
    } catch {
      // DNS resolution failure — let the actual request handle the error
    }

    const isHttps = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const proxyHeaders = { ...req.headers, host: targetUrl.host };
    // Don't forward the dashboard's cookies to external sites
    delete proxyHeaders.cookie;

    const proxyReq = transport.request(
      targetUrl.href,
      {
        method: req.method,
        headers: proxyHeaders,
      },
      (proxyRes) => {
        // Remove restrictive headers set by the global security middleware
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');

        const responseHeaders = { ...proxyRes.headers };
        // Strip headers that block iframe embedding
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['content-security-policy-report-only'];
        // Don't leak external cookies back to the dashboard
        delete responseHeaders['set-cookie'];
        responseHeaders['access-control-allow-origin'] = '*';

        const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html')) {
          // Buffer HTML responses to inject bridge script
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            const modified = injectBridgeScript(body);
            delete responseHeaders['content-length'];
            responseHeaders['content-length'] = String(Buffer.byteLength(modified));
            res.writeHead(proxyRes.statusCode || 200, responseHeaders);
            res.end(modified);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          proxyRes.pipe(res);
        }
      },
    );

    proxyReq.on('error', (err) => {
      logger.warn({ url: targetUrl.href, error: err.message }, 'external proxy failed');
      if (!res.headersSent) {
        res.status(502).send(`Cannot connect to ${targetUrl.hostname}`);
      }
    });

    req.pipe(proxyReq);
  });

  return router;
}
