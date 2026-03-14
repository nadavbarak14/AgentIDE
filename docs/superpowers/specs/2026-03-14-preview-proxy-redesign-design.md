# Preview Proxy Redesign — Referer Catch-All + http-proxy-3

**Date**: 2026-03-14
**Status**: Approved

## Problem

The current preview proxy is unstable. It uses ~300 lines of hand-rolled `http.request` code with a ~150-line client-side script that monkey-patches `fetch`, `XHR`, `URL`, `setAttribute`, `WebSocket`, `history`, `location`, and link click handlers. Every framework (Next.js, Vite, etc.) has patterns that break differently. WebSocket/HMR is blocked entirely. Cookie handling is fragile. Login/OAuth flows fail for remote users.

## Solution

Replace the hand-rolled proxy with `http-proxy-3` (maintained TypeScript rewrite of node-http-proxy) and add a **Referer-based catch-all middleware** that eliminates most client-side URL rewriting.

### Core Insight

When an iframe at `/api/sessions/{id}/proxy/3000/` loads resources, the browser includes the page URL as `Referer` on every sub-request. A server-side middleware intercepts "stray" requests (like `GET /bundle.js` with a proxy Referer) and routes them to the correct proxy target — no client-side interception needed.

## Architecture

### Components

1. **Referer catch-all middleware** (new) — early Express middleware
2. **Proxy route handler** (rewritten) — uses http-proxy-3
3. **WebSocket upgrade handler** (new) — proxies HMR/hot-reload
4. **Minimal client injection script** (~15 lines, replaces ~150 lines)
5. **Cookie jar** (simplified)

### Request Flows

#### Navigation Requests (page loads, link clicks, form submits)

Navigation requests change the iframe's document URL. They must be **redirected** to the proxy prefix path so that subsequent sub-resource Referers contain the proxy pattern.

```
1. User clicks <a href="/about"> in proxied app
2. Browser sends: GET /about
   Referer: http://server:24880/api/sessions/{id}/proxy/3000/page
3. Catch-all middleware detects: not a hub route + Referer has proxy pattern
4. Responds: 307 redirect → /api/sessions/{id}/proxy/3000/about
5. Browser follows redirect, iframe URL is now .../proxy/3000/about
6. Proxy route handler strips prefix, proxies to localhost:3000/about
7. HTML response: inject bridge script + minimal client script
8. All subsequent sub-resources have correct Referer
```

307 is used instead of 302 to preserve POST method and body for form submissions. GET navigations use 302.

#### Sub-Resource Requests (scripts, CSS, images, fetch, XHR)

Sub-resources don't change the iframe URL. They are **transparently proxied** (no redirect, no round-trip penalty).

```
1. Page HTML contains <script src="/bundle.js">
2. Browser sends: GET /bundle.js
   Referer: http://server:24880/api/sessions/{id}/proxy/3000/page
3. Catch-all middleware detects proxy context from Referer
4. Proxies directly to localhost:3000/bundle.js via http-proxy-3
5. Response streamed back transparently (no buffering, no rewriting)
```

#### WebSocket (HMR / Hot Reload)

WebSocket upgrade requests include a Referer header. The server intercepts the `upgrade` event and proxies via http-proxy-3's `.ws()` method.

```
1. Vite/Webpack client: new WebSocket('ws://server:24880/_next/webpack-hmr')
2. Upgrade request includes Referer from proxy page
3. Server catches upgrade event, extracts proxy context
4. proxy.ws(req, socket, head, { target: 'http://127.0.0.1:3000' })
5. HMR connection established — hot reload works!
```

#### App Redirects (including OAuth)

When the proxied app returns a redirect:

**Internal redirects** (Location starts with `/`):
```
App returns: 302 Location: /dashboard
Proxy rewrites: 302 Location: /api/sessions/{id}/proxy/3000/dashboard
Browser follows redirect within proxy prefix
```

**External redirects** (Location is an absolute external URL):
```
App returns: 302 Location: https://accounts.google.com/oauth?redirect_uri=...
Proxy rewrites: 302 Location: /api/sessions/{id}/proxy-url/https%3A%2F%2Faccounts.google.com%2F...
External page loads via proxy-url (X-Frame-Options stripped)
OAuth callback redirects back to http://localhost:3000/callback?code=abc
```

**OAuth callback handling**: The `proxy-url` route's Location header rewriter must detect localhost/127.0.0.1 targets in redirects and rewrite them to the port-based proxy path instead of another `proxy-url` (which would be SSRF-blocked by `isPrivateIp()`):
```
proxy-url sees: Location: http://localhost:3000/callback?code=abc
Rewrites to:    Location: /api/sessions/{id}/proxy/3000/callback?code=abc
                (NOT /api/sessions/{id}/proxy-url/http%3A...localhost... which would be blocked)
Browser follows redirect → proxy route handles it → OAuth flow completes
```

**Localhost redirects** (Location is `http://localhost:PORT/...` or `http://127.0.0.1:PORT/...`):
```
App returns: 302 Location: http://localhost:3000/new-page
Proxy rewrites: 302 Location: /api/sessions/{id}/proxy/3000/new-page
```

### Middleware Placement

```
Express middleware stack (hub-entry.ts):
1. Auth middleware (requireAuth)
2. Hub API routes (/api/sessions/..., /api/workers/..., /api/health, etc.)
3. Proxy route handler (/api/sessions/:id/proxy/:port/*)
4. Referer catch-all middleware  ← INSERT HERE (before static files)
5. Static files (express.static for frontend assets)
6. SPA fallback (app.get('*') serving index.html)
```

**Critical insertion point**: The catch-all MUST be placed before `express.static(frontendDist)` and the `app.get('*')` SPA fallback in `hub-entry.ts` (currently at line ~949). If placed after, the SPA fallback would consume every stray `GET /bundle.js` request and serve `index.html` instead of proxying.

The catch-all runs AFTER hub API routes and the proxy route handler, so there is no conflict with hub API endpoints. If the proxied app has an endpoint at `/api/users`, the hub's routes don't match it, and the catch-all handles it.

The catch-all also runs AFTER `requireAuth`, ensuring unauthenticated users cannot use Referer spoofing to access proxied services.

### Catch-All Middleware Logic

```
function previewProxyCatchAll(req, res, next):
  proxyContext = extractProxyContext(req)  // check Referer, then cookie fallback
  if (!proxyContext) return next()         // not a proxy request

  // Validate session exists and get worker info
  session = repo.getSession(proxyContext.sessionId)
  if (!session) return next()

  if (isNavigationRequest(req)):
    code = (req.method === 'GET' || req.method === 'HEAD') ? 302 : 307
    redirect(code, /api/sessions/{sessionId}/proxy/{port}{req.url})
  else:
    attachJarCookies(req, proxyContext)
    // Route to correct target based on session type
    target = getProxyTarget(session, proxyContext.port)  // localhost or SSH tunnel
    proxy.web(req, res, { target })
```

**Remote worker delegation**: When a stray request arrives for a remote session, the catch-all must route through the SSH tunnel (via `agentTunnelManager.getLocalPort(worker.id)`), not directly to `127.0.0.1:{port}` on the hub. The `getProxyTarget()` helper checks if the session is remote and returns the tunnel's local port if so.

**Navigation detection**: Uses `Sec-Fetch-Mode: navigate` (modern browsers) as primary signal. Fallback: `Accept: text/html` + GET method + no `X-Requested-With` header. The fallback is best-effort — it may misclassify some edge cases (e.g., API endpoints that return HTML), but `Sec-Fetch-Mode` is supported by all modern browsers and is reliable.

### Proxy Context Extraction

Priority order:
1. **Referer header**: Parse for pattern `/api/sessions/{uuid}/proxy/{port}/`. Extract sessionId and port.
2. **Cookie fallback**: When proxy serves HTML, set `__c3_preview={sessionId}:{port}; Path=/; HttpOnly`. Used when Referer is stripped (e.g., `referrerPolicy: no-referrer`).

### Proxy Route Handler (http-proxy-3)

```
const proxy = createProxyServer()

router.all('/:id/proxy/:port/*', (req, res) => {
  targetPort = req.params.port
  targetPath = '/' + req.params[0]
  req.url = targetPath + queryString

  attachJarCookies(req, sessionId, targetPort)

  // Determine target: localhost for local sessions, SSH tunnel port for remote
  target = getProxyTarget(session, targetPort)

  if (isHtmlNavigationRequest(req)):
    // Buffer response to inject bridge + client script
    proxy.web(req, res, { target, selfHandleResponse: true })
  else:
    // Transparent pipe
    proxy.web(req, res, { target })
})

proxy.on('proxyRes', (proxyRes, req, res) => {
  // Store Set-Cookie in jar, strip from response
  // Rewrite Location headers (/ → proxy prefix, external → proxy-url, localhost → proxy)
  // Strip X-Frame-Options, CSP, and Link preload headers (see below)
  // For HTML: inject bridge script + client script
  // For non-HTML: pipe through
})

proxy.on('error', (err, req, res) => {
  // Return 502 with helpful message: "Cannot connect to localhost:{port}"
})
```

**Link header preloads**: Strip `Link` preload headers from proxy responses rather than rewriting them. Preload hints trigger very early browser fetches that may arrive before the page Referer is established (no Referer = catch-all can't route them). The HTML `<link rel="preload">` tags in the page body still work because they fire after the document URL is set and sub-resource requests carry the correct Referer. This is a minor performance trade-off (no preload hints) for reliability.

**Turbopack/Webpack runtime chunks**: Dynamic `import()` calls carry the page URL as Referer, so the catch-all routes them correctly. The current `CHUNK_BASE_PATH` / `RUNTIME_PUBLIC_PATH` rewriting is no longer needed.

### WebSocket Upgrade Handler

**Conflict with existing handler**: The existing `setupWebSocket()` in `websocket.ts` (line 31) registers a `server.on('upgrade')` handler that **destroys** any socket not matching `/ws/sessions/:id` or `/ws/sessions/:id/shell` (line 60-62). This would kill HMR WebSocket connections before the proxy handler sees them.

**Fix**: Modify `setupWebSocket()` to accept a fallback callback. Instead of `socket.destroy()` for unmatched URLs, call the fallback which handles proxy WebSocket routing:

```
// In setupWebSocket() — replace socket.destroy() with:
if (!shellMatch && !claudeMatch) {
  if (proxyWsFallback) {
    proxyWsFallback(request, socket, head);  // delegate to proxy handler
  } else {
    socket.destroy();
  }
  return;
}

// The proxy WS fallback function:
function handleProxyWsUpgrade(req, socket, head):
  // Check 1: URL matches proxy pattern /api/sessions/{id}/proxy/{port}/...
  proxyMatch = req.url.match(/\/api\/sessions\/[^/]+\/proxy\/(\d+)(\/.*)/)
  if (proxyMatch):
    req.url = proxyMatch[2] || '/'
    proxy.ws(req, socket, head, { target: http://127.0.0.1:{port} })
    return

  // Check 2: Referer contains proxy pattern (stray WebSocket from catch-all)
  proxyContext = extractProxyContext(req)
  if (proxyContext):
    proxy.ws(req, socket, head, { target: http://127.0.0.1:{port} })
    return

  socket.destroy()  // truly unmatched
```

This keeps all upgrade logic in one place and avoids multiple `server.on('upgrade')` listeners competing for the same socket.

### Client Injection Script (~15 lines)

Injected into HTML navigation responses. Only handles `history.pushState/replaceState` (to keep iframe URL under proxy prefix during SPA navigation) and URL reporting to parent (for address bar sync).

```javascript
(function() {
  var b = "__PROXY_BASE__";

  // Keep iframe URL under proxy prefix during SPA navigation
  var oPS = history.pushState.bind(history);
  history.pushState = function(s, t, u) {
    if (u && typeof u === 'string' && u.startsWith('/') && !u.startsWith(b) && !u.startsWith('//'))
      u = b + u;
    return oPS(s, t, u);
  };
  var oRS = history.replaceState.bind(history);
  history.replaceState = function(s, t, u) {
    if (u && typeof u === 'string' && u.startsWith('/') && !u.startsWith(b) && !u.startsWith('//'))
      u = b + u;
    return oRS(s, t, u);
  };

  // Report clean URL to parent for address bar
  function report() {
    var p = location.pathname;
    if (p.startsWith(b)) p = p.slice(b.length) || '/';
    parent.postMessage({ type: 'c3:proxy:urlchange', path: p + location.search + location.hash }, location.origin);
  }
  window.addEventListener('popstate', report);
  report();
})();
```

### Cookie Handling

**Server-side cookie jar** (simplified from current):
- On proxy response: parse `Set-Cookie` headers, store name=value pairs in jar keyed by `sessionId:port`
- Strip `Set-Cookie` headers from response to browser (cookies stay server-side only)
- On proxy request: attach jar cookies to outgoing request via `Cookie` header
- Shared `attachJarCookies()` function used by both the proxy route handler and the catch-all middleware

No browser-cookie merging. No cookie path rewriting. The jar is the single source of truth.

### HTML Injection (for navigation responses only)

When `selfHandleResponse` is active for HTML navigation responses:
1. Buffer the response body
2. Decompress if needed (gzip/br/deflate)
3. Inject after `<head>`:
   - Proxy base variable: `<script>window.__c3ProxyBase__="..."</script>`
   - Client script (15 lines above)
4. Inject before `</head>`:
   - Bridge script tag: `<script src="/api/inspect-bridge.js?v=N"></script>`
5. Strip `<meta>` CSP tags
6. Recompress if client accepts gzip
7. Send response

No HTML attribute rewriting (`src`, `href`, `action`). No CSS `url()` rewriting. No JSON URL rewriting. The Referer catch-all handles all of these server-side.

## Local vs Remote Behavior

| Access from | Session type | Behavior |
|---|---|---|
| localhost / 127.0.0.1 | local worker | Direct iframe to `http://localhost:{port}`. No proxy at all. |
| localhost / 127.0.0.1 | remote worker | Proxy: hub → SSH tunnel → remote agent → localhost on remote |
| public IP / domain | local worker | Proxy via catch-all middleware + http-proxy-3 to localhost on server |
| public IP / domain | remote worker | Proxy via catch-all → hub → SSH tunnel → remote agent |
| any | external URL | `proxy-url` route fetches server-side, strips X-Frame-Options/CSP |

## What Gets Deleted

- `rewriteHtmlForProxy()` — the 100-line URL interceptor script (fetch, XHR, URL constructor, setAttribute, WebSocket dummy, location.assign, link click handler, history patches). Replaced by 15-line client script.
- `rewriteCssForProxy()` — CSS sub-resources routed by Referer middleware, no URL rewriting needed.
- Browser-cookie merging logic — jar is single source of truth.
- RSC redirect following code — navigations handled uniformly by redirect middleware and Location header rewriting.
- WebSocket blocking (dummy socket) — WebSocket actually proxied via http-proxy-3's `.ws()`.
- Raw `http.request` proxy code — replaced by http-proxy-3.
- `__c3ProxyBase__` consumer code on frontend (address bar sync uses postMessage instead).
- `cleanSetCookieHeaders()` path rewriting — cookies don't go to browser.

## New Dependency

- `http-proxy-3` — TypeScript rewrite of http-proxy by SageMath/CoCalc team. Fixes all known socket leaks. Used in production by CoCalc, JupyterHub, Vite. Supports WebSocket via `.ws()`. MIT license.

## Edge Cases

- **`referrerPolicy: no-referrer`**: Referer stripped. Cookie fallback (`__c3_preview`) provides proxy context. If the app actively sets `no-referrer` on the page, sub-resources lose Referer AND the cookie may point to wrong session in multi-session scenarios. This is rare and accepted.
- **Multiple simultaneous preview sessions**: Each session's cookie would overwrite the other. Referer is the primary mechanism (works per-iframe). Cookie is best-effort fallback only.
- **OAuth providers with JS-based iframe detection**: Some providers (not just header-based) detect iframes via JavaScript and refuse to render. No workaround exists for iframe-based previews. Accepted limitation.
- **Apps using `<base>` tag**: The app's own `<base>` tag could conflict with proxy routing. The catch-all middleware routes by Referer regardless of `<base>`, so this should not cause issues.
- **Apps listening on 0.0.0.0 vs 127.0.0.1**: The proxy always connects to `127.0.0.1:{port}`. Apps must be reachable on localhost. This is standard for dev servers.

## Frontend Changes

- `toProxyUrl()` in `LivePreview.tsx`: simplified. For local direct, return raw URL. For proxy, return `/api/sessions/{id}/proxy/{port}/` (same as now).
- `handleIframeLoad()`: listen for `c3:proxy:urlchange` postMessage from injected client script instead of parsing iframe location. Simpler, no cross-origin issues.
- Remove all `__c3ProxyBase__` consumers.
- Address bar updates driven by postMessage from client script.

## Testing Strategy

- Unit tests for `extractProxyContext()` (Referer parsing, cookie fallback)
- Unit tests for navigation detection (`isNavigationRequest()`)
- Unit tests for Location header rewriting (internal, external, localhost)
- Integration test: proxy route serves HTML with injected scripts
- Integration test: catch-all middleware redirects navigation, proxies sub-resources
- Integration test: WebSocket upgrade proxied correctly
- Integration test: cookie jar stores and attaches cookies
- Manual test: Next.js app with login flow through proxy
- Manual test: Vite app with HMR through proxy
- Manual test: OAuth redirect flow (Google/GitHub)
