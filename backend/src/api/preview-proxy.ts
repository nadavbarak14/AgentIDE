import type { IncomingMessage } from 'node:http';

/**
 * Proxy context extracted from a request — identifies which session & port
 * the request should be forwarded to.
 */
export interface ProxyContext {
  sessionId: string;
  port: number;
}

const PROXY_PATH_RE = /\/api\/sessions\/([a-f0-9-]+)\/proxy\/(\d+)/;

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
      return { sessionId: match[1], port: Number(match[2]) };
    }
  }

  // Fall back to cookie
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith('__c3_preview=')) {
        const value = trimmed.slice('__c3_preview='.length);
        const lastColon = value.lastIndexOf(':');
        if (lastColon === -1) return null;
        const sessionId = value.slice(0, lastColon);
        const portStr = value.slice(lastColon + 1);
        const port = Number(portStr);
        if (!sessionId || !portStr || isNaN(port)) return null;
        return { sessionId, port };
      }
    }
  }

  return null;
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

const LOCALHOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/;

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
  const sessionId = match ? match[1] : '';
  const port = match ? match[2] : '';

  const proxyBaseScript = `<script>window.__c3ProxyBase__="${proxyBase}";</script>`;

  const iife = `<script>(function(){
var b="${proxyBase}";
document.cookie="__c3_preview=${sessionId}:${port};path=/";
function report(){var p=location.pathname;if(p.startsWith(b))p=p.slice(b.length)||"/";try{parent.postMessage({type:"c3:proxy:urlchange",path:p},location.origin)}catch(e){}}
var oPS=history.pushState.bind(history);
history.pushState=function(s,t,u){var r=oPS(s,t,u?((typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))?b+u:u):u);report();return r};
var oRS=history.replaceState.bind(history);
history.replaceState=function(s,t,u){var r=oRS(s,t,u?((typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))?b+u:u):u);report();return r};
window.addEventListener("popstate",function(){report()});
})()</script>`;

  return proxyBaseScript + iife;
}
