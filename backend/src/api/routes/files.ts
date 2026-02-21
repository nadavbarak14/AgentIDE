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

const BRIDGE_VERSION = '6';
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
/** Clean Set-Cookie headers — only strip Domain and Secure so cookies work over HTTP proxy */
function cleanSetCookieHeaders(setCookieHeaders: string | string[] | undefined): string[] {
  if (!setCookieHeaders) return [];
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map((cookie) => {
    let c = cookie;
    c = c.replace(/;\s*domain\s*=[^;]*/i, '');
    c = c.replace(/;\s*secure/i, '');
    if (/samesite\s*=\s*none/i.test(c)) {
      c = c.replace(/;\s*samesite\s*=\s*[^;]*/i, '; SameSite=Lax');
    }
    return c;
  });
}

/** Rewrite absolute paths in HTML to go through the proxy, and inject a fetch/XHR interceptor */
function rewriteHtmlForProxy(html: string, proxyBase: string): string {
  // Rewrite src="/..." and action="/..." attributes (but not "//..." protocol-relative)
  // NOTE: We intentionally do NOT rewrite href on <a> tags — React hydration
  // would see a mismatch between server HTML (rewritten) and client render (original).
  // Next.js Link components handle navigation client-side via our URL/history patches.
  let rewritten = html.replace(
    /((?:src|action)\s*=\s*)(["'])\/(?!\/)(.*?)\2/gi,
    `$1$2${proxyBase}/$3$2`,
  );
  // Rewrite href only on <link> elements (CSS, preload, icons — need proxy paths to load)
  rewritten = rewritten.replace(
    /(<link\b[^>]*?\bhref\s*=\s*)(["'])\/(?!\/)(.*?)\2/gi,
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

  // Inject a URL rewriter script that intercepts fetch, XHR, URL constructor,
  // location.assign/replace, navigation, and dynamic elements
  const urlRewriter = `<script>(function(){
var b="${proxyBase}";
function rw(u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))return b+u;return u}
try{var OU=window.URL;var proxyRe=/\\/api\\/sessions\\/[^\\/]+\\/proxy\\/\\d+/;
window.URL=new Proxy(OU,{construct:function(T,args){
if(args.length>=2&&typeof args[0]==="string"&&args[0].startsWith("/")&&!args[0].startsWith("//")){
var s=args[1]!=null?(args[1] instanceof T?args[1].href:String(args[1])):"";
var m=s.match(proxyRe);if(m&&!args[0].startsWith(m[0]))args[0]=m[0]+args[0]}
return new T(args[0],args[1])},apply:function(T,t,args){return T.apply(t,args)}})}catch(e){}
try{var oLA=location.assign.bind(location);location.assign=function(u){return oLA(rw(u))}}catch(e){}
try{var oLR=location.replace.bind(location);location.replace=function(u){return oLR(rw(u))}}catch(e){}
var oF=window.fetch;window.fetch=function(u,o){return oF.call(this,rw(u),o)};
var oX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return oX.apply(this,[m,rw(u)].concat([].slice.call(arguments,2)))};
var oPS=history.pushState.bind(history);history.pushState=function(s,t,u){return oPS(s,t,u?rw(u):u)};
var oRS=history.replaceState.bind(history);history.replaceState=function(s,t,u){return oRS(s,t,u?rw(u):u)};
function rwEl(el){if(!el||el.nodeType!==1)return;
if(el.hasAttribute&&el.hasAttribute("data-c3-bridge"))return;
var tag=el.tagName;if(!tag)return;
var attrs=tag==="A"?["src","action"]:["src","href","action"];
attrs.forEach(function(a){var v=el.getAttribute(a);
if(v&&v.startsWith("/")&&!v.startsWith(b)&&!v.startsWith("//"))el.setAttribute(a,b+v)});
if(el.children)for(var i=0;i<el.children.length;i++)rwEl(el.children[i])}
var oAppend=Node.prototype.appendChild;
Node.prototype.appendChild=function(c){rwEl(c);return oAppend.call(this,c)};
var oInsert=Node.prototype.insertBefore;
Node.prototype.insertBefore=function(c,r){rwEl(c);return oInsert.call(this,c,r)};
var oAppendEl=Element.prototype.append;
if(oAppendEl)Element.prototype.append=function(){for(var i=0;i<arguments.length;i++)if(arguments[i]&&arguments[i].nodeType)rwEl(arguments[i]);return oAppendEl.apply(this,arguments)};
var oSetAttr=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(a,v){
if((a==="src"||a==="action"||(a==="href"&&this.tagName!=="A"))&&typeof v==="string")return oSetAttr.call(this,a,rw(v));
return oSetAttr.call(this,a,v)};
document.addEventListener("click",function(e){if(e.defaultPrevented)return;
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;
var h=a.getAttribute("href");
if(h&&h.startsWith("/")&&!h.startsWith(b)&&!h.startsWith("//")){e.preventDefault();location.assign(b+h)}});
new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){rwEl(n)})})}).observe(document.documentElement,{childList:true,subtree:true});
var OWS=window.WebSocket;
window.WebSocket=new Proxy(OWS,{construct:function(T,args){
var wu=args[0]||"";
if(wu.indexOf("/_next/")!==-1||wu.indexOf("webpack-hmr")!==-1||wu.indexOf("turbopack")!==-1||wu.indexOf("__nextjs")!==-1){
var dummy=new EventTarget();
dummy.readyState=3;dummy.send=function(){};dummy.close=function(){};
dummy.onopen=null;dummy.onclose=null;dummy.onerror=null;dummy.onmessage=null;
dummy.url=wu;dummy.protocol="";dummy.extensions="";dummy.bufferedAmount=0;dummy.binaryType="blob";
dummy.CONNECTING=0;dummy.OPEN=1;dummy.CLOSING=2;dummy.CLOSED=3;
return dummy}
return new T(args[0],args[1])}});
})()</script>`;

  // Strip <meta> CSP tags from proxied HTML — they'd block our injected scripts
  rewritten = rewritten.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

  // Note: we no longer strip HMR client scripts — Turbopack's HMR client
  // doubles as the chunk loading runtime. Without it, client components
  // can't load and React hydration fails. Instead, we patch WebSocket
  // in the urlRewriter to silently drop HMR connections.

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
