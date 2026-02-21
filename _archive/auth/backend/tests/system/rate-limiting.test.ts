import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuthTestServer, getBaseUrl, type AuthTestServer } from './auth-test-server.js';

describe('System: Rate Limiting (US5)', () => {
  let ts: AuthTestServer;
  let baseUrl: string;

  beforeEach(async () => {
    ts = await createAuthTestServer({ authRequired: true });
    baseUrl = getBaseUrl(ts.port);
  });

  afterEach(async () => {
    await ts.close();
  });

  it('first 5 failed attempts return 401, 6th returns 429', async () => {
    // Send 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/auth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: `invalid-key-${i}` }),
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt should be rate limited
    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'invalid-key-6' }),
    });
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain('Too many attempts');
  });

  it('successful activation does not count toward rate limit', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');

    // Send 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await fetch(`${baseUrl}/api/auth/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: `invalid-key-${i}` }),
      });
    }

    // 1 successful activation (should not count — skipSuccessfulRequests=true)
    const validKey = generateTestLicenseKey({
      email: 'rate-test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const successRes = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: validKey }),
    });
    expect(successRes.status).toBe(200);

    // 1 more failed attempt — should be 401 (not 429), because successful req was skipped
    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'invalid-key-5' }),
    });
    expect(res.status).toBe(401);
  });
});
