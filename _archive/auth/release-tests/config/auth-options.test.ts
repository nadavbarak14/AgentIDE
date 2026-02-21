import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('Config: Auth options', { timeout: 120_000 }, () => {
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

  it('remote mode (--host 0.0.0.0) requires auth by default', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      host: '0.0.0.0',
    });
    try {
      await waitForHealth(server.baseUrl);
      const res = await fetch(`${server.baseUrl}/api/sessions`);
      // Remote mode without --no-auth should require authentication
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it('remote mode with --no-auth skips authentication', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      host: '0.0.0.0',
      noAuth: true,
    });
    try {
      await waitForHealth(server.baseUrl);
      const res = await fetch(`${server.baseUrl}/api/sessions`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it('localhost mode does not require auth', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      host: '127.0.0.1',
    });
    try {
      await waitForHealth(server.baseUrl);
      const res = await fetch(`${server.baseUrl}/api/sessions`);
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });
});
