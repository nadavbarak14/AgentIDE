import { describe, it, expect } from 'vitest';
import { toProxyUrl } from '../../src/components/LivePreview';

const SESSION_ID = 'test-session-123';

describe('toProxyUrl', () => {
  describe('isLocalDirect = true (localhost hub + local session)', () => {
    it('returns original localhost URL unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000/', true))
        .toBe('http://localhost:3000/');
    });

    it('returns original localhost URL with path unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000/dashboard/settings', true))
        .toBe('http://localhost:3000/dashboard/settings');
    });

    it('returns original 127.0.0.1 URL unchanged', () => {
      expect(toProxyUrl(SESSION_ID, 'http://127.0.0.1:5173/app', true))
        .toBe('http://127.0.0.1:5173/app');
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

  describe('edge cases', () => {
    it('localhost without trailing slash gets default path', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000', false))
        .toBe(`/api/sessions/${SESSION_ID}/proxy/3000/`);
    });

    it('localhost without trailing slash preserved in direct mode', () => {
      expect(toProxyUrl(SESSION_ID, 'http://localhost:3000', true))
        .toBe('http://localhost:3000');
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
