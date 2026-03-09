import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { requireAuth } from '../../src/api/middleware.js';
import {
  hashKey,
  generateAccessKey,
  generateCookieSecret,
  createCookieValue,
} from '../../src/services/auth-service.js';
import type { Request, Response, NextFunction } from 'express';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '192.168.1.100',
    socket: { remoteAddress: '192.168.1.100' },
    path: '/api/sessions',
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & {
  _status: number;
  _json: unknown;
  _redirect: string;
  _clearedCookies: string[];
} {
  const res = {
    _status: 200,
    _json: null,
    _redirect: '',
    _clearedCookies: [],
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    redirect(url: string) {
      res._redirect = url;
    },
    clearCookie(name: string) {
      res._clearedCookies.push(name);
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

describe('requireAuth middleware', () => {
  let repo: Repository;
  let cookieSecret: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);

    // Store a real auth config
    const accessKey = generateAccessKey();
    const keyHash = hashKey(accessKey);
    cookieSecret = generateCookieSecret();
    repo.setAuthConfig(keyHash, cookieSecret);
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // Localhost bypass
  // ---------------------------------------------------------------------------
  describe('localhost bypass', () => {
    it('bypasses auth for 127.0.0.1', () => {
      const req = createMockReq({ ip: '127.0.0.1' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res._status).toBe(200);
      expect(res._json).toBeNull();
      expect(res._redirect).toBe('');
    });

    it('bypasses auth for ::1', () => {
      const req = createMockReq({ ip: '::1' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('bypasses auth for ::ffff:127.0.0.1', () => {
      const req = createMockReq({ ip: '::ffff:127.0.0.1' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it('bypasses auth for localhost via socket.remoteAddress when ip is undefined', () => {
      const req = createMockReq({
        ip: undefined as unknown as string,
        socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Valid cookie
  // ---------------------------------------------------------------------------
  describe('valid cookie', () => {
    it('passes through with a valid cookie', () => {
      const validCookie = createCookieValue(cookieSecret);
      const req = createMockReq({
        cookies: { adyx_auth: validCookie },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res._status).toBe(200);
      expect(res._json).toBeNull();
      expect(res._redirect).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Missing cookie
  // ---------------------------------------------------------------------------
  describe('missing cookie', () => {
    it('returns 401 for API routes when no cookie', () => {
      const req = createMockReq({ path: '/api/sessions' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Authentication required' });
    });

    it('redirects to /login for non-API routes when no cookie', () => {
      const req = createMockReq({ path: '/dashboard' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._redirect).toBe('/login');
    });

    it('redirects to /login for root path when no cookie', () => {
      const req = createMockReq({ path: '/' });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._redirect).toBe('/login');
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid/expired cookie
  // ---------------------------------------------------------------------------
  describe('invalid cookie', () => {
    it('returns 401 for API routes with expired cookie', () => {
      // Create a cookie that is already expired (issued 31 days ago)
      const payload = JSON.stringify({
        authenticated: true,
        issuedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      });
      const payloadB64 = Buffer.from(payload).toString('base64url');
      const hmac = crypto
        .createHmac('sha256', cookieSecret)
        .update(payloadB64)
        .digest('base64url');
      const expiredCookie = `${payloadB64}.${hmac}`;

      const req = createMockReq({
        path: '/api/sessions',
        cookies: { adyx_auth: expiredCookie },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid or expired session' });
      expect(res._clearedCookies).toContain('adyx_auth');
    });

    it('redirects to /login for non-API routes with expired cookie', () => {
      const payload = JSON.stringify({
        authenticated: true,
        issuedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      });
      const payloadB64 = Buffer.from(payload).toString('base64url');
      const hmac = crypto
        .createHmac('sha256', cookieSecret)
        .update(payloadB64)
        .digest('base64url');
      const expiredCookie = `${payloadB64}.${hmac}`;

      const req = createMockReq({
        path: '/dashboard',
        cookies: { adyx_auth: expiredCookie },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._redirect).toBe('/login');
      expect(res._clearedCookies).toContain('adyx_auth');
    });
  });

  // ---------------------------------------------------------------------------
  // Tampered cookie
  // ---------------------------------------------------------------------------
  describe('tampered cookie', () => {
    it('returns 401 for tampered payload', () => {
      const validCookie = createCookieValue(cookieSecret);
      const [, hmac] = validCookie.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ authenticated: true, issuedAt: Date.now() + 999999 })
      ).toString('base64url');
      const tamperedCookie = `${tamperedPayload}.${hmac}`;

      const req = createMockReq({
        path: '/api/sessions',
        cookies: { adyx_auth: tamperedCookie },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid or expired session' });
      expect(res._clearedCookies).toContain('adyx_auth');
    });

    it('returns 401 for completely bogus cookie', () => {
      const req = createMockReq({
        path: '/api/sessions',
        cookies: { adyx_auth: 'totally-garbage-cookie' },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid or expired session' });
      expect(res._clearedCookies).toContain('adyx_auth');
    });

    it('returns 401 for cookie signed with wrong secret', () => {
      const wrongSecret = generateCookieSecret();
      const wrongCookie = createCookieValue(wrongSecret);

      const req = createMockReq({
        path: '/api/sessions',
        cookies: { adyx_auth: wrongCookie },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo)(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res._status).toBe(401);
      expect(res._json).toEqual({ error: 'Invalid or expired session' });
      expect(res._clearedCookies).toContain('adyx_auth');
    });
  });

  // ---------------------------------------------------------------------------
  // No auth config in DB
  // ---------------------------------------------------------------------------
  describe('no auth config', () => {
    it('allows through when no auth config is stored', () => {
      // Create a fresh repo with no auth config
      const db2 = createTestDb();
      const repo2 = new Repository(db2);
      // Don't set auth config — repo2.getAuthConfig() will return null

      const req = createMockReq({
        cookies: { adyx_auth: 'any-cookie-value' },
      });
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      requireAuth(repo2)(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });
});
