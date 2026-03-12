import { describe, it, expect } from 'vitest';
import { toProxyUrl } from '../../src/components/LivePreview';

const SESSION_ID = 'test-session-123';

describe('toProxyUrl', () => {
  describe('isLocalDirect = true (localhost hub + local session)', () => {
    // Use port 8080 — a port that won't match jsdom's window.location.port
    it('returns original localhost URL unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:8080/', true))
        .toBe('http://localhost:8080/');
    });

    it('returns original localhost URL with path unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:8080/dashboard/settings', true))
        .toBe('http://localhost:8080/dashboard/settings');
    });

    it('returns original 127.0.0.1 URL unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://127.0.0.1:5173/app', true))
        .toBe('http://127.0.0.1:5173/app');
    });

    it('proxies self-referential URL (same port as hub) even in direct mode', () => {
      // window.location.port in jsdom matches the test env port (e.g. 3000),
      // so hitting that port should always go through the proxy to strip X-Frame-Options
      const hubPort = window.location.port || '80';
      expect(toProxyUrl(SESSION_ID, `http://localhost:${hubPort}/`, true))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/${hubPort}/`);
    });

    it('still proxies project:// URLs', () => {
      expect(toProxyUrl(SESSION_ID, 'project://index.html', true))
        .toBe(`/api/sessions/${SESSION_ID}/serve/index.html`);
    });

    it('still proxies external https:// URLs', () => {
      expect(toProxyUrl(SESSION_ID, 'https://example.com/page', true))
        .toBe(`/api/sessions/${SESSION_ID}/proxy-url/${encodeURIComponent('https://example.com/page')}`);
    });
  });

  describe('isLocalDirect = false (remote hub or remote session)', () => {
    it('proxies localhost URL through backend', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000/', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/3000/`);
    });

    it('proxies localhost URL with path through backend', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:8080/api/users', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/8080/api/users`);
    });

    it('proxies 127.0.0.1 URL through backend', () => {
      expect(toProxyUrl(SESSION_ID, 'http://127.0.0.1:5173/', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/`);
    });

    it('proxies project:// URLs', () => {
      expect(toProxyUrl(SESSION_ID, 'project://index.html', false))
        .toBe(`/api/sessions/${SESSION_ID}/serve/index.html`);
    });

    it('proxies external https:// URLs', () => {
      expect(toProxyUrl(SESSION_ID, 'https://example.com/page', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy-url/${encodeURIComponent('https://example.com/page')}`);
    });
  });

  describe('same-host URLs (mobile accessing via non-localhost address)', () => {
    it('proxies same-host URL through port-based proxy instead of proxy-url (private IP)', () => {
      const origHostname = window.location.hostname;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: '192.168.1.100', port: '3000' },
        writable: true,
      });
      try {
        expect(toProxyUrl(SESSION_ID, 'http://192.168.1.100:5173/', false))
          .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/`);
        expect(toProxyUrl(SESSION_ID, 'http://192.168.1.100:5173/dashboard', false))
          .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/dashboard`);
      } finally {
        Object.defineProperty(window, 'location', {
          value: { ...window.location, hostname: origHostname },
          writable: true,
        });
      }
    });

    it('proxies same-host URL through port-based proxy (public IP)', () => {
      const origHostname = window.location.hostname;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: '132.145.50.20', port: '3000' },
        writable: true,
      });
      try {
        expect(toProxyUrl(SESSION_ID, 'http://132.145.50.20:5173/', false))
          .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/`);
        expect(toProxyUrl(SESSION_ID, 'http://132.145.50.20:5173/api/data', false))
          .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/api/data`);
      } finally {
        Object.defineProperty(window, 'location', {
          value: { ...window.location, hostname: origHostname },
          writable: true,
        });
      }
    });

    it('does not match different host as same-host', () => {
      const origHostname = window.location.hostname;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: '192.168.1.100', port: '3000' },
        writable: true,
      });
      try {
        // Different IP should go through proxy-url
        expect(toProxyUrl(SESSION_ID, 'http://192.168.1.200:5173/', false))
          .toBe(`/api/sessions/${SESSION_ID}/proxy-url/${encodeURIComponent('http://192.168.1.200:5173/')}`);
      } finally {
        Object.defineProperty(window, 'location', {
          value: { ...window.location, hostname: origHostname },
          writable: true,
        });
      }
    });
  });

  describe('edge cases', () => {
    it('handles capitalized Localhost from mobile browsers', () => {
      expect(toProxyUrl(SESSION_ID, 'http://Localhost:3000/', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/3000/`);
      expect(toProxyUrl(SESSION_ID, 'http://LOCALHOST:5173/app', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/5173/app`);
    });

    it('localhost without trailing slash gets default path', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/3000/`);
    });

    it('localhost without trailing slash preserved in direct mode', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:8080', true))
        .toBe('http://localhost:8080');
    });

    it('returns non-matching URLs as-is', () => {
      expect(toProxyUrl(SESSION_ID, 'ftp://files.local/data', false))
        .toBe('ftp://files.local/data');
    });

    it('project://local returns empty serve path', () => {
      expect(toProxyUrl(SESSION_ID, 'project://local', true))
        .toBe(`/api/sessions/${SESSION_ID}/serve/`);
    });
  });
});
