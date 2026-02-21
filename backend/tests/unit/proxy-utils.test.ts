import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import {
  decompressBuffer,
  cleanSetCookieHeaders,
  rewriteHtmlForProxy,
  injectBridgeScript,
  isPrivateIp,
  MIME_TYPES,
  BRIDGE_SCRIPT_TAG,
} from '../../src/api/proxy-utils.js';

// ---------------------------------------------------------------------------
// BRIDGE_SCRIPT_TAG
// ---------------------------------------------------------------------------
describe('BRIDGE_SCRIPT_TAG', () => {
  it('is a script tag pointing to the inspect-bridge.js endpoint', () => {
    expect(BRIDGE_SCRIPT_TAG).toContain('<script');
    expect(BRIDGE_SCRIPT_TAG).toContain('src="/api/inspect-bridge.js');
    expect(BRIDGE_SCRIPT_TAG).toContain('data-c3-bridge');
    expect(BRIDGE_SCRIPT_TAG).toContain('</script>');
  });

  it('includes a version query parameter', () => {
    expect(BRIDGE_SCRIPT_TAG).toMatch(/\?v=\d+/);
  });
});

// ---------------------------------------------------------------------------
// decompressBuffer
// ---------------------------------------------------------------------------
describe('decompressBuffer', () => {
  const original = 'Hello, compressed world!';

  it('decompresses gzip-encoded buffers', () => {
    const compressed = zlib.gzipSync(Buffer.from(original));
    const result = decompressBuffer(compressed, 'gzip');
    expect(result.toString()).toBe(original);
  });

  it('decompresses brotli-encoded buffers', () => {
    const compressed = zlib.brotliCompressSync(Buffer.from(original));
    const result = decompressBuffer(compressed, 'br');
    expect(result.toString()).toBe(original);
  });

  it('decompresses deflate-encoded buffers', () => {
    const compressed = zlib.deflateSync(Buffer.from(original));
    const result = decompressBuffer(compressed, 'deflate');
    expect(result.toString()).toBe(original);
  });

  it('returns the buffer unchanged for unknown encodings', () => {
    const buf = Buffer.from(original);
    const result = decompressBuffer(buf, 'identity');
    expect(result.toString()).toBe(original);
    // Should be the exact same buffer reference
    expect(result).toBe(buf);
  });

  it('handles encoding strings that contain the keyword among other text', () => {
    // e.g. "x-gzip" still contains "gzip"
    const compressed = zlib.gzipSync(Buffer.from(original));
    const result = decompressBuffer(compressed, 'x-gzip');
    expect(result.toString()).toBe(original);
  });

  it('handles empty buffers for gzip', () => {
    const compressed = zlib.gzipSync(Buffer.from(''));
    const result = decompressBuffer(compressed, 'gzip');
    expect(result.toString()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// cleanSetCookieHeaders
// ---------------------------------------------------------------------------
describe('cleanSetCookieHeaders', () => {
  it('returns empty array for undefined input', () => {
    expect(cleanSetCookieHeaders(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    // An empty string is still a header, so it's returned
    const result = cleanSetCookieHeaders('');
    expect(result).toEqual([]);
  });

  it('handles a single Set-Cookie string', () => {
    const result = cleanSetCookieHeaders('session=abc; Path=/');
    expect(result).toEqual(['session=abc; Path=/']);
  });

  it('handles an array of Set-Cookie strings', () => {
    const result = cleanSetCookieHeaders(['a=1', 'b=2']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('a=1');
    expect(result[1]).toBe('b=2');
  });

  it('strips Domain attribute', () => {
    const result = cleanSetCookieHeaders('session=abc; Domain=example.com; Path=/');
    expect(result[0]).not.toContain('Domain');
    expect(result[0]).toContain('session=abc');
    expect(result[0]).toContain('Path=/');
  });

  it('strips Domain attribute case-insensitively', () => {
    const result = cleanSetCookieHeaders('session=abc; DOMAIN=.example.com; Path=/');
    expect(result[0]).not.toMatch(/domain/i);
  });

  it('strips Secure flag', () => {
    const result = cleanSetCookieHeaders('session=abc; Secure; Path=/');
    expect(result[0]).not.toMatch(/secure/i);
    expect(result[0]).toContain('session=abc');
  });

  it('strips Secure flag case-insensitively', () => {
    const result = cleanSetCookieHeaders('session=abc; SECURE; Path=/');
    expect(result[0]).not.toMatch(/secure/i);
  });

  it('rewrites SameSite=None to SameSite=Lax', () => {
    const result = cleanSetCookieHeaders('session=abc; SameSite=None; Secure; Path=/');
    expect(result[0]).toContain('SameSite=Lax');
    expect(result[0]).not.toMatch(/samesite\s*=\s*none/i);
    // Secure should also be stripped
    expect(result[0]).not.toMatch(/;\s*secure/i);
  });

  it('does not modify SameSite=Lax or SameSite=Strict', () => {
    const lax = cleanSetCookieHeaders('session=abc; SameSite=Lax; Path=/');
    expect(lax[0]).toContain('SameSite=Lax');

    const strict = cleanSetCookieHeaders('session=abc; SameSite=Strict; Path=/');
    expect(strict[0]).toContain('SameSite=Strict');
  });

  it('strips both Domain and Secure while fixing SameSite on same cookie', () => {
    const input = 'token=xyz; Domain=.app.com; Secure; SameSite=None; Path=/; HttpOnly';
    const result = cleanSetCookieHeaders(input);
    expect(result[0]).not.toMatch(/domain/i);
    expect(result[0]).not.toMatch(/;\s*secure/i);
    expect(result[0]).toContain('SameSite=Lax');
    expect(result[0]).toContain('token=xyz');
    expect(result[0]).toContain('HttpOnly');
  });

  it('processes multiple cookies independently', () => {
    const result = cleanSetCookieHeaders([
      'a=1; Domain=foo.com; Secure',
      'b=2; SameSite=None; Secure',
      'c=3; Path=/',
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]).not.toMatch(/domain/i);
    expect(result[0]).not.toMatch(/;\s*secure/i);
    expect(result[1]).toContain('SameSite=Lax');
    expect(result[2]).toBe('c=3; Path=/');
  });
});

// ---------------------------------------------------------------------------
// rewriteHtmlForProxy
// ---------------------------------------------------------------------------
describe('rewriteHtmlForProxy', () => {
  const proxyBase = '/api/sessions/s1/proxy/3000';

  it('rewrites src attributes with absolute paths', () => {
    const html = '<img src="/images/logo.png">';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`src="${proxyBase}/images/logo.png"`);
  });

  it('rewrites action attributes with absolute paths', () => {
    const html = '<form action="/submit">';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`action="${proxyBase}/submit"`);
  });

  it('rewrites href on <link> elements', () => {
    const html = '<link rel="stylesheet" href="/styles/main.css">';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`href="${proxyBase}/styles/main.css"`);
  });

  it('does NOT rewrite href on <a> elements', () => {
    const html = '<head></head><a href="/about">About</a>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    // The anchor href should remain as-is (not rewritten by the static regex)
    // but the click interceptor script handles navigation at runtime
    expect(result).toContain('href="/about"');
  });

  it('does not rewrite protocol-relative URLs (//...)', () => {
    const html = '<script src="//cdn.example.com/lib.js"></script>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain('src="//cdn.example.com/lib.js"');
  });

  it('handles single-quoted attribute values', () => {
    const html = "<img src='/images/logo.png'>";
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`src='${proxyBase}/images/logo.png'`);
  });

  it('rewrites escaped JSON URLs for Next.js RSC payloads', () => {
    const html = '<script>{"url":"\\"/_next/data/build/page.json\\""}</script>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`\\"${proxyBase}/_next/data/build/page.json\\"`);
  });

  it('rewrites array-style JSON URLs for Next.js', () => {
    const html = '<script>["/_next/static/chunks/main.js"</script>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`["${proxyBase}/_next/static/chunks/main.js"`);
  });

  it('strips Content-Security-Policy meta tags', () => {
    const html = '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).not.toMatch(/Content-Security-Policy/i);
  });

  it('injects the URL rewriter script after <head>', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    // The URL rewriter script should appear after <head>
    const headIdx = result.indexOf('<head>');
    const scriptIdx = result.indexOf('<script>(function(){');
    expect(scriptIdx).toBeGreaterThan(headIdx);
  });

  it('injects URL rewriter after <head> with attributes', () => {
    const html = '<html><head lang="en"><title>Test</title></head><body></body></html>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    const headIdx = result.indexOf('<head lang="en">');
    const scriptIdx = result.indexOf('<script>(function(){');
    expect(scriptIdx).toBeGreaterThan(headIdx);
  });

  it('prepends URL rewriter if no <head> tag exists', () => {
    const html = '<div>No head tag here</div>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result.startsWith('<script>(function(){')).toBe(true);
  });

  it('injects bridge script tag', () => {
    const html = '<html><head></head><body></body></html>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(BRIDGE_SCRIPT_TAG);
  });

  it('includes the proxyBase in the URL rewriter var', () => {
    const html = '<head></head>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain(`var b="${proxyBase}"`);
  });

  it('contains fetch interceptor logic', () => {
    const html = '<head></head>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain('window.fetch=function');
    expect(result).toContain('XMLHttpRequest.prototype.open');
  });

  it('contains history.pushState/replaceState interceptors', () => {
    const html = '<head></head>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain('history.pushState');
    expect(result).toContain('history.replaceState');
  });

  it('contains WebSocket interceptor for HMR suppression', () => {
    const html = '<head></head>';
    const result = rewriteHtmlForProxy(html, proxyBase);
    expect(result).toContain('window.WebSocket');
    expect(result).toContain('webpack-hmr');
    expect(result).toContain('turbopack');
  });
});

// ---------------------------------------------------------------------------
// injectBridgeScript
// ---------------------------------------------------------------------------
describe('injectBridgeScript', () => {
  it('injects before </head> when present', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = injectBridgeScript(html);
    expect(result).toContain(BRIDGE_SCRIPT_TAG + '</head>');
  });

  it('injects before </body> when no </head> is present', () => {
    const html = '<html><body><p>Content</p></body></html>';
    const result = injectBridgeScript(html);
    expect(result).toContain(BRIDGE_SCRIPT_TAG + '</body>');
    expect(result).not.toContain(BRIDGE_SCRIPT_TAG + '</head>');
  });

  it('appends to the end when neither </head> nor </body> is present', () => {
    const html = '<div>Fragment</div>';
    const result = injectBridgeScript(html);
    expect(result).toBe(html + BRIDGE_SCRIPT_TAG);
  });

  it('prefers </head> over </body> when both are present', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectBridgeScript(html);
    // Should inject before </head>
    expect(result).toContain(BRIDGE_SCRIPT_TAG + '</head>');
    // Should NOT duplicate before </body>
    const count = result.split(BRIDGE_SCRIPT_TAG).length - 1;
    expect(count).toBe(1);
  });

  it('handles empty string input', () => {
    const result = injectBridgeScript('');
    expect(result).toBe(BRIDGE_SCRIPT_TAG);
  });
});

// ---------------------------------------------------------------------------
// isPrivateIp
// ---------------------------------------------------------------------------
describe('isPrivateIp', () => {
  describe('IPv4 private ranges', () => {
    it('detects 127.0.0.0/8 loopback', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
      expect(isPrivateIp('127.0.0.0')).toBe(true);
    });

    it('detects 10.0.0.0/8', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
      expect(isPrivateIp('10.0.0.0')).toBe(true);
    });

    it('detects 172.16.0.0/12', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('172.20.0.1')).toBe(true);
    });

    it('does not flag 172.15.x.x or 172.32.x.x as private', () => {
      expect(isPrivateIp('172.15.0.1')).toBe(false);
      expect(isPrivateIp('172.32.0.1')).toBe(false);
    });

    it('detects 192.168.0.0/16', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('192.168.255.255')).toBe(true);
      expect(isPrivateIp('192.168.1.100')).toBe(true);
    });

    it('detects 169.254.0.0/16 (link-local / cloud metadata)', () => {
      expect(isPrivateIp('169.254.0.1')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true);
    });

    it('detects 0.0.0.0/8', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      expect(isPrivateIp('0.1.2.3')).toBe(true);
    });

    it('allows public IPv4 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
      expect(isPrivateIp('203.0.113.1')).toBe(false);
    });
  });

  describe('IPv6 private ranges', () => {
    it('detects ::1 loopback', () => {
      expect(isPrivateIp('::1')).toBe(true);
    });

    it('detects fd00::/8 unique local addresses', () => {
      expect(isPrivateIp('fd00::1')).toBe(true);
      expect(isPrivateIp('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
    });

    it('detects fe80::/10 link-local addresses', () => {
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('fe80::abcd:ef01:2345:6789')).toBe(true);
    });

    it('detects ::ffff:127.x.x.x IPv4-mapped loopback', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:127.255.255.255')).toBe(true);
    });

    it('allows public IPv6 addresses', () => {
      expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
      expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for non-IP strings', () => {
      expect(isPrivateIp('not-an-ip')).toBe(false);
      expect(isPrivateIp('')).toBe(false);
      expect(isPrivateIp('example.com')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// MIME_TYPES
// ---------------------------------------------------------------------------
describe('MIME_TYPES', () => {
  it('maps .html and .htm to text/html', () => {
    expect(MIME_TYPES['.html']).toBe('text/html');
    expect(MIME_TYPES['.htm']).toBe('text/html');
  });

  it('maps .css to text/css', () => {
    expect(MIME_TYPES['.css']).toBe('text/css');
  });

  it('maps .js and .mjs to application/javascript', () => {
    expect(MIME_TYPES['.js']).toBe('application/javascript');
    expect(MIME_TYPES['.mjs']).toBe('application/javascript');
  });

  it('maps .json to application/json', () => {
    expect(MIME_TYPES['.json']).toBe('application/json');
  });

  it('maps image extensions correctly', () => {
    expect(MIME_TYPES['.png']).toBe('image/png');
    expect(MIME_TYPES['.jpg']).toBe('image/jpeg');
    expect(MIME_TYPES['.jpeg']).toBe('image/jpeg');
    expect(MIME_TYPES['.gif']).toBe('image/gif');
    expect(MIME_TYPES['.svg']).toBe('image/svg+xml');
    expect(MIME_TYPES['.ico']).toBe('image/x-icon');
    expect(MIME_TYPES['.webp']).toBe('image/webp');
  });

  it('maps font extensions correctly', () => {
    expect(MIME_TYPES['.woff']).toBe('font/woff');
    expect(MIME_TYPES['.woff2']).toBe('font/woff2');
    expect(MIME_TYPES['.ttf']).toBe('font/ttf');
  });

  it('maps .pdf to application/pdf', () => {
    expect(MIME_TYPES['.pdf']).toBe('application/pdf');
  });

  it('maps plain text extensions to text/plain', () => {
    expect(MIME_TYPES['.txt']).toBe('text/plain');
    expect(MIME_TYPES['.md']).toBe('text/plain');
    expect(MIME_TYPES['.ts']).toBe('text/plain');
    expect(MIME_TYPES['.tsx']).toBe('text/plain');
    expect(MIME_TYPES['.jsx']).toBe('text/plain');
  });

  it('maps .xml to application/xml', () => {
    expect(MIME_TYPES['.xml']).toBe('application/xml');
  });

  it('returns undefined for unmapped extensions', () => {
    expect(MIME_TYPES['.zip']).toBeUndefined();
    expect(MIME_TYPES['.exe']).toBeUndefined();
    expect(MIME_TYPES['.mp4']).toBeUndefined();
  });
});
