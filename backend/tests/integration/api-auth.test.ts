import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createAuthRouter } from '../../src/api/routes/auth.js';
import { generateAccessKey, hashKey, generateCookieSecret } from '../../src/services/auth-service.js';

/**
 * Middleware to simulate a non-localhost IP for testing.
 * When the `X-Test-Remote-Ip` header is present, override req.ip and
 * req.socket.remoteAddress so the auth route sees a remote address.
 */
function fakeRemoteIp(): express.RequestHandler {
  return (req, _res, next) => {
    const fakeIp = req.headers['x-test-remote-ip'] as string | undefined;
    if (fakeIp) {
      Object.defineProperty(req, 'ip', { value: fakeIp, writable: true });
      if (req.socket) {
        Object.defineProperty(req.socket, 'remoteAddress', { value: fakeIp, writable: true });
      }
    }
    next();
  };
}

describe('Auth API', () => {
  let app: express.Express;
  let repo: Repository;
  let accessKey: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);

    // Generate and store an access key
    accessKey = generateAccessKey();
    const keyHash = hashKey(accessKey);
    const cookieSecret = generateCookieSecret();
    repo.setAuthConfig(keyHash, cookieSecret);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(fakeRemoteIp());
    app.use('/api/auth', createAuthRouter(repo));
  });

  afterEach(() => {
    closeDb();
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 and sets adyx_auth cookie with correct key', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: true });

      // Verify set-cookie header contains adyx_auth
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('adyx_auth');
    });

    it('returns 401 with wrong key', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ accessKey: 'wrong-key-value' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid access key');
    });

    it('returns 400 with missing accessKey', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing accessKey');
    });
  });

  describe('GET /api/auth/status', () => {
    it('returns 401 without cookie for non-localhost requests', async () => {
      const res = await request(app)
        .get('/api/auth/status')
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('returns 200 with valid cookie from login', async () => {
      // Login to get the auth cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });
      expect(loginRes.status).toBe(200);

      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();

      // Use the cookie to check status (simulate non-localhost)
      const statusRes = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookies)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.authenticated).toBe(true);
    });

    it('returns authenticated for localhost without cookie', async () => {
      // Supertest requests come from localhost by default (no IP override)
      const res = await request(app)
        .get('/api/auth/status');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ authenticated: true, isLocalhost: true });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 200 and clears the adyx_auth cookie', async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });
      expect(loginRes.status).toBe(200);

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout');

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({ authenticated: false });

      // Verify the set-cookie header clears adyx_auth
      const cookies = logoutRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      // Express clearCookie sets the cookie with an expires date in the past
      expect(cookieStr).toContain('adyx_auth');
      expect(cookieStr).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('after logout, status check without cookie fails for non-localhost', async () => {
      // Logout (does not require being logged in — just clears cookie)
      const logoutRes = await request(app)
        .post('/api/auth/logout');
      expect(logoutRes.status).toBe(200);

      // Status without cookie should be 401 for non-localhost
      const statusAfter = await request(app)
        .get('/api/auth/status')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(statusAfter.status).toBe(401);
      expect(statusAfter.body).toEqual({ authenticated: false });
    });
  });

  // Rate limiting test MUST run last because the loginLimiter is a module-level
  // singleton in auth.ts — once the 5-request window is exhausted, all
});
