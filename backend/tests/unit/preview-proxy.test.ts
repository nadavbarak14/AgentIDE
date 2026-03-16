import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock http-proxy-3 to prevent real network connections in unit tests
vi.mock('http-proxy-3', () => ({
  createProxyServer: () => ({
    on: vi.fn(),
    web: vi.fn(),
    ws: vi.fn(),
  }),
}));

import {
  extractProxyContext,
  isNavigationRequest,
  PreviewCookieJar,
  rewriteLocationHeader,
  buildProxyInjectionHtml,
  createPreviewCatchAll,
  handleProxyWsUpgrade,
  type ProxyRepo,
} from '../../src/api/preview-proxy.js';

// ---------------------------------------------------------------------------
// extractProxyContext
// ---------------------------------------------------------------------------
describe('extractProxyContext', () => {
  it('returns null when no Referer and no cookie', () => {
    const req = { headers: {} } as any;
    expect(extractProxyContext(req)).toBeNull();
  });

  it('extracts sessionId and port from Referer with proxy pattern', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/api/sessions/abcdef-123/proxy/3000/index.html',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'abcdef-123', port: 3000 });
  });

  it('handles root proxy path in Referer', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/api/sessions/abcdef-123/proxy/8080/',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'abcdef-123', port: 8080 });
  });

  it('handles nested path in Referer', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/api/sessions/abcdef-123/proxy/5173/deep/nested/path?q=1',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'abcdef-123', port: 5173 });
  });

  it('returns null when Referer has no proxy pattern', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/dashboard',
      },
    } as any;
    expect(extractProxyContext(req)).toBeNull();
  });

  it('returns null when Referer has no proxy pattern (even with cookie)', () => {
    // CRITICAL: Referer-only extraction. No cookie fallback.
    // A non-proxy Referer means the request is from the Adyx dashboard.
    const req = {
      headers: {
        referer: 'http://localhost:4000/dashboard',
        cookie: '__c3_preview=sess-123:9090',
      },
    } as any;
    expect(extractProxyContext(req)).toBeNull();
  });

  it('returns null when no Referer even with cookie (no cookie fallback)', () => {
    // No Referer + cookie = still null. Cookie fallback was removed
    // because it hijacked main Adyx navigation on refresh/new tab.
    const req = {
      headers: {
        cookie: '__c3_preview=session-abc:4000; other=value',
      },
    } as any;
    expect(extractProxyContext(req)).toBeNull();
  });

  it('Referer with proxy pattern works even with conflicting cookie', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/api/sessions/aabbccdd/proxy/3000/',
        cookie: '__c3_preview=other-id:4000',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'aabbccdd', port: 3000 });
  });

  it('handles full UUID session IDs', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const req = {
      headers: {
        referer: `http://localhost:4000/api/sessions/${uuid}/proxy/3000/`,
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: uuid, port: 3000 });
  });

  it('returns null for cookie-only request (no cookie fallback)', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const req = {
      headers: {
        cookie: `__c3_preview=${uuid}:5000`,
      },
    } as any;
    // Cookie fallback removed — Referer is the only source
    expect(extractProxyContext(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isNavigationRequest
// ---------------------------------------------------------------------------
describe('isNavigationRequest', () => {
  it('returns true when Sec-Fetch-Mode is navigate', () => {
    const req = {
      method: 'GET',
      headers: { 'sec-fetch-mode': 'navigate' },
    } as any;
    expect(isNavigationRequest(req)).toBe(true);
  });

  it('returns false when Sec-Fetch-Mode is not navigate', () => {
    const req = {
      method: 'GET',
      headers: { 'sec-fetch-mode': 'no-cors' },
    } as any;
    expect(isNavigationRequest(req)).toBe(false);
  });

  it('falls back to Accept + method heuristic when no Sec-Fetch-Mode', () => {
    const req = {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml' },
    } as any;
    expect(isNavigationRequest(req)).toBe(true);
  });

  it('fallback: HEAD with text/html Accept is navigation', () => {
    const req = {
      method: 'HEAD',
      headers: { accept: 'text/html' },
    } as any;
    expect(isNavigationRequest(req)).toBe(true);
  });

  it('fallback: POST is NOT navigation (no Sec-Fetch-Mode)', () => {
    const req = {
      method: 'POST',
      headers: { accept: 'text/html' },
    } as any;
    expect(isNavigationRequest(req)).toBe(false);
  });

  it('fallback: X-Requested-With present means NOT navigation', () => {
    const req = {
      method: 'GET',
      headers: {
        accept: 'text/html',
        'x-requested-with': 'XMLHttpRequest',
      },
    } as any;
    expect(isNavigationRequest(req)).toBe(false);
  });

  it('Sec-Fetch-Mode takes precedence: navigate + X-Requested-With = still navigation', () => {
    const req = {
      method: 'GET',
      headers: {
        'sec-fetch-mode': 'navigate',
        'x-requested-with': 'XMLHttpRequest',
      },
    } as any;
    expect(isNavigationRequest(req)).toBe(true);
  });

  it('POST with Sec-Fetch-Mode: navigate IS navigation (form submit)', () => {
    const req = {
      method: 'POST',
      headers: { 'sec-fetch-mode': 'navigate' },
    } as any;
    expect(isNavigationRequest(req)).toBe(true);
  });

  it('returns false when no Accept or Sec-Fetch-Mode', () => {
    const req = {
      method: 'GET',
      headers: {},
    } as any;
    expect(isNavigationRequest(req)).toBe(false);
  });

  it('returns false when Accept does not contain text/html', () => {
    const req = {
      method: 'GET',
      headers: { accept: 'application/json' },
    } as any;
    expect(isNavigationRequest(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PreviewCookieJar
// ---------------------------------------------------------------------------
describe('PreviewCookieJar', () => {
  let jar: PreviewCookieJar;

  beforeEach(() => {
    jar = new PreviewCookieJar();
  });

  it('returns empty string when nothing stored', () => {
    expect(jar.get('s1', 3000)).toBe('');
  });

  it('stores and retrieves cookies from Set-Cookie header array', () => {
    jar.store('s1', 3000, [
      'session=abc123; Path=/; HttpOnly',
      'token=xyz; Secure',
    ]);
    const result = jar.get('s1', 3000);
    expect(result).toBe('session=abc123; token=xyz');
  });

  it('stores cookies from a single Set-Cookie string', () => {
    jar.store('s1', 3000, 'session=abc123; Path=/; HttpOnly');
    expect(jar.get('s1', 3000)).toBe('session=abc123');
  });

  it('handles undefined input gracefully', () => {
    jar.store('s1', 3000, undefined);
    expect(jar.get('s1', 3000)).toBe('');
  });

  it('overwrites cookies with same name', () => {
    jar.store('s1', 3000, ['session=old; Path=/']);
    jar.store('s1', 3000, ['session=new; Path=/']);
    expect(jar.get('s1', 3000)).toBe('session=new');
  });

  it('keeps cookies from different ports separate', () => {
    jar.store('s1', 3000, ['a=1']);
    jar.store('s1', 4000, ['b=2']);
    expect(jar.get('s1', 3000)).toBe('a=1');
    expect(jar.get('s1', 4000)).toBe('b=2');
  });

  it('keeps cookies from different sessions separate', () => {
    jar.store('s1', 3000, ['a=1']);
    jar.store('s2', 3000, ['b=2']);
    expect(jar.get('s1', 3000)).toBe('a=1');
    expect(jar.get('s2', 3000)).toBe('b=2');
  });

  it('clear removes all ports for a session', () => {
    jar.store('s1', 3000, ['a=1']);
    jar.store('s1', 4000, ['b=2']);
    jar.store('s2', 3000, ['c=3']);
    jar.clear('s1');
    expect(jar.get('s1', 3000)).toBe('');
    expect(jar.get('s1', 4000)).toBe('');
    expect(jar.get('s2', 3000)).toBe('c=3');
  });

  it('accumulates cookies across multiple store calls', () => {
    jar.store('s1', 3000, ['a=1']);
    jar.store('s1', 3000, ['b=2']);
    const result = jar.get('s1', 3000);
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });

  it('extracts name=value from before the first semicolon', () => {
    jar.store('s1', 3000, ['complex=val=ue; Path=/; Domain=.example.com; HttpOnly']);
    expect(jar.get('s1', 3000)).toBe('complex=val=ue');
  });
});

// ---------------------------------------------------------------------------
// rewriteLocationHeader
// ---------------------------------------------------------------------------
describe('rewriteLocationHeader', () => {
  const proxyBase = '/api/sessions/aabb/proxy/3000';
  const sessionId = 'aabb';

  it('rewrites absolute path /path to proxyBase + /path', () => {
    expect(rewriteLocationHeader('/dashboard', proxyBase, sessionId)).toBe(
      '/api/sessions/aabb/proxy/3000/dashboard',
    );
  });

  it('does not double-rewrite if already starts with proxyBase', () => {
    expect(
      rewriteLocationHeader('/api/sessions/aabb/proxy/3000/page', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/3000/page');
  });

  it('leaves protocol-relative URLs unchanged', () => {
    expect(rewriteLocationHeader('//cdn.example.com/lib.js', proxyBase, sessionId)).toBe(
      '//cdn.example.com/lib.js',
    );
  });

  it('rewrites http://localhost:PORT/path to proxy path', () => {
    expect(
      rewriteLocationHeader('http://localhost:3000/dashboard', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/3000/dashboard');
  });

  it('rewrites http://127.0.0.1:PORT/path to proxy path', () => {
    expect(
      rewriteLocationHeader('http://127.0.0.1:3000/page', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/3000/page');
  });

  it('rewrites localhost redirect to DIFFERENT port', () => {
    expect(
      rewriteLocationHeader('http://localhost:4000/new-page', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/4000/new-page');
  });

  it('rewrites 127.0.0.1 redirect to different port', () => {
    expect(
      rewriteLocationHeader('http://127.0.0.1:5173/vite', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/5173/vite');
  });

  it('rewrites external URLs through proxy-url endpoint', () => {
    const external = 'https://external.com/callback?code=123';
    const result = rewriteLocationHeader(external, proxyBase, sessionId);
    expect(result).toBe(
      `/api/sessions/aabb/proxy-url/${encodeURIComponent(external)}`,
    );
  });

  it('rewrites http:// external URLs through proxy-url endpoint', () => {
    const external = 'http://example.com/page';
    const result = rewriteLocationHeader(external, proxyBase, sessionId);
    expect(result).toBe(
      `/api/sessions/aabb/proxy-url/${encodeURIComponent(external)}`,
    );
  });

  it('handles localhost with no path', () => {
    expect(
      rewriteLocationHeader('http://localhost:3000', proxyBase, sessionId),
    ).toBe('/api/sessions/aabb/proxy/3000');
  });

  it('handles root path /', () => {
    expect(rewriteLocationHeader('/', proxyBase, sessionId)).toBe(
      '/api/sessions/aabb/proxy/3000/',
    );
  });
});

// ---------------------------------------------------------------------------
// buildProxyInjectionHtml
// ---------------------------------------------------------------------------
describe('buildProxyInjectionHtml', () => {
  const proxyBase = '/api/sessions/aabb/proxy/3000';

  it('returns HTML string with two script tags', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    const scriptMatches = html.match(/<script>/g) || [];
    expect(scriptMatches.length).toBe(2);
  });

  it('first script sets window.__c3ProxyBase__', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain(`window.__c3ProxyBase__="${proxyBase}"`);
  });

  it('second script is an IIFE', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('(function(){');
    expect(html).toContain('})()');
  });

  it('clears stale __c3_preview cookie', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('__c3_preview=');
    expect(html).toContain('max-age=0');
  });

  it('wraps history.pushState', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('history.pushState');
  });

  it('wraps history.replaceState', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('history.replaceState');
  });

  it('reports URL changes to parent via postMessage', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('parent.postMessage');
    expect(html).toContain('c3:proxy:urlchange');
  });

  it('listens for popstate events', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('popstate');
  });
});

// ---------------------------------------------------------------------------
// createPreviewCatchAll
// ---------------------------------------------------------------------------
describe('createPreviewCatchAll', () => {
  function makeRepo(sessions: Record<string, any> = {}, workers: Record<string, any> = {}): ProxyRepo {
    return {
      getSession: (id: string) => sessions[id] || null,
      getWorker: (id: string) => workers[id] || null,
    };
  }

  function makeReq(overrides: Record<string, any> = {}): any {
    return {
      method: 'GET',
      url: '/some-asset.js',
      headers: {},
      ...overrides,
    };
  }

  function makeRes(): any {
    const res: any = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };
    return res;
  }

  it('calls next() when no proxy context is found', () => {
    const repo = makeRepo();
    const middleware = createPreviewCatchAll(repo);
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('calls next() when session is not found', () => {
    const repo = makeRepo(); // no sessions
    const middleware = createPreviewCatchAll(repo);
    const req = makeReq({
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/page',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects navigation request with 302 for GET', () => {
    const repo = makeRepo({
      'abc-123': { id: 'abc-123', workerId: null },
    });
    const middleware = createPreviewCatchAll(repo);
    const req = makeReq({
      method: 'GET',
      url: '/page',
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/other',
        'sec-fetch-mode': 'navigate',
        accept: 'text/html',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, '/api/sessions/abc-123/proxy/3000/page');
  });

  it('redirects POST navigation with 307', () => {
    const repo = makeRepo({
      'abc-123': { id: 'abc-123', workerId: null },
    });
    const middleware = createPreviewCatchAll(repo);
    const req = makeReq({
      method: 'POST',
      url: '/submit',
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/form',
        'sec-fetch-mode': 'navigate',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(307, '/api/sessions/abc-123/proxy/3000/submit');
  });

  it('remote session always redirects, even for sub-resources', () => {
    const repo = makeRepo(
      { 'abc-123': { id: 'abc-123', workerId: 'w1' } },
      { 'w1': { id: 'w1', type: 'remote' } },
    );
    const middleware = createPreviewCatchAll(repo);
    // Sub-resource request (not navigation)
    const req = makeReq({
      method: 'GET',
      url: '/style.css',
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/page',
        'sec-fetch-mode': 'no-cors',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, '/api/sessions/abc-123/proxy/3000/style.css');
  });

  it('remote session uses 307 for non-GET/HEAD methods', () => {
    const repo = makeRepo(
      { 'abc-123': { id: 'abc-123', workerId: 'w1' } },
      { 'w1': { id: 'w1', type: 'remote' } },
    );
    const middleware = createPreviewCatchAll(repo);
    const req = makeReq({
      method: 'PUT',
      url: '/api/data',
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/page',
      },
    });
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(307, '/api/sessions/abc-123/proxy/3000/api/data');
  });

  it('local session sub-resource does NOT redirect (transparent proxy path)', () => {
    const repo = makeRepo({
      'abc-123': { id: 'abc-123', workerId: null },
    });
    const middleware = createPreviewCatchAll(repo);
    // Sub-resource request: sec-fetch-mode is not navigate
    const req = makeReq({
      method: 'GET',
      url: '/style.css',
      headers: {
        referer: 'http://localhost:4000/api/sessions/abc-123/proxy/3000/page',
        'sec-fetch-mode': 'no-cors',
      },
      // Need pipe method for proxy.web
      pipe: vi.fn(),
    });
    const res = makeRes();
    const next = vi.fn();

    // The transparent proxy path calls proxy.web() which would fail in unit tests.
    // We just verify it does NOT call next() or redirect.
    // It will throw because proxy.web can't actually connect, so we catch.
    try {
      middleware(req, res, next);
    } catch {
      // Expected: proxy.web can't connect in unit test
    }

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleProxyWsUpgrade
// ---------------------------------------------------------------------------
describe('handleProxyWsUpgrade', () => {
  function makeRepo(sessions: Record<string, any> = {}, workers: Record<string, any> = {}): ProxyRepo {
    return {
      getSession: (id: string) => sessions[id] || null,
      getWorker: (id: string) => workers[id] || null,
    };
  }

  it('destroys socket when neither URL match nor Referer context found', () => {
    const repo = makeRepo();
    const socket = { destroy: vi.fn() } as any;
    const req = { url: '/some/random/path', headers: {} } as any;

    handleProxyWsUpgrade(req, socket, Buffer.alloc(0), repo);

    expect(socket.destroy).toHaveBeenCalled();
  });

  it('does not destroy socket when URL matches proxy pattern', () => {
    const repo = makeRepo({
      'abc-123': { id: 'abc-123', workerId: null },
    });
    const socket = { destroy: vi.fn() } as any;
    const req = {
      url: '/api/sessions/abc-123/proxy/3000/ws',
      headers: {},
    } as any;

    // proxy.ws will fail in tests since there's no real server, but we can
    // verify socket.destroy is NOT called (the proxy path was entered)
    try {
      handleProxyWsUpgrade(req, socket, Buffer.alloc(0), repo);
    } catch {
      // Expected: proxy.ws fails in unit tests
    }

    expect(socket.destroy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Real-world scenario tests — covering bugs found during testing
// ---------------------------------------------------------------------------
describe('Real-world scenarios', () => {
  const HUB_PUBLIC = 'http://151.145.83.151:3005';
  const SESSION = 'abc-def-123';
  const PROXY_BASE = `/api/sessions/${SESSION}/proxy/3010`;

  describe('Adyx dashboard must NOT be hijacked by catch-all', () => {
    function makeRepo(): ProxyRepo {
      return {
        getSession: (id: string) => id === SESSION ? { id: SESSION, workerId: null } : null,
        getWorker: () => null,
      };
    }

    it('navigating the Adyx dashboard does not get caught (Referer is dashboard URL)', () => {
      // User clicks a link in the Adyx dashboard
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}/`,
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('loading Adyx settings page does not get caught', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}/settings`,
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('Adyx API calls do not get caught', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}/`,
          cookie: `__c3_preview=${SESSION}:3010; adyx_auth=sometoken`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('catch-all middleware passes through when Referer is Adyx (not proxy)', () => {
      const middleware = createPreviewCatchAll(makeRepo());
      const req = {
        method: 'GET',
        url: '/assets/main.js',
        headers: {
          referer: `${HUB_PUBLIC}/`,
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any;
      const res = { redirect: vi.fn() } as any;
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('Proxied app sub-resources use Referer correctly', () => {
    it('script loaded from proxy page has proxy Referer → caught', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}${PROXY_BASE}/login`,
        },
      } as any);
      expect(ctx).toEqual({ sessionId: SESSION, port: 3010 });
    });

    it('CSS loaded from proxy page has proxy Referer → caught', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}${PROXY_BASE}/`,
        },
      } as any);
      expect(ctx).toEqual({ sessionId: SESSION, port: 3010 });
    });

    it('fetch() from proxy page has proxy Referer → caught', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: `${HUB_PUBLIC}${PROXY_BASE}/dashboard`,
          'sec-fetch-mode': 'cors',
        },
      } as any);
      expect(ctx).toEqual({ sessionId: SESSION, port: 3010 });
    });
  });

  describe('No cookie fallback — Referer only', () => {
    it('no Referer + cookie → null (cookie fallback removed)', () => {
      const ctx = extractProxyContext({
        headers: {
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('empty Referer + cookie → null', () => {
      const ctx = extractProxyContext({
        headers: {
          referer: '',
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('page refresh with no Referer does NOT hijack main page', () => {
      // User refreshes Adyx dashboard — no Referer, cookie present
      const ctx = extractProxyContext({
        headers: {
          cookie: `__c3_preview=${SESSION}:3010; adyx_auth=sometoken`,
        },
      } as any);
      expect(ctx).toBeNull();
    });

    it('new tab open with no Referer does NOT hijack', () => {
      const ctx = extractProxyContext({
        headers: {
          cookie: `__c3_preview=${SESSION}:3010`,
        },
      } as any);
      expect(ctx).toBeNull();
    });
  });

  describe('Location header rewriting for login/auth flows', () => {
    it('internal redirect /login → proxy prefix /login', () => {
      expect(rewriteLocationHeader('/login', PROXY_BASE, SESSION))
        .toBe(`${PROXY_BASE}/login`);
    });

    it('internal redirect /dashboard → proxy prefix /dashboard', () => {
      expect(rewriteLocationHeader('/dashboard', PROXY_BASE, SESSION))
        .toBe(`${PROXY_BASE}/dashboard`);
    });

    it('localhost redirect after auth callback', () => {
      expect(rewriteLocationHeader('http://localhost:3010/dashboard?code=abc', PROXY_BASE, SESSION))
        .toBe(`/api/sessions/${SESSION}/proxy/3010/dashboard?code=abc`);
    });

    it('external OAuth redirect → proxy-url', () => {
      const oauthUrl = 'https://accounts.google.com/o/oauth2/auth?client_id=xxx&redirect_uri=http://localhost:3010/callback';
      const result = rewriteLocationHeader(oauthUrl, PROXY_BASE, SESSION);
      expect(result).toBe(`/api/sessions/${SESSION}/proxy-url/${encodeURIComponent(oauthUrl)}`);
    });

    it('already-proxied path not double-rewritten', () => {
      expect(rewriteLocationHeader(`${PROXY_BASE}/page`, PROXY_BASE, SESSION))
        .toBe(`${PROXY_BASE}/page`);
    });
  });

  describe('Navigation vs sub-resource detection', () => {
    it('Next.js RSC fetch is NOT navigation (Sec-Fetch-Mode: cors)', () => {
      expect(isNavigationRequest({
        method: 'GET',
        headers: {
          'sec-fetch-mode': 'cors',
          'rsc': '1',
          'accept': 'text/x-component',
        },
      } as any)).toBe(false);
    });

    it('clicking a link IS navigation (Sec-Fetch-Mode: navigate)', () => {
      expect(isNavigationRequest({
        method: 'GET',
        headers: {
          'sec-fetch-mode': 'navigate',
          'accept': 'text/html',
        },
      } as any)).toBe(true);
    });

    it('form POST IS navigation (Sec-Fetch-Mode: navigate)', () => {
      expect(isNavigationRequest({
        method: 'POST',
        headers: {
          'sec-fetch-mode': 'navigate',
          'accept': 'text/html',
        },
      } as any)).toBe(true);
    });

    it('script tag load is NOT navigation (Sec-Fetch-Mode: no-cors)', () => {
      expect(isNavigationRequest({
        method: 'GET',
        headers: {
          'sec-fetch-mode': 'no-cors',
          'accept': '*/*',
        },
      } as any)).toBe(false);
    });

    it('image load is NOT navigation', () => {
      expect(isNavigationRequest({
        method: 'GET',
        headers: {
          'sec-fetch-mode': 'no-cors',
          'accept': 'image/webp,image/apng,*/*',
        },
      } as any)).toBe(false);
    });
  });

  describe('buildProxyInjectionHtml includes fetch interceptor', () => {
    const html = buildProxyInjectionHtml(PROXY_BASE);

    it('intercepts fetch() to rewrite URLs through proxy', () => {
      expect(html).toContain('window.fetch=function');
    });

    it('intercepts XHR to rewrite URLs through proxy', () => {
      expect(html).toContain('XMLHttpRequest.prototype.open=function');
    });

    it('rewrites absolute paths starting with / to go through proxy base', () => {
      // The rw() function should prepend proxy base to absolute paths
      expect(html).toContain('u.startsWith("/")');
      expect(html).toContain('return b+u');
    });

    it('rewrites origin-prefixed paths to go through proxy base', () => {
      // e.g., http://hub:3005/dashboard → http://hub:3005/api/sessions/.../proxy/3010/dashboard
      expect(html).toContain('location.origin');
      expect(html).toContain('o+b+u.slice(o.length)');
    });

    it('strips proxy prefix from Next-URL header in fetch', () => {
      expect(html).toContain('Next-URL');
      expect(html).toContain('stripB');
    });
  });

  describe('Cookie jar stores and serves cookies correctly', () => {
    it('stores Supabase-style auth cookies', () => {
      const jar = new PreviewCookieJar();
      jar.store(SESSION, 3010, [
        'sb-access-token=eyJhbGciOi...; Path=/; HttpOnly; SameSite=Lax',
        'sb-refresh-token=abc123; Path=/; HttpOnly; SameSite=Lax',
      ]);
      const cookies = jar.get(SESSION, 3010);
      expect(cookies).toContain('sb-access-token=eyJhbGciOi...');
      expect(cookies).toContain('sb-refresh-token=abc123');
    });

    it('serves cookies for different sessions independently', () => {
      const jar = new PreviewCookieJar();
      jar.store('session-A', 3010, ['token=aaa']);
      jar.store('session-B', 3010, ['token=bbb']);
      expect(jar.get('session-A', 3010)).toBe('token=aaa');
      expect(jar.get('session-B', 3010)).toBe('token=bbb');
    });

    it('serves cookies for different ports independently', () => {
      const jar = new PreviewCookieJar();
      jar.store(SESSION, 3010, ['app=typenote']);
      jar.store(SESSION, 3000, ['app=bstat']);
      expect(jar.get(SESSION, 3010)).toBe('app=typenote');
      expect(jar.get(SESSION, 3000)).toBe('app=bstat');
    });
  });
});
