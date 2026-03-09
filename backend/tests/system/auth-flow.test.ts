import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createAuthRouter } from '../../src/api/routes/auth.js';
import { requireAuth } from '../../src/api/middleware.js';
import { getLoginPageHtml } from '../../src/api/login-page.js';
import {
  generateAccessKey,
  hashKey,
  generateCookieSecret,
} from '../../src/services/auth-service.js';

/**
 * System test — full auth flow end-to-end.
 * Wires up a realistic Express app with auth middleware, auth routes,
 * login page, and protected API endpoints.
 *
 * Note: WebSocket auth is tested manually — complex to set up
 * with supertest since it doesn't support WebSocket upgrades natively.
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

describe('Auth System Flow', () => {
  let app: express.Express;
  let repo: Repository;
  let accessKey: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);

    accessKey = generateAccessKey();
    const keyHash = hashKey(accessKey);
    const cookieSecret = generateCookieSecret();
    repo.setAuthConfig(keyHash, cookieSecret);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(fakeRemoteIp());

    // Public routes (no auth)
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/login', (_req, res) => {
      res.type('html').send(getLoginPageHtml());
    });
    app.use('/api/auth', createAuthRouter(repo));

    // Auth middleware — protects everything below
    app.use(requireAuth(repo));

    // Protected routes
    app.get('/api/sessions', (_req, res) => res.json({ sessions: [] }));
    app.get('/', (_req, res) => res.send('Dashboard'));
  });

  afterEach(() => {
    closeDb();
  });

  it('unauthenticated request to protected API returns 401', async () => {
    const res = await request(app)
      .get('/api/sessions')
      .set('X-Test-Remote-Ip', '203.0.113.50');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authentication required');
  });

  it('/api/health is always accessible without auth', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Test-Remote-Ip', '203.0.113.50');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('unauthenticated HTML request redirects to /login', async () => {
    const res = await request(app)
      .get('/')
      .set('X-Test-Remote-Ip', '203.0.113.50');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('/login page is accessible without auth', async () => {
    const res = await request(app)
      .get('/login')
      .set('X-Test-Remote-Ip', '203.0.113.50');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Access Required');
  });

  it('full login flow: login → access protected resource → logout → denied', async () => {
    const remoteIp = '203.0.113.50';

    // Step 1: Login with correct key
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Test-Remote-Ip', remoteIp)
      .send({ accessKey });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.authenticated).toBe(true);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Step 2: Access protected resource with cookie
    const protectedRes = await request(app)
      .get('/api/sessions')
      .set('Cookie', cookies)
      .set('X-Test-Remote-Ip', remoteIp);

    expect(protectedRes.status).toBe(200);
    expect(protectedRes.body).toEqual({ sessions: [] });

    // Step 3: Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies)
      .set('X-Test-Remote-Ip', remoteIp);

    expect(logoutRes.status).toBe(200);

    // Step 4: After logout, access is denied (cookie cleared)
    const afterLogoutRes = await request(app)
      .get('/api/sessions')
      .set('X-Test-Remote-Ip', remoteIp);

    expect(afterLogoutRes.status).toBe(401);
  });

  it('localhost bypasses auth entirely', async () => {
    // No remote IP header → defaults to localhost
    const res = await request(app)
      .get('/api/sessions');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessions: [] });
  });
});
