# Preview Proxy Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile hand-rolled preview proxy with http-proxy-3 and a Referer-based catch-all middleware that eliminates ~150 lines of client-side monkey-patching.

**Architecture:** A server-side Referer catch-all middleware intercepts "stray" sub-resource requests and routes them to the correct proxy target. Navigation requests get redirected to keep the iframe URL under the proxy prefix. http-proxy-3 handles transport, WebSocket upgrades, and socket lifecycle. A minimal ~15-line client script replaces the current ~150-line URL interceptor.

**Tech Stack:** TypeScript 5.7, Node.js 20 LTS, http-proxy-3, Express 4, Vitest 2.1.0, React 18

**Spec:** `docs/superpowers/specs/2026-03-14-preview-proxy-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `backend/src/api/preview-proxy.ts` | Core proxy module: http-proxy-3 instance, extractProxyContext, isNavigationRequest, cookie jar, HTML injection, Location rewriting, catch-all middleware, WS fallback handler |
| `backend/tests/unit/preview-proxy.test.ts` | Unit tests for all preview-proxy exports |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/api/routes/files.ts` | Replace lines 382-688 (old LOCAL proxy handler) with calls to preview-proxy module. **Keep `proxyToAgent` (lines 29-141) for remote sessions — it delegates to the remote agent's own proxy handler via SSH tunnel.** Keep proxy-url route (lines 696-858) with updated Location rewriting for localhost callbacks |
| `backend/src/api/proxy-utils.ts` | **Keep all exports intact** — `agent-files.ts` (the remote agent) still imports `rewriteHtmlForProxy`, `rewriteCssForProxy`, `cleanSetCookieHeaders`. The hub's `files.ts` stops importing them, but they must remain for the remote agent. |
| `backend/src/api/websocket.ts` | Modify `setupWebSocket()` to accept a `proxyWsFallback` callback instead of destroying unmatched sockets |
| `backend/src/hub-entry.ts` | Wire catch-all middleware before static files (~line 949). Pass WS fallback to setupWebSocket |
| `frontend/src/components/LivePreview.tsx` | Simplify handleIframeLoad to use postMessage instead of iframe location parsing |
| `frontend/tests/unit/toProxyUrl.test.ts` | Update tests for any toProxyUrl changes |
| `backend/tests/unit/proxy-utils.test.ts` | No changes needed — all functions kept |

### Architecture Note: Remote Sessions

**Remote sessions continue to use the existing `proxyToAgent` delegation.** The new `handleProxyRequest` + catch-all middleware only handles **local** sessions. For remote sessions:
- Proxy route: `proxyToAgent(req, res, agentTunnelManager, repo)` forwards the full request to the remote agent's HTTP server via SSH tunnel
- Catch-all middleware: redirects ALL requests (navigation + sub-resources) to the proxy prefix path, which triggers the proxy route, which delegates to `proxyToAgent`
- The remote agent's `agent-files.ts` has its own proxy handler that still uses the old `rewriteHtmlForProxy` etc.

**`App.tsx` note:** `window.__c3ProxyBase__` is used by React Router as `basename` in `App.tsx:8`. The new `buildProxyInjectionHtml` continues to set this variable. Do NOT remove the App.tsx consumer.

---

## Chunk 1: Core Proxy Utilities

### Task 1: Install http-proxy-3

**Files:**
- Modify: `package.json` (root or backend)

- [ ] **Step 1: Install the dependency**

```bash
cd /home/ubuntu/projects/AgentIDE && npm install http-proxy-3
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const hp = await import('http-proxy-3'); console.log(typeof hp.createProxyServer)"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add http-proxy-3 dependency for preview proxy redesign"
```

---

### Task 2: Create preview-proxy module with extractProxyContext

**Files:**
- Create: `backend/src/api/preview-proxy.ts`
- Create: `backend/tests/unit/preview-proxy.test.ts`

- [ ] **Step 1: Write failing tests for extractProxyContext**

```typescript
// backend/tests/unit/preview-proxy.test.ts
import { describe, it, expect } from 'vitest';
import { extractProxyContext } from '../../src/api/preview-proxy.js';

describe('extractProxyContext', () => {
  function makeReq(referer?: string, cookie?: string) {
    return {
      headers: {
        ...(referer ? { referer } : {}),
        ...(cookie ? { cookie } : {}),
      },
    } as any;
  }

  it('returns null when no Referer and no cookie', () => {
    expect(extractProxyContext(makeReq())).toBeNull();
  });

  it('extracts sessionId and port from Referer with proxy pattern', () => {
    const req = makeReq('http://server:24880/api/sessions/abc-123/proxy/3000/page');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'abc-123', port: 3000 });
  });

  it('extracts from Referer with root proxy path (no trailing path)', () => {
    const req = makeReq('http://server:24880/api/sessions/abc-123/proxy/5173/');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'abc-123', port: 5173 });
  });

  it('extracts from Referer with deeply nested path', () => {
    const req = makeReq('http://localhost:24880/api/sessions/abc-123/proxy/3000/dashboard/settings?tab=2');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'abc-123', port: 3000 });
  });

  it('returns null for Referer without proxy pattern', () => {
    expect(extractProxyContext(makeReq('http://server:24880/api/sessions/abc/files'))).toBeNull();
  });

  it('falls back to __c3_preview cookie when no Referer', () => {
    const req = makeReq(undefined, '__c3_preview=abc-123:3000');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'abc-123', port: 3000 });
  });

  it('falls back to cookie when Referer has no proxy pattern', () => {
    const req = makeReq('http://other.com/', '__c3_preview=abc-123:5173');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'abc-123', port: 5173 });
  });

  it('prefers Referer over cookie when both present', () => {
    const req = makeReq(
      'http://server:24880/api/sessions/sess-A/proxy/3000/page',
      '__c3_preview=sess-B:5173',
    );
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: 'sess-A', port: 3000 });
  });

  it('ignores malformed cookie', () => {
    expect(extractProxyContext(makeReq(undefined, '__c3_preview=badvalue'))).toBeNull();
    expect(extractProxyContext(makeReq(undefined, '__c3_preview=:3000'))).toBeNull();
    expect(extractProxyContext(makeReq(undefined, '__c3_preview=abc:'))).toBeNull();
  });

  it('handles UUID-style session IDs in Referer', () => {
    const req = makeReq('http://x/api/sessions/550e8400-e29b-41d4-a716-446655440000/proxy/8080/');
    const ctx = extractProxyContext(req);
    expect(ctx).toEqual({ sessionId: '550e8400-e29b-41d4-a716-446655440000', port: 8080 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement extractProxyContext**

```typescript
// backend/src/api/preview-proxy.ts
import type { IncomingMessage } from 'node:http';

export interface ProxyContext {
  sessionId: string;
  port: number;
}

const PROXY_PATTERN = /\/api\/sessions\/([a-f0-9-]+)\/proxy\/(\d+)/;

/**
 * Extract proxy context from the request's Referer header or fallback cookie.
 * Returns null if no proxy context can be determined.
 */
export function extractProxyContext(req: IncomingMessage | { headers: Record<string, string | string[] | undefined> }): ProxyContext | null {
  // Primary: check Referer header
  const referer = req.headers.referer || req.headers['referer'];
  if (typeof referer === 'string') {
    const match = referer.match(PROXY_PATTERN);
    if (match) {
      const port = parseInt(match[2], 10);
      if (port > 0 && port <= 65535) {
        return { sessionId: match[1], port };
      }
    }
  }

  // Fallback: check __c3_preview cookie
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    const cookieMatch = cookieHeader.match(/__c3_preview=([a-f0-9-]+):(\d+)/);
    if (cookieMatch && cookieMatch[1] && cookieMatch[2]) {
      const port = parseInt(cookieMatch[2], 10);
      if (port > 0 && port <= 65535 && cookieMatch[1].length > 0) {
        return { sessionId: cookieMatch[1], port };
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/preview-proxy.ts backend/tests/unit/preview-proxy.test.ts
git commit -m "feat: add extractProxyContext for Referer-based proxy routing"
```

---

### Task 3: Add isNavigationRequest

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`
- Modify: `backend/tests/unit/preview-proxy.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/unit/preview-proxy.test.ts`:

```typescript
import { extractProxyContext, isNavigationRequest } from '../../src/api/preview-proxy.js';

describe('isNavigationRequest', () => {
  function makeReq(headers: Record<string, string>, method = 'GET') {
    return { method, headers } as any;
  }

  it('detects navigation via Sec-Fetch-Mode: navigate', () => {
    expect(isNavigationRequest(makeReq({ 'sec-fetch-mode': 'navigate' }))).toBe(true);
  });

  it('non-navigate Sec-Fetch-Mode is not navigation', () => {
    expect(isNavigationRequest(makeReq({ 'sec-fetch-mode': 'cors' }))).toBe(false);
    expect(isNavigationRequest(makeReq({ 'sec-fetch-mode': 'no-cors' }))).toBe(false);
    expect(isNavigationRequest(makeReq({ 'sec-fetch-mode': 'same-origin' }))).toBe(false);
  });

  it('fallback: GET + Accept text/html + no X-Requested-With = navigation', () => {
    expect(isNavigationRequest(makeReq({ accept: 'text/html,application/xhtml+xml' }))).toBe(true);
  });

  it('fallback: POST is not navigation (no Sec-Fetch-Mode)', () => {
    expect(isNavigationRequest(makeReq({ accept: 'text/html' }, 'POST'))).toBe(false);
  });

  it('fallback: X-Requested-With present = not navigation (XHR)', () => {
    expect(isNavigationRequest(makeReq({
      accept: 'text/html',
      'x-requested-with': 'XMLHttpRequest',
    }))).toBe(false);
  });

  it('fallback: no Accept header = not navigation', () => {
    expect(isNavigationRequest(makeReq({}))).toBe(false);
  });

  it('Sec-Fetch-Mode takes precedence over fallback heuristic', () => {
    // navigate mode but also has X-Requested-With — Sec-Fetch-Mode wins
    expect(isNavigationRequest(makeReq({
      'sec-fetch-mode': 'navigate',
      'x-requested-with': 'XMLHttpRequest',
    }))).toBe(true);
  });

  it('POST with Sec-Fetch-Mode: navigate IS navigation (form submit)', () => {
    expect(isNavigationRequest(makeReq({ 'sec-fetch-mode': 'navigate' }, 'POST'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: FAIL — isNavigationRequest not exported

- [ ] **Step 3: Implement isNavigationRequest**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
/**
 * Detect whether a request is a navigation (page load) vs a sub-resource (script, image, fetch).
 * Navigation requests should be redirected to the proxy prefix path.
 * Sub-resource requests should be transparently proxied.
 */
export function isNavigationRequest(req: { method: string; headers: Record<string, string | string[] | undefined> }): boolean {
  // Primary: Sec-Fetch-Mode header (supported by all modern browsers)
  const secFetchMode = req.headers['sec-fetch-mode'];
  if (typeof secFetchMode === 'string') {
    return secFetchMode === 'navigate';
  }

  // Fallback: heuristic for older browsers
  // Navigation = GET + accepts HTML + not an XHR
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (req.headers['x-requested-with']) return false;
  const accept = req.headers.accept;
  if (typeof accept === 'string' && accept.includes('text/html')) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/preview-proxy.ts backend/tests/unit/preview-proxy.test.ts
git commit -m "feat: add isNavigationRequest for catch-all redirect vs proxy decision"
```

---

### Task 4: Add cookie jar

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`
- Modify: `backend/tests/unit/preview-proxy.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/unit/preview-proxy.test.ts`:

```typescript
import {
  extractProxyContext,
  isNavigationRequest,
  PreviewCookieJar,
} from '../../src/api/preview-proxy.js';

describe('PreviewCookieJar', () => {
  it('stores cookies from Set-Cookie headers', () => {
    const jar = new PreviewCookieJar();
    jar.store('sess1', 3000, ['session=abc123; Path=/; HttpOnly', 'theme=dark']);
    expect(jar.get('sess1', 3000)).toBe('session=abc123; theme=dark');
  });

  it('returns empty string when no cookies stored', () => {
    const jar = new PreviewCookieJar();
    expect(jar.get('sess1', 3000)).toBe('');
  });

  it('overwrites cookies with same name', () => {
    const jar = new PreviewCookieJar();
    jar.store('sess1', 3000, ['token=old']);
    jar.store('sess1', 3000, ['token=new']);
    expect(jar.get('sess1', 3000)).toBe('token=new');
  });

  it('keeps cookies separate per session:port', () => {
    const jar = new PreviewCookieJar();
    jar.store('sess1', 3000, ['a=1']);
    jar.store('sess1', 5173, ['b=2']);
    jar.store('sess2', 3000, ['c=3']);
    expect(jar.get('sess1', 3000)).toBe('a=1');
    expect(jar.get('sess1', 5173)).toBe('b=2');
    expect(jar.get('sess2', 3000)).toBe('c=3');
  });

  it('handles Set-Cookie with attributes (strips attributes, stores name=value)', () => {
    const jar = new PreviewCookieJar();
    jar.store('s', 80, ['id=xyz; Domain=.example.com; Secure; SameSite=None; Path=/; Max-Age=3600']);
    expect(jar.get('s', 80)).toBe('id=xyz');
  });

  it('handles empty/undefined Set-Cookie headers', () => {
    const jar = new PreviewCookieJar();
    jar.store('s', 80, undefined);
    jar.store('s', 80, []);
    expect(jar.get('s', 80)).toBe('');
  });

  it('clears cookies for a session', () => {
    const jar = new PreviewCookieJar();
    jar.store('sess1', 3000, ['a=1']);
    jar.store('sess1', 5173, ['b=2']);
    jar.clear('sess1');
    expect(jar.get('sess1', 3000)).toBe('');
    expect(jar.get('sess1', 5173)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: FAIL — PreviewCookieJar not exported

- [ ] **Step 3: Implement PreviewCookieJar**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
/**
 * Server-side cookie jar for proxied preview sessions.
 * Stores upstream Set-Cookie values per session:port so they can be
 * attached to outgoing proxy requests. Cookies never reach the browser.
 */
export class PreviewCookieJar {
  private jars = new Map<string, Map<string, string>>();

  private key(sessionId: string, port: number): string {
    return `${sessionId}:${port}`;
  }

  /** Parse Set-Cookie headers and store name=value pairs */
  store(sessionId: string, port: number, setCookieHeaders: string[] | string | undefined): void {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const k = this.key(sessionId, port);
    if (!this.jars.has(k)) this.jars.set(k, new Map());
    const jar = this.jars.get(k)!;
    for (const header of headers) {
      const nameValue = header.split(';')[0].trim();
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx > 0) {
        jar.set(nameValue.substring(0, eqIdx), nameValue);
      }
    }
  }

  /** Build a Cookie header string for outgoing requests */
  get(sessionId: string, port: number): string {
    const jar = this.jars.get(this.key(sessionId, port));
    if (!jar || jar.size === 0) return '';
    return Array.from(jar.values()).join('; ');
  }

  /** Clear all cookies for a session (all ports) */
  clear(sessionId: string): void {
    for (const key of this.jars.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.jars.delete(key);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/preview-proxy.ts backend/tests/unit/preview-proxy.test.ts
git commit -m "feat: add PreviewCookieJar for server-side proxy cookie management"
```

---

### Task 5: Add Location header rewriting and HTML injection

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`
- Modify: `backend/tests/unit/preview-proxy.test.ts`

- [ ] **Step 1: Write failing tests for rewriteLocationHeader**

Add to `backend/tests/unit/preview-proxy.test.ts`:

```typescript
import {
  extractProxyContext,
  isNavigationRequest,
  PreviewCookieJar,
  rewriteLocationHeader,
  buildProxyInjectionHtml,
} from '../../src/api/preview-proxy.js';

describe('rewriteLocationHeader', () => {
  const proxyBase = '/api/sessions/abc-123/proxy/3000';

  it('rewrites absolute path to proxy prefix', () => {
    expect(rewriteLocationHeader('/dashboard', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/3000/dashboard');
  });

  it('rewrites root path', () => {
    expect(rewriteLocationHeader('/', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/3000/');
  });

  it('rewrites http://localhost:PORT to proxy path', () => {
    expect(rewriteLocationHeader('http://localhost:3000/callback?code=abc', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/3000/callback?code=abc');
  });

  it('rewrites http://127.0.0.1:PORT to proxy path', () => {
    expect(rewriteLocationHeader('http://127.0.0.1:3000/page', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/3000/page');
  });

  it('rewrites external URL to proxy-url route', () => {
    expect(rewriteLocationHeader('https://accounts.google.com/oauth', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy-url/' + encodeURIComponent('https://accounts.google.com/oauth'));
  });

  it('does not rewrite protocol-relative URLs', () => {
    expect(rewriteLocationHeader('//cdn.example.com/file.js', proxyBase, 'abc-123'))
      .toBe('//cdn.example.com/file.js');
  });

  it('does not rewrite already-proxied paths', () => {
    expect(rewriteLocationHeader('/api/sessions/abc-123/proxy/3000/page', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/3000/page');
  });

  it('handles localhost redirect to different port via proxy-url for external', () => {
    // Redirect to a DIFFERENT port than the current proxy — treat as internal proxy to that port
    expect(rewriteLocationHeader('http://localhost:5173/other', proxyBase, 'abc-123'))
      .toBe('/api/sessions/abc-123/proxy/5173/other');
  });
});

describe('buildProxyInjectionHtml', () => {
  const proxyBase = '/api/sessions/abc-123/proxy/3000';

  it('includes the proxy base variable', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('window.__c3ProxyBase__=');
    expect(html).toContain(proxyBase);
  });

  it('includes history.pushState wrapper', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('history.pushState');
    expect(html).toContain('history.replaceState');
  });

  it('includes postMessage URL reporter', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('c3:proxy:urlchange');
    expect(html).toContain('parent.postMessage');
  });

  it('includes cookie setter for fallback', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('__c3_preview');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: FAIL — functions not exported

- [ ] **Step 3: Implement rewriteLocationHeader and buildProxyInjectionHtml**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
/**
 * Rewrite a Location header value from a proxied response.
 * - Absolute paths (/foo) → proxy prefix + path
 * - localhost/127.0.0.1 URLs → proxy path for that port
 * - External URLs → proxy-url route
 * - Already-proxied or protocol-relative → unchanged
 */
export function rewriteLocationHeader(location: string, proxyBase: string, sessionId: string): string {
  // Already under proxy prefix
  if (location.startsWith(proxyBase)) return location;

  // Protocol-relative
  if (location.startsWith('//')) return location;

  // Absolute path
  if (location.startsWith('/')) {
    return proxyBase + location;
  }

  // localhost or 127.0.0.1 URL — route through port-based proxy
  const localhostMatch = location.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/i);
  if (localhostMatch) {
    const port = localhostMatch[1];
    const path = localhostMatch[2] || '/';
    return `/api/sessions/${sessionId}/proxy/${port}${path}`;
  }

  // External URL — route through proxy-url
  if (location.startsWith('http://') || location.startsWith('https://')) {
    return `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(location)}`;
  }

  return location;
}

/**
 * Build the HTML to inject into proxied HTML navigation responses.
 * Contains: proxy base variable, history.pushState/replaceState wrappers,
 * URL change reporter via postMessage, and fallback cookie setter.
 */
export function buildProxyInjectionHtml(proxyBase: string): string {
  // Extract sessionId and port from proxyBase for the cookie
  const parts = proxyBase.match(/\/api\/sessions\/([^/]+)\/proxy\/(\d+)/);
  const cookieValue = parts ? `${parts[1]}:${parts[2]}` : '';

  return `<script>window.__c3ProxyBase__="${proxyBase}";</script>` +
    `<script>(function(){` +
    `var b="${proxyBase}";` +
    // Set fallback cookie for requests without Referer
    `try{document.cookie="__c3_preview=${cookieValue};Path=/;SameSite=Lax"}catch(e){}` +
    // Wrap history.pushState to keep iframe URL under proxy prefix
    `var oPS=history.pushState.bind(history);` +
    `history.pushState=function(s,t,u){` +
    `if(u&&typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))u=b+u;` +
    `var r=oPS(s,t,u);report();return r};` +
    // Wrap history.replaceState
    `var oRS=history.replaceState.bind(history);` +
    `history.replaceState=function(s,t,u){` +
    `if(u&&typeof u==="string"&&u.startsWith("/")&&!u.startsWith(b)&&!u.startsWith("//"))u=b+u;` +
    `var r=oRS(s,t,u);report();return r};` +
    // Report clean URL to parent for address bar sync
    `function report(){` +
    `var p=location.pathname;` +
    `if(p.startsWith(b))p=p.slice(b.length)||"/";` +
    `parent.postMessage({type:"c3:proxy:urlchange",path:p+location.search+location.hash},location.origin)}` +
    `window.addEventListener("popstate",report);` +
    `report()` +
    `})()</script>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/preview-proxy.ts backend/tests/unit/preview-proxy.test.ts
git commit -m "feat: add Location header rewriting and proxy HTML injection"
```

---

## Chunk 2: Proxy Route Handler and Catch-All Middleware

### Task 6: Implement the http-proxy-3 based proxy route handler

This is the core proxy handler that replaces the raw `http.request` code in `files.ts:416-688`.

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`

- [ ] **Step 1: Add the proxy route handler factory**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
import { createProxyServer } from 'http-proxy-3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Router, Request, Response, NextFunction } from 'express';
import zlib from 'node:zlib';
import { decompressBuffer, injectBridgeScript, BRIDGE_SCRIPT_TAG } from './proxy-utils.js';
import { logger } from '../services/logger.js';

// Shared http-proxy-3 instance
const proxy = createProxyServer({});

// Shared cookie jar (exported for tests and files.ts access)
export const cookieJar = new PreviewCookieJar();

// Note: No getProxyTarget function needed. Remote sessions are handled by
// proxyToAgent in files.ts (kept unchanged). The new preview-proxy module
// only handles LOCAL sessions, always targeting http://127.0.0.1:{port}.

/**
 * Handle a proxy request: strip headers, attach cookies, proxy via http-proxy-3.
 * For HTML navigation responses, buffer and inject bridge + client scripts.
 */
export function handleProxyRequest(
  req: Request,
  res: Response,
  sessionId: string,
  port: number,
  targetPath: string,
  target: string,
): void {
  const proxyBase = `/api/sessions/${sessionId}/proxy/${port}`;

  // Clean hop-by-hop headers, set target host
  delete req.headers['connection'];
  delete req.headers['upgrade'];
  req.headers['host'] = new URL(target).host;

  // Strip proxy prefix from framework-specific headers
  if (typeof req.headers['referer'] === 'string') {
    req.headers['referer'] = req.headers['referer'].replace(proxyBase, '');
  }
  if (typeof req.headers['next-url'] === 'string') {
    const nextUrl = req.headers['next-url'];
    if (nextUrl.startsWith(proxyBase + '/')) {
      req.headers['next-url'] = nextUrl.slice(proxyBase.length);
    } else if (nextUrl === proxyBase) {
      req.headers['next-url'] = '/';
    }
  }

  // Attach cookie jar
  const jarCookies = cookieJar.get(sessionId, port);
  if (jarCookies) {
    req.headers['cookie'] = jarCookies;
  }

  // Stash context on req for the proxyRes event handler
  (req as any).__c3SessionId = sessionId;
  (req as any).__c3Port = port;

  const isNavigation = isNavigationRequest(req);
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  req.url = targetPath + queryString;

  if (isNavigation) {
    (req as any).__c3ProxyBase = proxyBase;
    proxy.web(req, res, { target, selfHandleResponse: true });
  } else {
    proxy.web(req, res, { target });
  }
}

// Single consolidated proxyRes handler for ALL proxy responses.
// For selfHandleResponse (navigation HTML): buffers, injects scripts, sends response.
// For non-selfHandleResponse (sub-resources): modifies proxyRes.headers before http-proxy-3 pipes.
proxy.on('proxyRes', (proxyRes, req, res) => {
  const proxyBase = (req as any).__c3ProxyBase as string | undefined;
  const sessionId = (req as any).__c3SessionId as string | undefined;
  const port = (req as any).__c3Port as number | undefined;
  const isSelfHandle = !!proxyBase;

  // Common header cleanup (runs for both paths — before piping for non-selfHandle)
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['content-security-policy'];
  proxyRes.headers['access-control-allow-origin'] = '*';

  // Store cookies in jar, strip from response
  if (sessionId && port !== undefined && proxyRes.headers['set-cookie']) {
    cookieJar.store(sessionId, port, proxyRes.headers['set-cookie'] as string[]);
    delete proxyRes.headers['set-cookie'];
  }

  // Rewrite Location headers
  if (sessionId && port !== undefined && proxyRes.headers['location'] && typeof proxyRes.headers['location'] === 'string') {
    const base = proxyBase || `/api/sessions/${sessionId}/proxy/${port}`;
    proxyRes.headers['location'] = rewriteLocationHeader(proxyRes.headers['location'], base, sessionId);
  }

  // For non-selfHandleResponse: we're done. http-proxy-3 will pipe proxyRes → res
  // with the modified headers.
  if (!isSelfHandle) return;

  // === selfHandleResponse path: buffer HTML, inject scripts ===
  delete proxyRes.headers['link']; // Strip preload hints

  const responseHeaders = { ...proxyRes.headers };

  // Rewrite Location headers
  if (responseHeaders['location'] && typeof responseHeaders['location'] === 'string') {
    responseHeaders['location'] = rewriteLocationHeader(
      responseHeaders['location'], proxyBase, sessionId,
    );
  }

  // Set fallback cookie
  responseHeaders['set-cookie'] = [`__c3_preview=${sessionId}:${port}; Path=/; SameSite=Lax; HttpOnly`];

  // Buffer and inject scripts into HTML
  const chunks: Buffer[] = [];
  proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
  proxyRes.on('end', () => {
    try {
      let raw = Buffer.concat(chunks);
      const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
      if (encoding) {
        raw = decompressBuffer(raw, encoding);
        delete responseHeaders['content-encoding'];
      }

      let body = raw.toString('utf-8');

      // Strip <meta> CSP tags
      body = body.replace(/<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi, '');

      // Inject proxy scripts after <head>
      const injection = buildProxyInjectionHtml(proxyBase);
      if (body.includes('<head>')) {
        body = body.replace('<head>', '<head>' + injection);
      } else if (body.includes('<head ')) {
        body = body.replace(/<head\s[^>]*>/, '$&' + injection);
      } else {
        body = injection + body;
      }

      // Inject bridge script
      body = injectBridgeScript(body);

      const bodyBuf = Buffer.from(body);
      delete responseHeaders['content-length'];

      const clientAcceptsGzip = ((req as IncomingMessage).headers['accept-encoding'] || '').includes('gzip');
      if (clientAcceptsGzip) {
        const compressed = zlib.gzipSync(bodyBuf);
        responseHeaders['content-encoding'] = 'gzip';
        responseHeaders['content-length'] = String(compressed.length);
        (res as ServerResponse).writeHead(proxyRes.statusCode || 200, responseHeaders);
        (res as ServerResponse).end(compressed);
      } else {
        responseHeaders['content-length'] = String(bodyBuf.length);
        (res as ServerResponse).writeHead(proxyRes.statusCode || 200, responseHeaders);
        (res as ServerResponse).end(bodyBuf);
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to process proxied HTML response');
      const raw = Buffer.concat(chunks);
      delete responseHeaders['content-length'];
      responseHeaders['content-length'] = String(raw.length);
      (res as ServerResponse).writeHead(proxyRes.statusCode || 200, responseHeaders);
      (res as ServerResponse).end(raw);
    }
  });
});

// NOTE: Only ONE proxyRes handler. For selfHandleResponse requests, http-proxy-3
// does NOT pipe automatically — we buffer and inject. For non-selfHandleResponse,
// http-proxy-3 pipes AFTER this event fires, so modifying proxyRes.headers here
// affects the piped response.

// Error handler
proxy.on('error', (err, req, res) => {
  const port = (req as any).__c3Port;
  logger.warn({ port, error: (err as Error).message }, 'proxy connection failed');
  if (res instanceof ServerResponse && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Cannot connect to localhost:${port || '?'} — is the dev server running?`);
  }
});
```

**Note:** The stashing of `__c3SessionId`, `__c3Port`, and `__c3ProxyBase` on `req` is already included in `handleProxyRequest` above. The `proxyRes` event handler reads these to determine context.

- [ ] **Step 2: Run existing tests to verify nothing broke**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS (new code is additive)

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/preview-proxy.ts
git commit -m "feat: add http-proxy-3 based proxy route handler with HTML injection"
```

---

### Task 7: Implement the catch-all middleware

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`
- Modify: `backend/tests/unit/preview-proxy.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/unit/preview-proxy.test.ts`:

```typescript
import {
  // ... existing imports ...
  createPreviewCatchAll,
} from '../../src/api/preview-proxy.js';

describe('createPreviewCatchAll', () => {
  // Minimal repo mock
  const mockRepo = {
    getSession: (id: string) => id === 'valid-sess' ? { workerId: null } : null,
    getWorker: () => null,
  };

  function makeReq(path: string, referer?: string, headers?: Record<string, string>) {
    return {
      method: 'GET',
      url: path,
      path,
      originalUrl: path,
      headers: {
        ...(referer ? { referer } : {}),
        ...headers,
      },
    } as any;
  }

  function makeRes() {
    const res: any = {
      redirected: null,
      statusCode: null,
      redirect(code: number, url: string) { res.redirected = { code, url }; },
    };
    return res;
  }

  it('calls next() when no proxy context found', () => {
    const middleware = createPreviewCatchAll(mockRepo as any);
    const req = makeReq('/some/path');
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('calls next() when session does not exist', () => {
    const middleware = createPreviewCatchAll(mockRepo as any);
    const req = makeReq('/bundle.js', 'http://x/api/sessions/nonexistent/proxy/3000/');
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('redirects navigation requests to proxy prefix', () => {
    const middleware = createPreviewCatchAll(mockRepo as any);
    const req = makeReq('/about', 'http://x/api/sessions/valid-sess/proxy/3000/page', {
      'sec-fetch-mode': 'navigate',
    });
    const res = makeRes();
    middleware(req, res, () => {});
    expect(res.redirected).toEqual({
      code: 302,
      url: '/api/sessions/valid-sess/proxy/3000/about',
    });
  });

  it('uses 307 for POST navigation requests', () => {
    const middleware = createPreviewCatchAll(mockRepo as any);
    const req = makeReq('/login', 'http://x/api/sessions/valid-sess/proxy/3000/', {
      'sec-fetch-mode': 'navigate',
    });
    req.method = 'POST';
    const res = makeRes();
    middleware(req, res, () => {});
    expect(res.redirected).toEqual({
      code: 307,
      url: '/api/sessions/valid-sess/proxy/3000/login',
    });
  });

  it('redirects ALL requests (including sub-resources) for remote sessions', () => {
    // Remote session — catch-all always redirects so proxyToAgent handles it
    const remoteRepo = {
      getSession: (id: string) => id === 'remote-sess' ? { workerId: 'w1' } : null,
      getWorker: (id: string) => id === 'w1' ? { type: 'remote', id: 'w1' } : null,
    };
    const middleware = createPreviewCatchAll(remoteRepo as any);
    const req = makeReq('/bundle.js', 'http://x/api/sessions/remote-sess/proxy/3000/page', {
      'sec-fetch-mode': 'no-cors',  // sub-resource, NOT navigation
    });
    const res = makeRes();
    middleware(req, res, () => {});
    // Even sub-resources get redirected for remote sessions
    expect(res.redirected).toEqual({
      code: 302,
      url: '/api/sessions/remote-sess/proxy/3000/bundle.js',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: FAIL — createPreviewCatchAll not exported

- [ ] **Step 3: Implement createPreviewCatchAll**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
import type { Repository } from '../models/repository.js';
import type { AgentTunnelManager } from '../hub/agent-tunnel.js';

/**
 * Create the Referer-based catch-all middleware.
 * Must be placed AFTER hub API routes and BEFORE express.static/SPA fallback.
 */
/**
 * Check if a session runs on a remote worker.
 */
function isRemoteSession(
  session: { workerId?: string | null },
  repo: { getWorker(id: string): { type: string } | null },
): boolean {
  if (!session.workerId) return false;
  const worker = repo.getWorker(session.workerId);
  return worker?.type === 'remote' || false;
}

export function createPreviewCatchAll(
  repo: Repository,
  agentTunnel?: AgentTunnelManager,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = extractProxyContext(req);
    if (!ctx) return next();

    // Validate session exists
    const session = repo.getSession(ctx.sessionId);
    if (!session) return next();

    // Remote sessions: ALWAYS redirect to proxy prefix path.
    // The proxy route handler will delegate to proxyToAgent via SSH tunnel.
    // This avoids trying to proxy directly to the agent from the catch-all.
    if (isRemoteSession(session, repo)) {
      const code = (req.method === 'GET' || req.method === 'HEAD') ? 302 : 307;
      res.redirect(code, `/api/sessions/${ctx.sessionId}/proxy/${ctx.port}${req.url}`);
      return;
    }

    // Local sessions: redirect navigation, transparent proxy sub-resources
    if (isNavigationRequest(req)) {
      const code = (req.method === 'GET' || req.method === 'HEAD') ? 302 : 307;
      res.redirect(code, `/api/sessions/${ctx.sessionId}/proxy/${ctx.port}${req.url}`);
    } else {
      // Transparent proxy for sub-resources (local sessions only)
      const target = `http://127.0.0.1:${ctx.port}`;
      (req as any).__c3SessionId = ctx.sessionId;
      (req as any).__c3Port = ctx.port;
      const jarCookies = cookieJar.get(ctx.sessionId, ctx.port);
      if (jarCookies) {
        req.headers['cookie'] = jarCookies;
      }
      req.headers['host'] = `127.0.0.1:${ctx.port}`;
      proxy.web(req, res, { target });
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/unit/preview-proxy.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/preview-proxy.ts backend/tests/unit/preview-proxy.test.ts
git commit -m "feat: add Referer-based catch-all middleware for transparent proxy routing"
```

---

### Task 8: Add WebSocket upgrade fallback handler

**Files:**
- Modify: `backend/src/api/preview-proxy.ts`

- [ ] **Step 1: Add handleProxyWsUpgrade export**

Add to `backend/src/api/preview-proxy.ts`:

```typescript
/**
 * WebSocket upgrade fallback handler. Called by setupWebSocket() when
 * the upgrade request doesn't match /ws/sessions/:id patterns.
 * Routes proxy-prefixed or Referer-identified WebSocket connections.
 */
export function handleProxyWsUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  repo: Repository,
  agentTunnel?: AgentTunnelManager,
): void {
  // Check 1: URL matches proxy pattern
  const url = req.url || '';
  const proxyMatch = url.match(/\/api\/sessions\/([a-f0-9-]+)\/proxy\/(\d+)(\/.*)?/);
  if (proxyMatch) {
    const sessionId = proxyMatch[1];
    const port = parseInt(proxyMatch[2], 10);
    const session = repo.getSession(sessionId);
    if (session && port > 0 && port <= 65535) {
      const target = getProxyTarget(session, port, repo, agentTunnel);
      req.url = proxyMatch[3] || '/';
      proxy.ws(req, socket, head, { target });
      return;
    }
  }

  // Check 2: Referer contains proxy pattern (stray WebSocket from app)
  const ctx = extractProxyContext(req);
  if (ctx) {
    const session = repo.getSession(ctx.sessionId);
    if (session) {
      const target = getProxyTarget(session, ctx.port, repo, agentTunnel);
      proxy.ws(req, socket, head, { target });
      return;
    }
  }

  // Truly unmatched — destroy
  socket.destroy();
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/preview-proxy.ts
git commit -m "feat: add WebSocket upgrade fallback for HMR proxy support"
```

---

## Chunk 3: Integration — Wire Up and Clean Up

### Task 9: Modify websocket.ts to accept proxy WS fallback

**Files:**
- Modify: `backend/src/api/websocket.ts:18-63`

- [ ] **Step 1: Update setupWebSocket signature and upgrade handler**

Read the current `setupWebSocket` function. Change the signature to accept an optional `proxyWsFallback` parameter. Replace the `socket.destroy()` at line 60-62 with a call to the fallback.

In `backend/src/api/websocket.ts`, change the function signature (line 18-26) to:

```typescript
export function setupWebSocket(
  server: http.Server,
  repo: Repository,
  sessionManager: SessionManager,
  ptySpawner: PtySpawner,
  fileWatcher?: FileWatcher,
  shellSpawner?: ShellSpawner,
  remotePtyBridge?: RemotePtyBridge,
  proxyWsFallback?: (req: IncomingMessage, socket: Socket, head: Buffer) => void,
): void {
```

And replace lines 60-63:

```typescript
    if (!shellMatch && !claudeMatch) {
      socket.destroy();
      return;
    }
```

With:

```typescript
    if (!shellMatch && !claudeMatch) {
      if (proxyWsFallback) {
        proxyWsFallback(request, socket, head);
      } else {
        socket.destroy();
      }
      return;
    }
```

Also add the import for `Socket` at the top if not already imported:

```typescript
import type { Socket } from 'node:net';
```

- [ ] **Step 2: Run existing tests**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/
```

Expected: all PASS (the change is backwards-compatible — existing callers don't pass the new param)

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/websocket.ts
git commit -m "feat: add proxyWsFallback param to setupWebSocket for HMR support"
```

---

### Task 10: Wire catch-all middleware and WS fallback in hub-entry.ts

**Files:**
- Modify: `backend/src/hub-entry.ts:439,949-969`

- [ ] **Step 1: Import new modules**

Add near the top of `hub-entry.ts`:

```typescript
import { createPreviewCatchAll, handleProxyWsUpgrade } from './api/preview-proxy.js';
```

- [ ] **Step 2: Add catch-all middleware BEFORE static files**

Find the section around line 949 where `express.static` is set up. Insert the catch-all middleware BEFORE it:

```typescript
  // Preview proxy catch-all: routes stray sub-resource requests based on Referer
  app.use(createPreviewCatchAll(repo, agentTunnelManager));

  // Serve static frontend in production
  const frontendDist = path.join(import.meta.dirname, '../../frontend/dist');
  // ... rest of static file serving ...
```

- [ ] **Step 3: Pass WS fallback to setupWebSocket**

Find the `setupWebSocket` call (~line 969) and add the fallback:

```typescript
  setupWebSocket(
    server, repo, sessionManager, ptySpawner, fileWatcher, shellSpawner, remotePtyBridge,
    (req, socket, head) => handleProxyWsUpgrade(req, socket, head, repo, agentTunnelManager),
  );
```

- [ ] **Step 4: Run tests**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/hub-entry.ts
git commit -m "feat: wire preview proxy catch-all middleware and WebSocket fallback"
```

---

### Task 11: Replace old proxy code in files.ts

This is the biggest change — replacing ~300 lines of hand-rolled proxy with calls to the new module.

**Files:**
- Modify: `backend/src/api/routes/files.ts:382-694`

- [ ] **Step 1: Import new module**

Add to imports in `files.ts`:

```typescript
import { handleProxyRequest } from '../preview-proxy.js';
```

- [ ] **Step 2: Replace the old LOCAL proxy handler, keep proxyToAgent for remote**

Delete lines 382-688 (the cookie jar, `storeCookies`, `getStoredCookies`, `getCookieJarKey`, and the old `router.all('/:id/proxy/:port/*', ...)` handler body).

**Keep `proxyToAgent` function (lines 29-141) unchanged** — it handles remote session delegation.

Replace the route handler with:

```typescript
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
```

- [ ] **Step 3: Update the proxy-url route Location rewriting**

In the `proxy-url` route (previously lines 696-858, now shifted), update the Location header rewriting to handle localhost callbacks correctly. Find the section that rewrites Location headers and update:

```typescript
    // Rewrite Location headers
    if (responseHeaders['location']) {
      const loc = responseHeaders['location'] as string;
      // Localhost/127.0.0.1 callbacks → route through port-based proxy (NOT proxy-url which SSRF-blocks localhost)
      const localhostMatch = loc.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)(\/.*)?$/i);
      if (localhostMatch) {
        responseHeaders['location'] = `/api/sessions/${sessionId}/proxy/${localhostMatch[1]}${localhostMatch[2] || '/'}`;
      } else if (loc.startsWith('/')) {
        // Relative path — keep within proxy-url context
        const base = targetUrl.origin;
        responseHeaders['location'] = `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(base + loc)}`;
      } else if (loc.startsWith('http://') || loc.startsWith('https://')) {
        // External redirect — stay in proxy-url
        responseHeaders['location'] = `/api/sessions/${sessionId}/proxy-url/${encodeURIComponent(loc)}`;
      }
    }
```

- [ ] **Step 4: Remove old imports that are no longer needed**

Remove unused imports from files.ts:

```typescript
// Remove these imports:
import {
  cleanSetCookieHeaders,
  rewriteHtmlForProxy,
  rewriteCssForProxy,
} from '../proxy-utils.js';
```

Keep the remaining imports that are still used:

```typescript
import {
  decompressBuffer,
  injectBridgeScript,
  isPrivateIp,
  MIME_TYPES,
} from '../proxy-utils.js';
```

- [ ] **Step 5: Run tests**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/routes/files.ts
git commit -m "refactor: replace hand-rolled proxy with http-proxy-3 handler in files.ts"
```

---

### Task 12: Verify proxy-utils.ts and remove unused imports from files.ts

**Files:**
- Modify: `backend/src/api/routes/files.ts` (imports only)

**Note:** `proxy-utils.ts` is NOT modified. All functions are kept because `agent-files.ts` (the remote agent) still imports `rewriteHtmlForProxy`, `rewriteCssForProxy`, and `cleanSetCookieHeaders`. The hub's `files.ts` simply stops importing the ones it no longer uses.

- [ ] **Step 1: Update imports in files.ts**

Remove unused imports from `files.ts`. The file should now only import what it still uses:

```typescript
// Remove these from the import:
//   cleanSetCookieHeaders, rewriteHtmlForProxy, rewriteCssForProxy
// Keep these:
import {
  decompressBuffer,
  injectBridgeScript,
  isPrivateIp,
  MIME_TYPES,
} from '../proxy-utils.js';
```

Note: `decompressBuffer` and `injectBridgeScript` may no longer be directly used in `files.ts` if all HTML injection moved to `preview-proxy.ts`. In that case, also remove them from this import (they're imported by `preview-proxy.ts` instead). Check usage before removing.

- [ ] **Step 2: Run full backend test suite**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run backend/tests/
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/files.ts
git commit -m "refactor: remove unused proxy-utils imports from files.ts (kept for agent-files.ts)"
```

---

## Chunk 4: Frontend Changes

### Task 13: Update LivePreview.tsx for postMessage URL sync

**Files:**
- Modify: `frontend/src/components/LivePreview.tsx:224-259`

- [ ] **Step 1: Update handleIframeLoad to use postMessage**

Replace the current `handleIframeLoad` callback (lines 224-259) with a simpler version that doesn't try to read the iframe location (which fails cross-origin). Instead, listen for `c3:proxy:urlchange` postMessage from the injected client script.

Add a `useEffect` for the message listener:

```typescript
  // Listen for URL change messages from injected proxy client script
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'c3:proxy:urlchange') return;
      const path = event.data.path as string;
      if (!path) return;

      // Reconstruct the display URL from the path
      // The port comes from the current displayUrl
      const portMatch = currentDisplayUrlRef.current.match(/:(\d+)/);
      const urlPort = portMatch ? portMatch[1] : String(port);
      const realUrl = `http://localhost:${urlPort}${path}`;

      setDisplayUrl((prev) => prev === realUrl ? prev : realUrl);
      setAddressInput((prev) => prev === realUrl ? prev : realUrl);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [port]);
```

Simplify `handleIframeLoad` to just clear the loading state:

```typescript
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // URL sync is handled by postMessage from the injected proxy client script.
    // For local direct mode, try to read the iframe location directly.
    if (isLocalDirect) {
      try {
        const iframeLoc = iframeRef.current?.contentWindow?.location;
        if (iframeLoc) {
          const realUrl = iframeLoc.href;
          if (realUrl && realUrl !== 'about:blank') {
            setDisplayUrl((prev) => prev === realUrl ? prev : realUrl);
            setAddressInput((prev) => prev === realUrl ? prev : realUrl);
          }
        }
      } catch (_e) {
        // Cross-origin — ignore
      }
    }
  }, [isLocalDirect]);
```

- [ ] **Step 2: Run frontend tests**

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run frontend/tests/
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LivePreview.tsx
git commit -m "refactor: switch to postMessage URL sync in LivePreview, simplify handleIframeLoad"
```

---

### Task 14: Update frontend tests

**Files:**
- Modify: `frontend/tests/unit/toProxyUrl.test.ts`

- [ ] **Step 1: Review and update toProxyUrl tests**

The `toProxyUrl` function itself hasn't changed — it still converts display URLs to proxy URLs. Existing tests should pass. Run them to verify:

```bash
cd /home/ubuntu/projects/AgentIDE && npx vitest run frontend/tests/unit/toProxyUrl.test.ts
```

Expected: all PASS

If any test references `__c3ProxyBase__` or the old URL rewriter, remove those references.

- [ ] **Step 2: Commit (if changes needed)**

```bash
git add frontend/tests/unit/toProxyUrl.test.ts
git commit -m "test: update toProxyUrl tests for proxy redesign"
```

---

## Chunk 5: Final Verification

### Task 15: Full test suite and lint check

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd /home/ubuntu/projects/AgentIDE && npm test
```

Expected: all PASS

- [ ] **Step 2: Run lint**

```bash
cd /home/ubuntu/projects/AgentIDE && npm run lint
```

Expected: no errors

- [ ] **Step 3: Verify build**

```bash
cd /home/ubuntu/projects/AgentIDE && npm run build 2>&1 | tail -20
```

Expected: successful build

- [ ] **Step 4: Manual smoke test checklist**

After deploying, test these scenarios:
- [ ] Local access (localhost): preview loads directly without proxy
- [ ] Remote access (public IP): preview loads via proxy, sub-resources work
- [ ] Navigation within proxied app (click links): redirect + re-proxy
- [ ] SPA navigation (pushState): address bar updates correctly
- [ ] HMR/hot reload: WebSocket connection established, changes reflected
- [ ] Login flow: cookies stored in jar, auth persists across requests
- [ ] External URL in address bar: loads via proxy-url
- [ ] OAuth redirect: external redirect → callback routed correctly
- [ ] Multiple sessions: each session's preview isolated

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A && git commit -m "fix: address issues found during smoke testing"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Core Utilities | 1-5 | http-proxy-3 installed, extractProxyContext, isNavigationRequest, cookie jar, Location rewriting, HTML injection — all tested |
| 2: Handlers | 6-8 | Proxy route handler, catch-all middleware, WebSocket fallback — core proxy logic complete |
| 3: Integration | 9-12 | websocket.ts modified, hub-entry.ts wired, files.ts replaced, proxy-utils.ts cleaned — system integrated |
| 4: Frontend | 13-14 | LivePreview.tsx using postMessage, tests updated |
| 5: Verification | 15 | Full test suite, lint, build, manual smoke test |
