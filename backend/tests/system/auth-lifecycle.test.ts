import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuthTestServer, generateAndActivate, getBaseUrl, type AuthTestServer } from './auth-test-server.js';

// ─── US1: Localhost mode — zero auth friction ───

describe('System: Localhost Mode (US1)', () => {
  let ts: AuthTestServer;
  let baseUrl: string;

  beforeEach(async () => {
    ts = await createAuthTestServer({ authRequired: false });
    baseUrl = getBaseUrl(ts.port);
  });

  afterEach(async () => {
    await ts.close();
  });

  it('all protected API routes return 200 without cookie', async () => {
    const [settings, sessions, workers] = await Promise.all([
      fetch(`${baseUrl}/api/settings`),
      fetch(`${baseUrl}/api/sessions`),
      fetch(`${baseUrl}/api/workers`),
    ]);

    expect(settings.status).toBe(200);
    expect(sessions.status).toBe(200);
    expect(workers.status).toBe(200);
  });

  it('/api/auth/status returns authRequired=false, authenticated=true', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authRequired).toBe(false);
    expect(body.authenticated).toBe(true);
  });

  it('create session and list sessions works without auth', async () => {
    // Create a session
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: '/tmp',
        title: 'Test Session',
      }),
    });
    expect(createRes.status).toBe(201);

    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');

    // List sessions
    const listRes = await fetch(`${baseUrl}/api/sessions`);
    expect(listRes.status).toBe(200);

    const sessions = await listRes.json();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.some((s: { id: string }) => s.id === session.id)).toBe(true);
  });
});

// ─── US2: Remote mode — license key gate ───

describe('System: Remote Mode Auth Lifecycle (US2)', () => {
  let ts: AuthTestServer;
  let baseUrl: string;

  beforeEach(async () => {
    ts = await createAuthTestServer({ authRequired: true });
    baseUrl = getBaseUrl(ts.port);
  });

  afterEach(async () => {
    await ts.close();
  });

  it('protected routes return 401 without cookie', async () => {
    const [settings, sessions, workers] = await Promise.all([
      fetch(`${baseUrl}/api/settings`),
      fetch(`${baseUrl}/api/sessions`),
      fetch(`${baseUrl}/api/workers`),
    ]);

    expect(settings.status).toBe(401);
    expect(sessions.status).toBe(401);
    expect(workers.status).toBe(401);
  });

  it('/api/auth/status returns authRequired=true, authenticated=false without cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authRequired).toBe(true);
    expect(body.authenticated).toBe(false);
  });

  it('activate with valid license key returns 200 and sets httpOnly cookie', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'system-test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.email).toBe('system-test@example.com');
    expect(body.plan).toBe('pro');
    expect(body.maxSessions).toBe(10);

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('agentide_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('cookie from activation grants access to protected routes', async () => {
    const { cookie } = await generateAndActivate(baseUrl);

    const res = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
  });

  it('/api/auth/status with valid cookie returns authenticated=true with email', async () => {
    const { cookie, email, plan } = await generateAndActivate(baseUrl);

    const res = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authRequired).toBe(true);
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe(email);
    expect(body.plan).toBe(plan);
  });

  it('logout clears cookie, subsequent request returns 401', async () => {
    const { cookie } = await generateAndActivate(baseUrl);

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(logoutRes.status).toBe(200);

    const logoutBody = await logoutRes.json();
    expect(logoutBody.ok).toBe(true);

    const logoutSetCookie = logoutRes.headers.get('set-cookie') || '';
    expect(logoutSetCookie).toContain('Max-Age=0');

    // Extract the cleared cookie and try to use it
    const clearedCookie = logoutSetCookie.split(';')[0];
    const res = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: clearedCookie },
    });
    expect(res.status).toBe(401);
  });

  it('re-activate after logout works', async () => {
    const { cookie: cookie1 } = await generateAndActivate(baseUrl);

    // Logout
    await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie1 },
    });

    // Re-activate
    const { cookie: cookie2 } = await generateAndActivate(baseUrl);

    // New cookie works
    const res = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: cookie2 },
    });
    expect(res.status).toBe(200);
  });

  it('create session + list sessions with auth cookie (full CRUD cycle)', async () => {
    const { cookie } = await generateAndActivate(baseUrl);

    // Create session
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        workingDirectory: '/tmp',
        title: 'Authenticated Session',
      }),
    });
    expect(createRes.status).toBe(201);

    const session = await createRes.json();
    expect(session.title).toBe('Authenticated Session');

    // List sessions
    const listRes = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);

    const sessions = await listRes.json();
    expect(sessions.some((s: { id: string }) => s.id === session.id)).toBe(true);
  });

  it('activate stores license metadata, status reflects it', async () => {
    const { cookie } = await generateAndActivate(baseUrl, {
      email: 'stored@example.com',
      plan: 'team',
    });

    // Check auth status
    const res = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    const body = await res.json();
    expect(body.email).toBe('stored@example.com');
    expect(body.plan).toBe('team');
  });
});
