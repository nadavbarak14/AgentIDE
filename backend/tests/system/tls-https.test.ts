import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import https from 'node:https';
import selfsigned from 'selfsigned';
import WebSocket from 'ws';
import { createAuthTestServer, generateAndActivate, getBaseUrl, type AuthTestServer } from './auth-test-server.js';

// Generate in-memory TLS certs for testing (no disk writes)
async function generateTestCerts(): Promise<{ cert: string; key: string }> {
  const attrs = [{ name: 'commonName', value: 'AgentIDE Test' }];
  const pems = await selfsigned.generate(attrs, { keySize: 2048 });
  return { cert: pems.cert, key: pems.private };
}

// Fetch with TLS rejection disabled for self-signed certs
function fetchHttps(url: string, options?: RequestInit): Promise<Response> {
  // Node 20 supports fetch with custom agent via undici
  // For self-signed certs, we use the NODE_TLS_REJECT_UNAUTHORIZED env
  // which is already set in beforeEach
  return fetch(url, options);
}

describe('System: TLS/HTTPS (US4)', { timeout: 30000 }, () => {
  let ts: AuthTestServer;
  let baseUrl: string;
  let originalTlsReject: string | undefined;

  beforeEach(async () => {
    // Allow self-signed certs for tests
    originalTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const certs = await generateTestCerts();
    ts = await createAuthTestServer({
      authRequired: true,
      isHttps: true,
      tlsCert: certs.cert,
      tlsKey: certs.key,
    });
    baseUrl = getBaseUrl(ts.port, true);
  });

  afterEach(async () => {
    // Restore TLS setting
    if (originalTlsReject === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsReject;
    }
    await ts.close();
  });

  it('self-signed HTTPS server starts and responds', async () => {
    const res = await fetchHttps(`${baseUrl}/api/auth/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authRequired).toBe(true);
  });

  it('HTTPS activate sets cookie with Secure flag', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'tls-test@example.com',
      plan: 'pro',
      maxSessions: 10,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await fetchHttps(`${baseUrl}/api/auth/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('agentide_session=');
    expect(setCookie).toContain('Secure');
  });

  it('WSS WebSocket upgrade works over HTTPS', async () => {
    // Activate to get cookie
    const { cookie } = await generateAndActivate(baseUrl);

    // Create a session
    const createRes = await fetchHttps(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ workingDirectory: '/tmp', title: 'WSS Test' }),
    });
    const session = await createRes.json();

    // Connect via WSS
    const ws = new WebSocket(`wss://localhost:${ts.port}/ws/sessions/${session.id}`, {
      headers: { Cookie: cookie },
      rejectUnauthorized: false,
    });

    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(true));
      ws.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 3000);
    });

    expect(connected).toBe(true);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Wait for close before server teardown
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      ws.on('close', () => setTimeout(resolve, 50));
      ws.close();
      setTimeout(resolve, 1000);
    });
  });
});
