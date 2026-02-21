import { Router } from 'express';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { Repository } from '../../models/repository.js';
import { validateUuid, sanitizePath } from '../middleware.js';
import { listDirectory, readFile, writeFile, searchFiles } from '../../worker/file-reader.js';
import { getDiff } from '../../worker/git-operations.js';
import { logger } from '../../services/logger.js';

const BRIDGE_VERSION = '5';
const BRIDGE_SCRIPT_TAG = `<script src="/api/inspect-bridge.js?v=${BRIDGE_VERSION}" data-c3-bridge></script>`;

/** Decompress a buffer based on content-encoding */
function decompressBuffer(buf: Buffer, encoding: string): Buffer {
  if (encoding.includes('gzip')) return Buffer.from(zlib.gunzipSync(buf));
  if (encoding.includes('br')) return Buffer.from(zlib.brotliDecompressSync(buf));
  if (encoding.includes('deflate')) return Buffer.from(zlib.inflateSync(buf));
  return buf;
}

/**
 * Rewrite Set-Cookie headers so cookies are scoped to the proxy path.
 * This lets proxied apps (e.g. login sessions) work through the iframe
 * without leaking cookies to the dashboard or other proxy paths.
 *
 * Each proxy-scoped cookie gets a name prefix (__c3p_) so we can identify
 * which cookies belong to the proxied app vs the dashboard when forwarding.
 */
function rewriteSetCookieHeaders(
  setCookieHeaders: string | string[] | undefined,
  proxyBase: string,
): string[] {
  if (!setCookieHeaders) return [];
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map((cookie) => {
    // Prefix the cookie name so we can identify proxy cookies later
    let rewritten = cookie.replace(/^([^=]+)=/, '__c3p_$1=');
    // Set Path to the proxy base (replace any existing Path)
    if (/;\s*path\s*=/i.test(rewritten)) {
      rewritten = rewritten.replace(/;\s*path\s*=\s*[^;]*/i, `; Path=${proxyBase}/`);
    } else {
      rewritten += `; Path=${proxyBase}/`;
    }
    // Remove Domain= since we're proxying through the dashboard host
    rewritten = rewritten.replace(/;\s*domain\s*=[^;]*/i, '');
    // Remove Secure flag since proxy may be HTTP
    rewritten = rewritten.replace(/;\s*secure/i, '');
    // Remove SameSite=None (needs Secure) — set to Lax instead
    rewritten = rewritten.replace(/;\s*samesite\s*=\s*[^;]*/i, '; SameSite=Lax');
    return rewritten;
  });
}

/**
 * Extract proxy-scoped cookies from the browser's Cookie header,
 * strip the __c3p_ prefix, and return a clean cookie string for the upstream server.
 * This ensures we only forward cookies that the proxied app originally set.
 */
function extractProxyCookies(cookieHeader: string | undefined): string {
  if (!cookieHeader) return '';
  return cookieHeader
    .split(';')
    .map(c => c.trim())
    .filter(c => c.startsWith('__c3p_'))
    .map(c => c.replace('__c3p_', ''))
    .join('; ');
}

/** Rewrite absolute paths in HTML to go through the proxy, and inject a fetch/XHR interceptor */
function rewriteHtmlForProxy(html: string, proxyBase: string): string {
  // Rewrite src="/..." and href="/..." attributes (but not "//..." protocol-relative)
  let rewritten = html.replace(
    /((?:src|href|action)\s*=\s*)(["'])\/(?!\/)(.*?)\2/gi,
    `$1$2${proxyBase}/$3$2`,
  );

  // Rewrite JSON URLs inside <script> tags (e.g. Next.js RSC payloads)
  // Handles both \"/_next/...\" and ["/_next/..."] patterns
  rewritten = rewritten.replace(
    /\\"\/(\_next\/[^"\\]*)\\"/g,
    `\\"${proxyBase}/$1\\"`,
  );
  rewritten = rewritten.replace(
    /\["\/(\_next\/[^"]*?)"/g,
    `["${proxyBase}/$1"`,
  );

  // Inject a URL rewriter script that intercepts fetch, XHR, and dynamic elements
  const urlRewriter = `<script>(function(){var b="${proxyBase}";var oF=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b))u=b+u;return oF.call(this,u,o)};var oX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b))u=b+u;return oX.apply(this,arguments)};new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.hasAttribute&&n.hasAttribute("data-c3-bridge"))return;["src","href"].forEach(function(a){var v=n.getAttribute&&n.getAttribute(a);if(v&&v.startsWith("/")&&!v.startsWith(b)&&!v.startsWith("//"))n.setAttribute(a,b+v)})}})})}).observe(document.documentElement,{childList:true,subtree:true})})()</script>`;

  // Strip <meta> CSP tags from proxied HTML — they'd block our injected scripts
  rewritten = rewritten.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

  rewritten = injectBridgeScript(rewritten);
  // Insert URL rewriter right after <head> so it runs before any resources load
  if (rewritten.includes('<head>')) {
    rewritten = rewritten.replace('<head>', '<head>' + urlRewriter);
  } else if (rewritten.includes('<head ')) {
    rewritten = rewritten.replace(/<head\s[^>]*>/, '$&' + urlRewriter);
  } else {
    rewritten = urlRewriter + rewritten;
  }

  return rewritten;
}

/** Inject the inspect-bridge script before </head> in an HTML document */
function injectBridgeScript(html: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', BRIDGE_SCRIPT_TAG + '</head>');
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', BRIDGE_SCRIPT_TAG + '</body>');
  }
  return html + BRIDGE_SCRIPT_TAG;
}

/**
 * Check if an IP address is private/internal (SSRF protection).
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // ::1 (loopback)
    if (lower === '::1') return true;
    // fd00::/8 (unique local)
    if (lower.startsWith('fd')) return true;
    // fe80::/10 (link-local)
    if (lower.startsWith('fe80')) return true;
    // ::ffff:127.x.x.x (IPv4-mapped loopback)
    if (lower.startsWith('::ffff:127.')) return true;
  }
  return false;
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

  // GET /api/sessions/:id/search — project-wide text search
  router.get('/:id/search', validateUuid('id'), (req, res) => {
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

    // Strip hop-by-hop headers; forward only proxy-scoped cookies
    const forwardHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['connection'];
    delete forwardHeaders['upgrade'];
    delete forwardHeaders['accept-encoding']; // Request uncompressed so we can rewrite HTML
    forwardHeaders['host'] = `localhost:${targetPort}`;
    // Only forward cookies that the proxied app originally set (prefixed with __c3p_),
    // stripped back to their original names. This prevents dashboard cookies from leaking.
    const proxyCookies = extractProxyCookies(req.headers.cookie);
    if (proxyCookies) {
      forwardHeaders['cookie'] = proxyCookies;
    } else {
      delete forwardHeaders['cookie'];
    }

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath + queryString,
        method: req.method,
        headers: forwardHeaders as http.OutgoingHttpHeaders,
      },
      (proxyRes) => {
        // Remove restrictive headers set by the global security middleware —
        // these would otherwise merge into writeHead() and block iframe embedding
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');

        // Remove headers from upstream that could also cause issues
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-security-policy'];
        // Rewrite Set-Cookie headers to scope cookies to the proxy path
        const rewrittenCookies = rewriteSetCookieHeaders(proxyRes.headers['set-cookie'], proxyBase);
        if (rewrittenCookies.length > 0) {
          responseHeaders['set-cookie'] = rewrittenCookies;
        } else {
          delete responseHeaders['set-cookie'];
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
        if (contentType.includes('text/html')) {
          // Buffer HTML to decompress, rewrite absolute paths, and inject scripts
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
              const body = raw.toString('utf-8');
              const modified = rewriteHtmlForProxy(body, proxyBase);
              delete responseHeaders['content-length'];
              responseHeaders['content-length'] = String(Buffer.byteLength(modified));
              res.writeHead(proxyRes.statusCode || 200, responseHeaders);
              res.end(modified);
            } catch (err) {
              logger.warn({ error: (err as Error).message }, 'Failed to process proxied HTML');
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
