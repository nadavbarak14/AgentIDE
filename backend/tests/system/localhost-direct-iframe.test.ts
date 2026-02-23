/**
 * System test: Verify proxy route still works correctly after FR-015 changes.
 *
 * FR-015 moves localhost sessions to direct iframe on the frontend, but the
 * backend proxy route must remain functional for remote access.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createTestServer, type TestServer } from './test-server.js';

/** Helper: HTTP GET using Node's http module (tolerant of chunked encoding quirks) */
function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: headers || {}, insecureHTTPParser: true }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

describe('proxy route regression (FR-015)', () => {
  let hub: TestServer;
  let devServer: http.Server;
  let devServerPort: number;
  let sessionId: string;

  beforeAll(async () => {
    // Start a simple dev server that returns HTML
    devServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Test App</title></head><body><h1>Hello</h1></body></html>');
    });
    devServerPort = await new Promise<number>((resolve) => {
      devServer.listen(0, '127.0.0.1', () => {
        const addr = devServer.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
      });
    });

    // Start hub
    hub = await createTestServer();

    // Create a local worker (hub-entry.ts does this on startup, test-server doesn't)
    let localWorker = hub.repo.getLocalWorker();
    if (!localWorker) {
      hub.repo.createLocalWorker('Local', 2);
      localWorker = hub.repo.getLocalWorker();
    }
    expect(localWorker).toBeTruthy();

    const session = hub.repo.createSession({
      prompt: 'test',
      targetWorker: localWorker!.id,
      workingDirectory: '/tmp',
      title: 'test-session',
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await hub.close();
    await new Promise<void>((resolve) => devServer.close(() => resolve()));
  });

  it('proxy route returns HTML from dev server', async () => {
    const res = await httpGet(
      `http://localhost:${hub.port}/api/sessions/${sessionId}/proxy/${devServerPort}/`,
      { Accept: 'text/html' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain('<h1>Hello</h1>');
    expect(res.body).toContain('<title>Test App</title>');
  });

  it('proxy route rewrites HTML with proxy base', async () => {
    const res = await httpGet(
      `http://localhost:${hub.port}/api/sessions/${sessionId}/proxy/${devServerPort}/`,
      { Accept: 'text/html' },
    );
    const proxyBase = `/api/sessions/${sessionId}/proxy/${devServerPort}`;
    expect(res.body).toContain(proxyBase);
  });

  it('proxy route returns 502 for unreachable port', async () => {
    const res = await httpGet(
      `http://localhost:${hub.port}/api/sessions/${sessionId}/proxy/59999/`,
      { Accept: 'text/html' },
    );
    expect(res.status).toBe(502);
  });

  it('proxy route returns 404 for non-existent session', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await httpGet(
      `http://localhost:${hub.port}/api/sessions/${fakeId}/proxy/${devServerPort}/`,
    );
    expect(res.status).toBe(404);
  });

  it('proxy route redirects root without trailing slash', async () => {
    const res = await httpGet(
      `http://localhost:${hub.port}/api/sessions/${sessionId}/proxy/${devServerPort}`,
    );
    expect(res.status).toBe(301);
    expect(res.headers.location).toContain(`/proxy/${devServerPort}/`);
  });
});
