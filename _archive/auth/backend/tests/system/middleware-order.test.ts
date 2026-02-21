import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuthTestServer, generateAndActivate, getBaseUrl, type AuthTestServer } from './auth-test-server.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('System: Middleware Order & Security (US5 + US6)', () => {
  let ts: AuthTestServer;
  let baseUrl: string;

  beforeEach(async () => {
    ts = await createAuthTestServer({ authRequired: true });
    baseUrl = getBaseUrl(ts.port);
  });

  afterEach(async () => {
    await ts.close();
  });

  // ─── Auth routes accessible without cookie ───

  it('auth routes accessible without cookie in remote mode', async () => {
    const [status, logout] = await Promise.all([
      fetch(`${baseUrl}/api/auth/status`),
      fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' }),
    ]);

    // Auth routes should always be accessible
    expect(status.status).toBe(200);
    expect(logout.status).toBe(200);

    // Activate is also accessible (returns 400 without body, not 401)
    const activate = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(activate.status).toBe(400); // Missing field, not 401
  });

  // ─── Protected routes return 401 ───

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

  // ─── Security headers ───

  it('security headers present on all responses', async () => {
    const res = await fetch(`${baseUrl}/api/auth/status`);

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
  });

  // ─── Worker endpoint protected ───

  it('POST /api/workers returns 401 without cookie', async () => {
    const res = await fetch(`${baseUrl}/api/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Worker',
        sshHost: 'example.com',
        sshUser: 'user',
        sshKeyPath: '/nonexistent/key',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/workers with auth but bad SSH key path returns 400', async () => {
    const { cookie } = await generateAndActivate(baseUrl);

    const res = await fetch(`${baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        name: 'Test Worker',
        sshHost: 'example.com',
        sshUser: 'user',
        sshKeyPath: '/nonexistent/key/path',
      }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('POST /api/workers with passphrase-protected key returns 400', async () => {
    const { cookie } = await generateAndActivate(baseUrl);

    // Create a fake passphrase-protected key file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-key-test-'));
    const keyPath = path.join(tmpDir, 'encrypted.pem');
    fs.writeFileSync(
      keyPath,
      '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,abc\n\nfakedata\n-----END RSA PRIVATE KEY-----\n',
    );

    try {
      const res = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          name: 'Encrypted Key Worker',
          sshHost: 'example.com',
          sshUser: 'user',
          sshKeyPath: keyPath,
        }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('passphrase');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
