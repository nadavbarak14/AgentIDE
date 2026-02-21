import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAuthTestServer, getBaseUrl, type AuthTestServer } from './auth-test-server.js';

describe('System: License Lifecycle (US2)', () => {
  let ts: AuthTestServer;
  let baseUrl: string;

  beforeEach(async () => {
    ts = await createAuthTestServer({ authRequired: true });
    baseUrl = getBaseUrl(ts.port);
  });

  afterEach(async () => {
    await ts.close();
  });

  it('activate with invalid key returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'garbage.key' }),
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toContain('Invalid license key');
  });

  it('activate with expired key returns 403', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'expired@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
    });

    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toContain('expired');
  });

  it('activate with tampered signature returns 401', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const validKey = generateTestLicenseKey({
      email: 'tamper@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Tamper with the signature by replacing multiple characters in the middle
    // (flipping only the last char can affect padding bits that are ignored)
    const parts = validKey.split('.');
    const sig = parts[1];
    const mid = Math.floor(sig.length / 2);
    const tamperedSig = sig.slice(0, mid - 2) + 'XXXX' + sig.slice(mid + 2);
    const tamperedKey = parts[0] + '.' + tamperedSig;

    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: tamperedKey }),
    });
    expect(res.status).toBe(401);
  });

  it('activate with missing licenseKey field returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Missing required field');
  });
});
