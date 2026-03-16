import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import zlib from 'node:zlib';
import { createProxyServer } from 'http-proxy-3';
import type { Request, Response, NextFunction } from 'express';
import { decompressBuffer, injectBridgeScript, cleanSetCookieHeaders } from './proxy-utils.js';
import { logger } from '../services/logger.js';

/**
 * Proxy context extracted from a request — identifies which session & port
 * the request should be forwarded to.
 */
export interface ProxyContext {
  sessionId: string;
  port: number;
}

const PROXY_PATH_RE = /\/api\/sessions\/([a-f0-9-]+)\/proxy\/(\d+)/;
const PROXY_URL_RE = /\/api\/sessions\/([a-f0-9-]+)\/proxy-url\/([^/\s]+)/;

/**
 * Context for proxy-url (external URL) requests.
 */
export interface ProxyUrlContext {
  sessionId: string;
  targetOrigin: string;
}

/**
 * Extract proxy context (sessionId + port) from a request.
 *
 * 1. Checks the Referer header for `/api/sessions/{id}/proxy/{port}/`
 * 2. Falls back to `__c3_preview={sessionId}:{port}` cookie
 * 3. Returns null if neither source yields a valid context
 */
export function extractProxyContext(req: IncomingMessage): ProxyContext | null {
  // Try Referer first
  const referer = req.headers.referer || req.headers['referer'];
  if (referer) {
    const match = PROXY_PATH_RE.exec(referer);
    if (match) {
      const port = Number(match[2]);
      if (port > 0 && port <= 65535) {
        return { sessionId: match[1], port };
      }
    }
  }

  // Referer-only: no cookie fallback. The __c3_preview cookie caused
  // false positives — hijacking main Adyx navigation on page refresh
  // (no Referer) or new tab opens. The Referer header is reliable for
  // virtually all browser requests (scripts, CSS, fetch, XHR, navigation).
  return null;
}

/**
 * Extract proxy-url context (sessionId + targetOrigin) from a request Referer.
 * Used by the catch-all to redirect escaped navigations back through proxy-url.
 */
export function extractProxyUrlContext(req: IncomingMessage): ProxyUrlContext | null {
  const referer = req.headers.referer || req.headers['referer'];
  if (!referer) return null;
  const match = PROXY_URL_RE.exec(referer);
  if (!match) return null;
  try {
    const targetUrl = new URL(decodeURIComponent(match[2]));
    return { sessionId: match[1], targetOrigin: targetUrl.origin };
  } catch {
    return null;
  }
}

/**
 * Detect whether a request is a navigation (page load) vs a sub-resource fetch.
 *
 * - Primary signal: `Sec-Fetch-Mode: navigate`
 * - Fallback: GET/HEAD + Accept contains text/html + no X-Requested-With
 * - Sec-Fetch-Mode takes precedence over fallback heuristics
 */
export function isNavigationRequest(req: IncomingMessage): boolean {
  const secFetchMode = req.headers['sec-fetch-mode'] as string | undefined;

  // Primary: Sec-Fetch-Mode header
  if (secFetchMode !== undefined) {
    return secFetchMode === 'navigate';
  }

  // Fallback heuristic
  const method = req.method?.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  const accept = req.headers.accept as string | undefined;
  if (!accept || !accept.includes('text/html')) return false;

  if (req.headers['x-requested-with']) return false;

  return true;
}

/**
 * Server-side cookie jar that stores upstream Set-Cookie values
 * keyed by `sessionId:port`.
 */
export class PreviewCookieJar {
  private store_: Map<string, Map<string, string>> = new Map();

  private key(sessionId: string, port: number): string {
    return `${sessionId}:${port}`;
  }

  /**
   * Store cookies from upstream Set-Cookie header(s).
   * Extracts name=value (everything before the first ";") from each header.
   */
  store(sessionId: string, port: number, setCookieHeaders: string[] | string | undefined): void {
    if (!setCookieHeaders) return;

    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const k = this.key(sessionId, port);

    if (!this.store_.has(k)) {
      this.store_.set(k, new Map());
    }
    const cookies = this.store_.get(k)!;

    for (const header of headers) {
      // Extract name=value from before the first ";"
      const semiIdx = header.indexOf(';');
      const nameValue = semiIdx === -1 ? header : header.slice(0, semiIdx);
      const trimmed = nameValue.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const name = trimmed.slice(0, eqIdx);
      cookies.set(name, trimmed);
    }
  }

  /**
   * Get all stored cookies for a session:port as a semicolon-separated string
   * suitable for a Cookie header, e.g. "name1=val1; name2=val2".
   * Returns empty string if nothing stored.
   */
  get(sessionId: string, port: number): string {
    const k = this.key(sessionId, port);
    const cookies = this.store_.get(k);
    if (!cookies || cookies.size === 0) return '';
    return Array.from(cookies.values()).join('; ');
  }

  /**
   * Clear all stored cookies for a session (all ports).
   */
  clear(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of this.store_.keys()) {
      if (key.startsWith(prefix)) {
        this.store_.delete(key);
      }
    }
  }
}

const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/i;

/**
 * Rewrite a Location header value for proxy context.
 *
 * - `/path` -> `proxyBase + /path` (unless already starts with proxyBase)
 * - `//cdn.example.com` -> unchanged (protocol-relative)
 * - `http://localhost:PORT/path` -> `/api/sessions/{sessionId}/proxy/{PORT}/path`
 * - `http://127.0.0.1:PORT/path` -> `/api/sessions/{sessionId}/proxy/{PORT}/path`
 * - `https://external.com/...` -> `/api/sessions/{sessionId}/proxy-url/{encodeURIComponent(url)}`
 */
export function rewriteLocationHeader(
  location: string,
  proxyBase: string,
  sessionId: string,
): string {
  // Protocol-relative URLs: unchanged
  if (location.startsWith('//')) {
    return location;
  }

  // Absolute path
  if (location.startsWith('/')) {
    // Don't double-rewrite
    if (location.startsWith(proxyBase)) {
      return location;
    }
    return proxyBase + location;
  }

  // Full URL: check if localhost/127.0.0.1
  const localhostMatch = LOCALHOST_RE.exec(location);
  if (localhostMatch) {
    const port = localhostMatch[1];
    const path = localhostMatch[2] || '';
    return `/api/sessions/${sessionId}/proxy/${port}${path}`;
  }

  // External URL: proxy through proxy-url endpoint
  if (location.startsWith('http://') || location.startsWith('https://')) {
    return `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(location)}`;
  }

  // Anything else: return as-is
  return location;
}

/**
 * Build HTML to inject into proxied pages.
 * Returns two `<script>` tags:
 * 1. Sets `window.__c3ProxyBase__`
 * 2. IIFE that sets cookie, wraps history methods, and reports URL changes to parent
 */
export function buildProxyInjectionHtml(proxyBase: string): string {
  // Extract sessionId and port from proxyBase pattern
  const match = PROXY_PATH_RE.exec(proxyBase);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sessionId = match ? match[1] : '';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const port = match ? match[2] : '';

  const proxyBaseScript = `<script>window.__c3ProxyBase__="${proxyBase}";</script>`;

  const iife = `<script>(function(){
var b="${proxyBase}";
window.__c3NativeFetch=window.fetch;
try{document.cookie="__c3_preview=;path=/;max-age=0"}catch(e){}
function report(){var p=location.pathname;if(p.startsWith(b))p=p.slice(b.length)||"/";try{parent.postMessage({type:"c3:proxy:urlchange",path:p+location.search+location.hash},location.origin)}catch(e){}}
function rw(u){if(typeof u!=="string")return u;if(u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))return b+u;var o=location.origin;if(u.startsWith(o+"/")&&!u.startsWith(o+b))return o+b+u.slice(o.length);return u}
function stripB(u){if(typeof u!=="string")return u;if(u.startsWith(b+"/"))return u.slice(b.length);if(u===b)return"/";return u}
var oF=window.fetch;window.fetch=function(u,o){var h=(o&&o.headers)?o.headers:null;if(h){if(h instanceof Headers){if(h.has("Next-URL"))h.set("Next-URL",stripB(h.get("Next-URL")))}else if(typeof h==="object"&&h["Next-URL"]){h["Next-URL"]=stripB(h["Next-URL"])}}return oF.call(this,typeof u==="string"?rw(u):u,o)};
var oX=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){return oX.apply(this,[m,rw(u)].concat([].slice.call(arguments,2)))};
var oPS=history.pushState.bind(history);
history.pushState=function(s,t,u){var r=oPS(s,t,u?((typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))?b+u:u):u);report();return r};
var oRS=history.replaceState.bind(history);
history.replaceState=function(s,t,u){var r=oRS(s,t,u?((typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))?b+u:u):u);report();return r};
window.addEventListener("popstate",function(){report()});
report()
})()</script>`;

  return proxyBaseScript + iife;
}

// ---------------------------------------------------------------------------
// Shared proxy instance & cookie jar
// ---------------------------------------------------------------------------

const proxy = createProxyServer({});

// Prevent unhandled ECONNREFUSED from crashing the process
proxy.on('error', () => {});

/** Shared cookie jar used by the proxy handler and catch-all middleware. */
export const cookieJar = new PreviewCookieJar();

// ---------------------------------------------------------------------------
// Types for repo & agentTunnel parameters
// ---------------------------------------------------------------------------

export interface ProxyRepo {
  getSession(id: string): any;
  getWorker(id: string): any;
}

export interface ProxyAgentTunnel {
  getLocalPort(workerId: string): number | null;
}

// ---------------------------------------------------------------------------
// Task 6: Proxy Route Handler
// ---------------------------------------------------------------------------

/**
 * Proxy an HTTP request to the target dev server.
 *
 * @param req       Express/Node request
 * @param res       Express/Node response
 * @param sessionId The session owning this preview
 * @param port      Target port on localhost
 * @param targetPath  Path portion (after stripping proxy prefix)
 * @param target    Full target origin, e.g. "http://127.0.0.1:3000"
 */
export function handleProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  port: number,
  targetPath: string,
  target: string,
): void {
  const proxyBase = `/api/sessions/${sessionId}/proxy/${port}`;
  const queryString = (req.url || '').includes('?')
    ? (req.url || '').substring((req.url || '').indexOf('?'))
    : '';

  // Set host header to target host so upstream sees localhost, not the hub's public IP
  const targetUrl = new URL(target);
  req.headers['host'] = targetUrl.host;
  // Also set x-forwarded-host to localhost — Next.js and other frameworks read this
  req.headers['x-forwarded-host'] = targetUrl.host;
  req.headers['x-forwarded-proto'] = 'http';
  // Remove any stale forwarded headers that expose the hub's public IP
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];
  delete req.headers['origin'];

  // Strip proxy prefix from Referer so upstream sees real paths
  if (req.headers['referer'] && typeof req.headers['referer'] === 'string') {
    req.headers['referer'] = req.headers['referer'].replace(proxyBase, '');
  }

  // Strip proxy prefix from Next.js Next-URL header
  if (req.headers['next-url'] && typeof req.headers['next-url'] === 'string') {
    const nextUrl = req.headers['next-url'] as string;
    if (nextUrl.startsWith(proxyBase + '/')) {
      req.headers['next-url'] = nextUrl.slice(proxyBase.length);
    } else if (nextUrl === proxyBase) {
      req.headers['next-url'] = '/';
    }
  }

  // Attach cookie jar cookies to outgoing request
  const jarCookies = cookieJar.get(sessionId, port);
  if (jarCookies) {
    const existing = typeof req.headers['cookie'] === 'string' ? req.headers['cookie'] : '';
    // Merge: jar cookies take priority over browser cookies
    const merged = new Map<string, string>();
    for (const pair of existing.split(';').map(s => s.trim()).filter(Boolean)) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) merged.set(pair.substring(0, eqIdx), pair);
    }
    for (const pair of jarCookies.split(';').map(s => s.trim()).filter(Boolean)) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) merged.set(pair.substring(0, eqIdx), pair);
    }
    if (merged.size > 0) {
      req.headers['cookie'] = Array.from(merged.values()).join('; ');
    } else {
      delete req.headers['cookie'];
    }
  }

  // Stash context on req for the proxyRes handler
  (req as any).__c3SessionId = sessionId;
  (req as any).__c3Port = port;

  const isNav = isNavigationRequest(req);
  const selfHandleResponse = isNav;

  if (selfHandleResponse) {
    (req as any).__c3ProxyBase = proxyBase;
  }

  // Rewrite req.url to the target path
  req.url = targetPath + queryString;

  proxy.web(req, res, {
    target,
    selfHandleResponse,
    // Don't change origin — we already set host manually
    changeOrigin: false,
  });
}

// ---------------------------------------------------------------------------
// proxyRes handler — single handler for both selfHandle and non-selfHandle
// ---------------------------------------------------------------------------

proxy.on('proxyRes', (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
  const sessionId = (req as any).__c3SessionId as string | undefined;
  const port = (req as any).__c3Port as number | undefined;
  const proxyBase = (req as any).__c3ProxyBase as string | undefined;
  const isSelfHandle = !!proxyBase;

  // --- Common header modifications (runs for all requests) ---

  // Strip restrictive headers
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['content-security-policy'];

  // Allow cross-origin access for fonts/scripts loaded by the iframe
  proxyRes.headers['access-control-allow-origin'] = '*';

  // Store upstream Set-Cookie in jar (for catch-all sub-resource requests)
  // AND forward to browser with rewritten Path (for client-side JS access)
  if (sessionId && port && proxyRes.headers['set-cookie']) {
    const pb = proxyBase || `/api/sessions/${sessionId}/proxy/${port}`;
    cookieJar.store(sessionId, port, proxyRes.headers['set-cookie']);
    const cleaned = cleanSetCookieHeaders(proxyRes.headers['set-cookie'], pb);
    if (cleaned.length > 0) {
      proxyRes.headers['set-cookie'] = cleaned;
    } else {
      delete proxyRes.headers['set-cookie'];
    }
  }

  // Rewrite Location headers for redirects
  if (proxyRes.headers['location'] && sessionId && proxyBase) {
    proxyRes.headers['location'] = rewriteLocationHeader(
      proxyRes.headers['location'] as string,
      proxyBase,
      sessionId,
    );
  } else if (proxyRes.headers['location'] && sessionId && port) {
    // Non-navigation: still rewrite Location with a computed proxyBase
    const pb = `/api/sessions/${sessionId}/proxy/${port}`;
    proxyRes.headers['location'] = rewriteLocationHeader(
      proxyRes.headers['location'] as string,
      pb,
      sessionId,
    );
  }

  // --- Non-selfHandle path: return and let http-proxy-3 pipe automatically ---
  if (!isSelfHandle) {
    return;
  }

  // --- selfHandle path (HTML navigation): buffer, decompress, inject, send ---

  // Strip link headers (preload hints that contain absolute paths)
  delete proxyRes.headers['link'];

  const chunks: Buffer[] = [];
  proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
  proxyRes.on('end', () => {
    try {
      let raw: Buffer = Buffer.concat(chunks);

      // Decompress if needed
      const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
      if (encoding) {
        raw = decompressBuffer(raw, encoding) as Buffer;
        delete proxyRes.headers['content-encoding'];
      }

      let body = raw.toString('utf-8');

      // Strip <meta> CSP tags
      body = body.replace(
        /<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi,
        '',
      );

      // Inject proxy injection HTML after <head>
      const injectionHtml = buildProxyInjectionHtml(proxyBase);
      if (body.includes('<head>')) {
        body = body.replace('<head>', '<head>' + injectionHtml);
      } else if (body.includes('<head ')) {
        body = body.replace(/<head\s[^>]*>/, '$&' + injectionHtml);
      } else {
        body = injectionHtml + body;
      }

      // Inject bridge script
      body = injectBridgeScript(body);

      // Gzip if client accepts
      const clientAcceptsGzip = ((req.headers['accept-encoding'] || '') as string).includes('gzip');
      const bodyBuf = Buffer.from(body);

      delete proxyRes.headers['content-length'];

      if (clientAcceptsGzip) {
        const compressed = zlib.gzipSync(bodyBuf);
        proxyRes.headers['content-encoding'] = 'gzip';
        proxyRes.headers['content-length'] = String(compressed.length);
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        res.end(compressed);
      } else {
        proxyRes.headers['content-length'] = String(bodyBuf.length);
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        res.end(bodyBuf);
      }
    } catch (err) {
      // Error fallback: send raw buffered data
      logger.warn({ error: (err as Error).message }, 'Failed to inject into proxied HTML');
      const raw = Buffer.concat(chunks);
      delete proxyRes.headers['content-length'];
      proxyRes.headers['content-length'] = String(raw.length);
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      res.end(raw);
    }
  });
});

// ---------------------------------------------------------------------------
// Proxy error handler
// ---------------------------------------------------------------------------

proxy.on('error', (err: Error, req: IncomingMessage, res: ServerResponse | Duplex) => {
  const port = (req as any).__c3Port;
  logger.warn({ port, error: (err as Error).message }, 'proxy connection failed');
  // If res is a ServerResponse (not a Socket from WS upgrade), send 502
  if ('writeHead' in res && !res.headersSent) {
    (res as ServerResponse).writeHead(502, { 'content-type': 'text/plain' });
    (res as ServerResponse).end(
      `Cannot connect to localhost:${port || 'unknown'} — is the dev server running?`,
    );
  }
});

// ---------------------------------------------------------------------------
// Task 7: Catch-All Middleware
// ---------------------------------------------------------------------------

/**
 * Creates Express middleware that catches requests which should be proxied
 * to a preview dev server based on Referer/cookie context.
 *
 * - Remote sessions: always redirect to proxy prefix path
 * - Local sessions + navigation: redirect to proxy prefix path
 * - Local sessions + sub-resource: transparent proxy
 */
export function createPreviewCatchAll(
  repo: ProxyRepo,
  _agentTunnel?: ProxyAgentTunnel,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractProxyContext(req);
    if (!ctx) {
      // Check for proxy-url Referer — redirect escaped requests back through proxy-url
      // Handles both navigation (location.href) and sub-resource (Next.js RSC) requests
      const urlCtx = extractProxyUrlContext(req);
      if (urlCtx) {
        const session = repo.getSession(urlCtx.sessionId);
        if (session) {
          const targetUrl = urlCtx.targetOrigin + (req.url || '/');
          const isNav = isNavigationRequest(req);
          const method = req.method?.toUpperCase();
          const statusCode = isNav ? ((method === 'GET' || method === 'HEAD') ? 302 : 307) : 302;
          const redirectPath = `/api/sessions/${urlCtx.sessionId}/proxy-url/${encodeURIComponent(targetUrl)}`;
          res.redirect(statusCode, redirectPath);
          return;
        }
      }
      next();
      return;
    }

    const session = repo.getSession(ctx.sessionId);
    if (!session) {
      next();
      return;
    }

    const proxyBase = `/api/sessions/${ctx.sessionId}/proxy/${ctx.port}`;
    const redirectPath = proxyBase + (req.url || '/');

    // Check if this is a remote session
    const isRemote = session.workerId && (() => {
      const worker = repo.getWorker(session.workerId);
      return worker && worker.type === 'remote';
    })();

    if (isRemote) {
      // Remote sessions: ALWAYS redirect to proxy prefix path
      const method = req.method?.toUpperCase();
      const statusCode = (method === 'GET' || method === 'HEAD') ? 302 : 307;
      res.redirect(statusCode, redirectPath);
      return;
    }

    // Local session
    const isNav = isNavigationRequest(req);

    if (isNav) {
      // Navigation: redirect to proxy prefix path
      const method = req.method?.toUpperCase();
      const statusCode = (method === 'GET' || method === 'HEAD') ? 302 : 307;
      res.redirect(statusCode, redirectPath);
      return;
    }

    // Sub-resource: transparent proxy
    const target = `http://127.0.0.1:${ctx.port}`;

    // Clean headers so upstream sees localhost, not the hub's public IP
    req.headers['host'] = `127.0.0.1:${ctx.port}`;
    req.headers['x-forwarded-host'] = `127.0.0.1:${ctx.port}`;
    req.headers['x-forwarded-proto'] = 'http';
    delete req.headers['x-forwarded-for'];
    delete req.headers['x-real-ip'];
    delete req.headers['origin'];

    // Attach jar cookies
    const jarCookies = cookieJar.get(ctx.sessionId, ctx.port);
    if (jarCookies) {
      const existing = typeof req.headers['cookie'] === 'string' ? req.headers['cookie'] : '';
      const merged = new Map<string, string>();
      for (const pair of existing.split(';').map(s => s.trim()).filter(Boolean)) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) merged.set(pair.substring(0, eqIdx), pair);
      }
      for (const pair of jarCookies.split(';').map(s => s.trim()).filter(Boolean)) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) merged.set(pair.substring(0, eqIdx), pair);
      }
      if (merged.size > 0) {
        req.headers['cookie'] = Array.from(merged.values()).join('; ');
      }
    }

    // Stash context on req for the proxyRes handler
    (req as any).__c3SessionId = ctx.sessionId;
    (req as any).__c3Port = ctx.port;

    proxy.web(req, res, { target });
  };
}

// ---------------------------------------------------------------------------
// Task 8: WebSocket Upgrade Fallback
// ---------------------------------------------------------------------------

const WS_PROXY_PATH_RE = /^\/api\/sessions\/([a-f0-9-]+)\/proxy\/(\d+)(\/.*)?$/;

/**
 * Handle WebSocket upgrade requests for preview proxying.
 *
 * Check 1: URL matches /api/sessions/{id}/proxy/{port}/... -> direct proxy
 * Check 2: Referer-based context -> transparent proxy
 * Neither: destroy socket
 */
export function handleProxyWsUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  repo: ProxyRepo,
  agentTunnel?: ProxyAgentTunnel,
): void {
  const url = req.url || '';

  // Check 1: URL matches proxy path pattern
  const pathMatch = WS_PROXY_PATH_RE.exec(url);
  if (pathMatch) {
    const sessionId = pathMatch[1];
    const port = Number(pathMatch[2]);
    const restPath = pathMatch[3] || '/';

    // Check for remote session
    const session = repo.getSession(sessionId);
    if (session && session.workerId && agentTunnel) {
      const worker = repo.getWorker(session.workerId);
      if (worker && worker.type === 'remote') {
        const localPort = agentTunnel.getLocalPort(worker.id);
        if (localPort) {
          req.url = restPath;
          proxy.ws(req, socket, head, { target: `http://127.0.0.1:${localPort}` });
          return;
        }
      }
    }

    // Local session: strip prefix and proxy
    req.url = restPath;
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
    return;
  }

  // Check 2: Extract proxy context from Referer
  const ctx = extractProxyContext(req);
  if (ctx) {
    const session = repo.getSession(ctx.sessionId);
    if (session && session.workerId && agentTunnel) {
      const worker = repo.getWorker(session.workerId);
      if (worker && worker.type === 'remote') {
        const localPort = agentTunnel.getLocalPort(worker.id);
        if (localPort) {
          proxy.ws(req, socket, head, { target: `http://127.0.0.1:${localPort}` });
          return;
        }
      }
    }

    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${ctx.port}` });
    return;
  }

  // Neither matches -> destroy socket
  socket.destroy();
}
