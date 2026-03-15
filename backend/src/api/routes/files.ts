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
  injectBridgeScript,
  cleanSetCookieHeaders,
  isPrivateIp,
  MIME_TYPES,
} from '../proxy-utils.js';
import { handleProxyRequest } from '../preview-proxy.js';

/**
 * Simple cookie jar for proxy-url external proxying.
 * Keyed by `sessionId:origin` (e.g. "abc-123:https://bstat.vercel.app").
 */
const proxyUrlCookieStore = new Map<string, Map<string, string>>();

function storeProxyUrlCookies(sessionId: string, origin: string, setCookieHeaders: string | string[] | undefined): void {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const key = `${sessionId}:${origin}`;
  if (!proxyUrlCookieStore.has(key)) proxyUrlCookieStore.set(key, new Map());
  const cookies = proxyUrlCookieStore.get(key)!;
  for (const header of headers) {
    const semi = header.indexOf(';');
    const nv = (semi === -1 ? header : header.slice(0, semi)).trim();
    const eq = nv.indexOf('=');
    if (eq > 0) cookies.set(nv.slice(0, eq), nv);
  }
}

function getProxyUrlCookies(sessionId: string, origin: string): string {
  const key = `${sessionId}:${origin}`;
  const cookies = proxyUrlCookieStore.get(key);
  if (!cookies || cookies.size === 0) return '';
  return Array.from(cookies.values()).join('; ');
}

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
      // Keep content-length when present so the browser knows response size.
      delete responseHeaders['transfer-encoding'];
      // Remove restrictive headers for proxy/serve routes
      const isProxyRoute = agentPath.includes('/proxy/') || agentPath.includes('/serve/');
      if (isProxyRoute) {
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
      }

      // For HTML proxy responses, buffer and ensure __c3ProxyBase__ is injected
      // (remote agent may have an older version that doesn't inject it)
      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isHtmlProxy = isProxyRoute && contentType.includes('text/html') &&
        req.method === 'GET' && req.headers['accept']?.includes('text/html');

      if (isHtmlProxy) {
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf-8');
          // Extract proxy base from the agent path
          const proxyMatch = agentPath.match(/\/api\/sessions\/[^/]+\/proxy\/\d+/);
          if (proxyMatch && !body.includes('__c3ProxyBase__')) {
            const proxyBase = proxyMatch[0];
            const proxyBaseScript = `<script>window.__c3ProxyBase__="${proxyBase}";</script>`;
            if (body.includes('<head>')) {
              body = body.replace('<head>', '<head>' + proxyBaseScript);
            } else if (body.includes('<head ')) {
              body = body.replace(/<head\s[^>]*>/, '$&' + proxyBaseScript);
            } else {
              body = proxyBaseScript + body;
            }
          }
          delete responseHeaders['content-length'];
          responseHeaders['content-length'] = String(Buffer.byteLength(body));
          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          res.end(body);
        });
      } else {
        res.writeHead(proxyRes.statusCode || 200, responseHeaders);
        proxyRes.pipe(res);
      }
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
    // Remote sessions: delegate to agent via SSH tunnel (existing behavior)
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
    const target = `http://127.0.0.1:${targetPort}`;

    handleProxyRequest(req, res, sessionId, targetPort, targetPath, target);
  });

  // Handle root proxy path (no trailing path)
  router.all('/:id/proxy/:port', validateUuid('id'), (req, res) => {
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
          logger.warn({ targetUrl: targetUrl.href, hostname, reason: 'direct IP is private' }, 'SSRF blocked proxy-url request');
          res.status(403).json({ error: 'Proxying to private/internal addresses is not allowed' });
          return;
        }
      } else {
        // Resolve DNS and check all returned IPs
        const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
        const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
        const allAddresses = [...addresses, ...addresses6];
        if (allAddresses.some(isPrivateIp)) {
          logger.warn({ targetUrl: targetUrl.href, hostname, resolvedIPs: allAddresses, reason: 'DNS resolves to private IP' }, 'SSRF blocked proxy-url request');
          res.status(403).json({ error: 'Proxying to private/internal addresses is not allowed' });
          return;
        }
      }
    } catch {
      // DNS resolution failure — let the actual request handle the error
    }

    // Handle CORS preflight for proxied requests
    if (req.method === 'OPTIONS') {
      res.removeHeader('x-frame-options');
      res.removeHeader('content-security-policy');
      res.set({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
        'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
      });
      res.status(204).end();
      return;
    }

    const isHttps = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const proxyHeaders = { ...req.headers, host: targetUrl.host };
    // Merge browser cookies (which include proxied site's cookies set with rewritten Path)
    // with jar cookies. This ensures auth tokens (e.g., Supabase) are forwarded.
    const browserCookies = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
    const jarCookies = getProxyUrlCookies(sessionId, targetUrl.origin);
    const mergedCookies = new Map<string, string>();
    for (const pair of browserCookies.split(';').map((s: string) => s.trim()).filter(Boolean)) {
      const eq = pair.indexOf('=');
      if (eq > 0) mergedCookies.set(pair.slice(0, eq), pair);
    }
    for (const pair of jarCookies.split(';').map((s: string) => s.trim()).filter(Boolean)) {
      const eq = pair.indexOf('=');
      if (eq > 0) mergedCookies.set(pair.slice(0, eq), pair);
    }
    if (mergedCookies.size > 0) {
      proxyHeaders.cookie = Array.from(mergedCookies.values()).join('; ');
    } else {
      delete proxyHeaders.cookie;
    }
    // Remove encoding header so responses aren't compressed (we pipe them directly)
    delete proxyHeaders['accept-encoding'];

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
        // Store cookies in jar and forward cleaned to browser (with rewritten path)
        const proxyUrlBase = `/api/sessions/${sessionId}/proxy-url`;
        if (proxyRes.headers['set-cookie']) {
          storeProxyUrlCookies(sessionId, targetUrl.origin, proxyRes.headers['set-cookie']);
          const cleaned = cleanSetCookieHeaders(proxyRes.headers['set-cookie'], proxyUrlBase);
          if (cleaned.length > 0) {
            responseHeaders['set-cookie'] = cleaned;
          } else {
            delete responseHeaders['set-cookie'];
          }
        }
        responseHeaders['access-control-allow-origin'] = '*';

        // Rewrite redirect Location headers to route back through proxy
        // This prevents redirects from escaping the proxy and hitting X-Frame-Options
        if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 303 || proxyRes.statusCode === 307 || proxyRes.statusCode === 308) && responseHeaders.location) {
          let redirectUrl = String(responseHeaders.location);
          // Handle relative redirects by resolving against target URL
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${targetUrl.protocol}//${targetUrl.host}${redirectUrl}`;
          }
          // Check if redirect points to localhost/127.0.0.1 — route through local proxy (not proxy-url, which would be SSRF-blocked)
          const localhostMatch = redirectUrl.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/i);
          if (localhostMatch) {
            const locPort = localhostMatch[1];
            const locPath = localhostMatch[2] || '/';
            responseHeaders.location = `/api/sessions/${sessionId}/proxy/${locPort}${locPath}`;
          } else {
            // Route the redirect back through proxy-url
            responseHeaders.location = `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(redirectUrl)}`;
          }
        }

        const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html')) {
          // Buffer HTML responses to inject scripts and base tag
          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on('end', () => {
            let body = Buffer.concat(chunks).toString('utf-8');
            // Inject <base> tag to make relative URLs resolve against the remote server
            const baseTag = `<base href="${targetUrl.href}">`;
            body = body.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);

            // Strip <meta> CSP tags that would block our injected scripts
            body = body.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

            // Inject comprehensive interceptor that routes navigation through the proxy.
            // IMPORTANT: All rewritten URLs must be FULL absolute URLs (with origin)
            // because the <base> tag makes the browser resolve relative/path-absolute
            // URLs against the remote server instead of localhost.
            const remoteHost = targetUrl.hostname;
            const tgtOrigin = targetUrl.origin;
            const interceptorScript = `<script>(function(){
var PUB="/api/sessions/${sessionId}/proxy-url/";
var TO="${tgtOrigin}";
var O=window.location.origin;
function rw(u){if(typeof u!=="string")return u;
if(u.startsWith(O+"/api/sessions/"))return u;
if(u.startsWith(O)){var p=u.slice(O.length)||"/";return O+PUB+encodeURIComponent(TO+p)}
if(u.startsWith(TO+"/"))return O+PUB+encodeURIComponent(u);
if(u===TO)return O+PUB+encodeURIComponent(u+"/");
if(u.startsWith("/")&&!u.startsWith("//"))return O+PUB+encodeURIComponent(TO+u);
var lm=u.match(/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1):(\\d+)(\\/.*)?$/i);
if(lm)return O+"/api/sessions/${sessionId}/proxy/"+lm[1]+(lm[2]||"/");
if(u.startsWith("http://")||u.startsWith("https://"))return O+PUB+encodeURIComponent(u);
return u}
var oF=window.fetch;window.fetch=function(u,o){
if(typeof u==="string")u=rw(u);
else if(u&&typeof u==="object"&&u.url)u=new Request(rw(u.url),u);
return oF.call(this,u,o)};
var oX=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
return oX.apply(this,[m,typeof u==="string"?rw(u):u].concat([].slice.call(arguments,2)))};
document.addEventListener("submit",function(e){var f=e.target;if(!f||!f.action)return;
var a=f.action;if(a.startsWith(TO)){f.action=O+PUB+encodeURIComponent(a)}},true);
document.addEventListener("click",function(e){if(e.defaultPrevented)return;
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
var h=a.href;if(h&&h.startsWith(TO)){e.preventDefault();window.location.href=O+PUB+encodeURIComponent(h)}},true);
try{var oLA=location.assign.bind(location);location.assign=function(u){return oLA(rw(u))}}catch(e){}
try{var oLR=location.replace.bind(location);location.replace=function(u){return oLR(rw(u))}}catch(e){}
window.history.replaceState=function(){return null};
window.history.pushState=function(){return null};
var OWS=window.WebSocket;window.WebSocket=function(url){
var r=typeof url==="string"?url.replace(/^(https?:\\/\\/)localhost(:[0-9]+)?(\\/|$)/i,"$1${remoteHost}$2$3").replace(/^(wss?:\\/\\/)localhost(:[0-9]+)?(\\/|$)/i,"$1${remoteHost}$2$3"):url;
try{return new OWS(r)}catch(e){return null}};
})()</script>`;
            body = body.replace(/<head[^>]*>/i, (match) => `${match}\n${interceptorScript}`);

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
