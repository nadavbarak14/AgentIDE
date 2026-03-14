import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractProxyContext,
  isNavigationRequest,
  PreviewCookieJar,
  rewriteLocationHeader,
  buildProxyInjectionHtml,
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

  it('falls back to __c3_preview cookie when no Referer', () => {
    const req = {
      headers: {
        cookie: '__c3_preview=session-abc:4000; other=value',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'session-abc', port: 4000 });
  });

  it('falls back to cookie when Referer has no proxy pattern', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/dashboard',
        cookie: '__c3_preview=sess-123:9090',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'sess-123', port: 9090 });
  });

  it('Referer takes priority over cookie', () => {
    const req = {
      headers: {
        referer: 'http://localhost:4000/api/sessions/aabbccdd/proxy/3000/',
        cookie: '__c3_preview=other-id:4000',
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: 'aabbccdd', port: 3000 });
  });

  it('returns null for malformed cookie value', () => {
    const req = {
      headers: {
        cookie: '__c3_preview=malformed',
      },
    } as any;
    expect(extractProxyContext(req)).toBeNull();
  });

  it('returns null for cookie with non-numeric port', () => {
    const req = {
      headers: {
        cookie: '__c3_preview=session:abc',
      },
    } as any;
    expect(extractProxyContext(req)).toBeNull();
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

  it('handles cookie with UUID session ID', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const req = {
      headers: {
        cookie: `__c3_preview=${uuid}:5000`,
      },
    } as any;
    const result = extractProxyContext(req);
    expect(result).toEqual({ sessionId: uuid, port: 5000 });
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

  it('sets __c3_preview cookie from proxyBase', () => {
    const html = buildProxyInjectionHtml(proxyBase);
    expect(html).toContain('__c3_preview=');
    expect(html).toContain('aabb:3000');
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
