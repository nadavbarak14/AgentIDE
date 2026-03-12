import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createAuthRouter, loginLimiter } from '../../src/api/routes/auth.js';
import { requireAuth } from '../../src/api/middleware.js';
import { generateAccessKey, hashKey, generateCookieSecret, createCookieValue } from '../../src/services/auth-service.js';

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
  let cookieSecret: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);

    // Generate and store an access key
    accessKey = generateAccessKey();
    const keyHash = hashKey(accessKey);
    cookieSecret = generateCookieSecret();
    repo.setAuthConfig(keyHash, cookieSecret);

    // Reset rate limiter for localhost IP to prevent cross-test contamination
    loginLimiter.resetKey('::ffff:127.0.0.1');

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

  // ---------------------------------------------------------------------------
  // Session cookie properties (US3)
  // ---------------------------------------------------------------------------
  describe('Session cookie properties', () => {
    it('sets cookie with correct maxAge, HttpOnly, and SameSite', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
      // Max-Age should be 30 days in seconds = 2592000
      expect(cookieStr).toMatch(/Max-Age=2592000/);
    });

    it('valid cookie authenticates requests', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });
      const cookies = loginRes.headers['set-cookie'];

      const statusRes = await request(app)
        .get('/api/auth/status')
        .set('Cookie', cookies)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.authenticated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit logging (US4)
  // ---------------------------------------------------------------------------
  describe('Audit logging', () => {
    it('logs successful login', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ accessKey });

      const entries = repo.getAuthAuditLog();
      expect(entries.some((e) => e.eventType === 'login_success')).toBe(true);
    });

    it('logs failed login', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ accessKey: 'wrong-key' });

      const entries = repo.getAuthAuditLog();
      expect(entries.some((e) => e.eventType === 'login_failure')).toBe(true);
    });

    it('logs logout', async () => {
      await request(app)
        .post('/api/auth/logout');

      const entries = repo.getAuthAuditLog();
      expect(entries.some((e) => e.eventType === 'logout')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit log endpoint (US4)
  // ---------------------------------------------------------------------------
  describe('GET /api/auth/audit-log', () => {
    it('returns 401 without auth for non-localhost', async () => {
      const res = await request(app)
        .get('/api/auth/audit-log')
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(401);
    });

    it('returns entries with valid auth', async () => {
      // Login first to create entries and get cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });
      const cookies = loginRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/auth/audit-log')
        .set('Cookie', cookies)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(200);
      expect(res.body.entries).toBeDefined();
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(res.body.entries.length).toBeGreaterThan(0);
    });

    it('records login_failure entries after failed login', async () => {
      // Fail a login
      await request(app)
        .post('/api/auth/login')
        .send({ accessKey: 'bad-key' });

      // Login successfully to get a cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ accessKey });
      const cookies = loginRes.headers['set-cookie'];

      const res = await request(app)
        .get('/api/auth/audit-log')
        .set('Cookie', cookies)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(200);
      const failureEntries = res.body.entries.filter(
        (e: { eventType: string }) => e.eventType === 'login_failure'
      );
      expect(failureEntries.length).toBeGreaterThan(0);
    });

    it('respects limit query parameter', async () => {
      // Create multiple audit entries directly
      for (let i = 0; i < 5; i++) {
        repo.logAuthEvent('login_failure', '10.0.0.1', 'test');
      }

      // Create cookie directly to avoid rate limiter interference
      const validCookie = createCookieValue(cookieSecret);

      const res = await request(app)
        .get('/api/auth/audit-log?limit=3')
        .set('Cookie', `adyx_auth=${validCookie}`)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeLessThanOrEqual(3);
    });

    it('returns entries in reverse chronological order', async () => {
      // Create entries in order directly
      repo.logAuthEvent('login_failure', '10.0.0.1', 'bad key');
      repo.logAuthEvent('login_success', '10.0.0.1');

      // Create cookie directly to avoid rate limiter interference
      const validCookie = createCookieValue(cookieSecret);

      const res = await request(app)
        .get('/api/auth/audit-log')
        .set('Cookie', `adyx_auth=${validCookie}`)
        .set('X-Test-Remote-Ip', '203.0.113.50');

      expect(res.status).toBe(200);
      const entries = res.body.entries;
      // Most recent first
      expect(entries[0].eventType).toBe('login_success');
    });

    it('allows localhost access without auth', async () => {
      repo.logAuthEvent('login_failure', '10.0.0.1');

      const res = await request(app)
        .get('/api/auth/audit-log');

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Fail-closed middleware with full app (US2)
  // ---------------------------------------------------------------------------
  describe('Endpoint auth coverage', () => {
    let fullApp: express.Express;
    let authCookie: string;

    beforeEach(() => {
      fullApp = express();
      fullApp.use(express.json());
      fullApp.use(cookieParser());
      fullApp.use(fakeRemoteIp());

      // Exempt routes (before requireAuth)
      fullApp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
      fullApp.use('/api/auth', createAuthRouter(repo));
      fullApp.get('/login', (_req, res) => res.send('<html>login</html>'));

      // Auth middleware
      fullApp.use(requireAuth(repo));

      // Protected routes (after requireAuth)
      fullApp.get('/api/sessions', (_req, res) => res.json({ sessions: [] }));
      fullApp.get('/api/extensions', (_req, res) => res.json({ extensions: [] }));
      fullApp.get('/api/inspect-bridge.js', (_req, res) => res.send('// bridge'));
      fullApp.get('/api/widget-bridge.js', (_req, res) => res.send('// widget'));
      fullApp.get('/', (_req, res) => res.send('<html>app</html>'));

      // Create cookie directly to avoid rate limiter interference
      authCookie = createCookieValue(cookieSecret);
    });

    it('allows /api/health without auth', async () => {
      const res = await request(fullApp)
        .get('/api/health')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(200);
    });

    it('allows /login without auth', async () => {
      const res = await request(fullApp)
        .get('/login')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(200);
    });

    it('allows /api/auth/status without auth', async () => {
      const res = await request(fullApp)
        .get('/api/auth/status')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      // Returns 401 with { authenticated: false } — still responds, not blocked
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ authenticated: false });
    });

    it('blocks /api/sessions without auth', async () => {
      const res = await request(fullApp)
        .get('/api/sessions')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(401);
    });

    it('blocks /api/extensions without auth', async () => {
      const res = await request(fullApp)
        .get('/api/extensions')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(401);
    });

    it('blocks /api/inspect-bridge.js without auth', async () => {
      const res = await request(fullApp)
        .get('/api/inspect-bridge.js')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(401);
    });

    it('blocks /api/widget-bridge.js without auth', async () => {
      const res = await request(fullApp)
        .get('/api/widget-bridge.js')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(401);
    });

    it('redirects / to /login without auth', async () => {
      const res = await request(fullApp)
        .get('/')
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('allows protected routes with valid auth cookie', async () => {
      const res = await request(fullApp)
        .get('/api/sessions')
        .set('Cookie', `adyx_auth=${authCookie}`)
        .set('X-Test-Remote-Ip', '203.0.113.50');
      expect(res.status).toBe(200);
    });

    it('allows localhost access without auth', async () => {
      const res = await request(fullApp)
        .get('/api/sessions');
      // No X-Test-Remote-Ip = localhost
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Rate limiting (US1) — MUST run last (singleton state)
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/login rate limiting', () => {
    beforeEach(() => {
      // Reset the rate limiter between tests
      loginLimiter.resetKey('203.0.113.50');
    });

    it('allows 5 failed attempts then blocks with 429', async () => {
      // Send 5 failed attempts — should all return 401
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Test-Remote-Ip', '203.0.113.50')
          .send({ accessKey: `wrong-key-${i}` });
        expect(res.status).toBe(401);
      }

      // 6th attempt should be rate limited
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '203.0.113.50')
        .send({ accessKey: 'wrong-key-6' });
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many failed attempts. Try again in 15 minutes.');
    });

    it('does not count successful login toward limit', async () => {
      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Test-Remote-Ip', '203.0.113.50')
          .send({ accessKey: `wrong-key-${i}` });
      }

      // 1 successful login — should not count
      const successRes = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '203.0.113.50')
        .send({ accessKey });
      expect(successRes.status).toBe(200);

      // 2 more failed attempts — total failed = 5 (should be the limit)
      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Test-Remote-Ip', '203.0.113.50')
          .send({ accessKey: `wrong-key-extra-${i}` });
        expect(res.status).toBe(401);
      }

      // 6th failed attempt — should be rate limited
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '203.0.113.50')
        .send({ accessKey: 'wrong-key-final' });
      expect(blockedRes.status).toBe(429);
    });

    it('rate limit error message matches contract', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Test-Remote-Ip', '203.0.113.50')
          .send({ accessKey: `wrong-${i}` });
      }

      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '203.0.113.50')
        .send({ accessKey: 'wrong-final' });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many failed attempts. Try again in 15 minutes.');
      expect(res.body.retryAfter).toBe(900);
    });

    it('includes RateLimit headers in responses', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '203.0.113.50')
        .send({ accessKey: 'wrong' });

      // Standard headers from express-rate-limit
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('rate limits per IP independently', async () => {
      // Exhaust limit for IP A
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('X-Test-Remote-Ip', '203.0.113.50')
          .send({ accessKey: `wrong-${i}` });
      }

      // IP B should still be able to attempt
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Test-Remote-Ip', '198.51.100.10')
        .send({ accessKey: 'wrong' });
      expect(res.status).toBe(401); // Not 429
    });
  });
});
