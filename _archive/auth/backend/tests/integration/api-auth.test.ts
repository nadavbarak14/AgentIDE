import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createAuthRouter } from '../../src/api/routes/auth.js';
import { createAuthMiddleware } from '../../src/api/middleware.js';

// ─── US1: Localhost mode — zero auth friction ───

describe('Auth: Localhost Mode (US1)', () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDb();
    const repo = new Repository(db);
    const authConfig = repo.getAuthConfig();

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Auth routes (always accessible)
    app.use('/api/auth', createAuthRouter(repo, false));

    // Auth middleware with authRequired=false (localhost mode)
    app.use('/api', createAuthMiddleware(authConfig.jwtSecret, false));

    // Protected test route
    app.get('/api/test', (_req, res) => res.json({ ok: true }));
  });

  afterEach(() => {
    closeDb();
  });

  it('GET /api/test returns 200 without any cookie (localhost mode)', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/auth/status returns authRequired=false on localhost', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.authRequired).toBe(false);
    expect(res.body.authenticated).toBe(true);
  });
});

// ─── US2: Remote mode — license key gate ───

describe('Auth: Remote Mode (US2)', () => {
  let app: express.Express;
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    const authConfig = repo.getAuthConfig();

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Auth routes (always accessible)
    app.use('/api/auth', createAuthRouter(repo, true));

    // Auth middleware with authRequired=true (remote mode)
    app.use('/api', createAuthMiddleware(authConfig.jwtSecret, true));

    // Protected test route
    app.get('/api/test', (_req, res) => res.json({ ok: true }));
  });

  afterEach(() => {
    closeDb();
  });

  it('GET /api/test returns 401 without cookie (remote mode)', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('GET /api/auth/status returns authRequired=true, authenticated=false without cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.authRequired).toBe(true);
    expect(res.body.authenticated).toBe(false);
  });

  it('POST /api/auth/activate with valid key sets cookie and returns license info', async () => {
    // Generate a valid test license key
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.plan).toBe('pro');
    expect(res.body.maxSessions).toBe(10);
    expect(res.headers['set-cookie']).toBeDefined();
    // Verify cookie name
    const cookie = res.headers['set-cookie']?.[0] || '';
    expect(cookie).toContain('agentide_session=');
  });

  it('POST /api/auth/activate with invalid key returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey: 'garbage.key' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid license key');
  });

  it('POST /api/auth/activate without licenseKey returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/activate')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required field');
  });

  it('POST /api/auth/activate with expired key returns 401', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
    });

    const res = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('expired');
  });

  it('Protected route accessible with valid JWT cookie', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Activate to get cookie
    const activateRes = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey });

    const cookie = activateRes.headers['set-cookie']?.[0] || '';

    // Use cookie on protected route
    const res = await request(app)
      .get('/api/test')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/auth/logout clears cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cookie = res.headers['set-cookie']?.[0] || '';
    expect(cookie).toContain('agentide_session=');
    expect(cookie).toContain('Max-Age=0');
  });

  it('GET /api/auth/status returns authenticated=true with valid cookie', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const activateRes = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey });

    const cookie = activateRes.headers['set-cookie']?.[0] || '';

    const res = await request(app)
      .get('/api/auth/status')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.authRequired).toBe(true);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.plan).toBe('pro');
  });
});

// ─── US3: Rate limiting ───

describe('Auth: Rate Limiting (US3)', () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDb();
    const repo = new Repository(db);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', createAuthRouter(repo, true));
  });

  afterEach(() => {
    closeDb();
  });

  it('returns 429 after 5 failed attempts', async () => {
    // Send 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/activate')
        .send({ licenseKey: `invalid-key-${i}` });
    }

    // 6th attempt should be rate limited
    const res = await request(app)
      .post('/api/auth/activate')
      .send({ licenseKey: 'invalid-key-6' });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many attempts');
  });
});
