import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import https from 'node:https';
import WebSocket from 'ws';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, type RunningServer } from '../helpers/server.js';

describe('Config: TLS options', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let artifact: InstalledArtifact;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);
  });

  afterAll(async () => {
    if (env) await env.cleanup();
  });

  it('server starts with --tls --self-signed and responds over HTTPS', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      tls: true,
      selfSigned: true,
      noAuth: true,
    });
    try {
      expect(server.protocol).toBe('https');

      // Use Node https agent that accepts self-signed certs
      const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = https.get(
          `${server.baseUrl}/api/auth/status`,
          { rejectUnauthorized: false },
          (res) => {
            resolve({ statusCode: res.statusCode || 0 });
            res.resume(); // consume response
          },
        );
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('HTTPS request timed out'));
        });
      });

      expect([200, 401]).toContain(response.statusCode);
    } finally {
      await server.stop();
    }
  });

  it('WebSocket connects via wss:// with self-signed cert', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      tls: true,
      selfSigned: true,
      noAuth: true,
    });
    try {
      // Create a session to get a valid WebSocket path
      const createRes = await new Promise<{ id: string }>((resolve, reject) => {
        const postData = JSON.stringify({
          workingDirectory: env.dataDir,
          title: 'tls-ws-test',
        });
        const req = https.request(
          `${server.baseUrl}/api/sessions`,
          {
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch { reject(new Error(`Parse error: ${data}`)); }
            });
          },
        );
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      const connected = await new Promise<boolean>((resolve) => {
        const ws = new WebSocket(
          `wss://127.0.0.1:${server.port}/ws/sessions/${createRes.id}`,
          { rejectUnauthorized: false },
        );
        const timer = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        });

        ws.on('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      expect(connected).toBe(true);
    } finally {
      await server.stop();
    }
  });
});
