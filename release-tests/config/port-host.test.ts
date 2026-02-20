import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('Config: Port and host options', { timeout: 120_000 }, () => {
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

  it('server starts on random ephemeral port', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
    });
    try {
      expect(server.port).toBeGreaterThan(0);
      await waitForHealth(server.baseUrl);
      const res = await fetch(`${server.baseUrl}/api/auth/status`);
      expect([200, 401]).toContain(res.status);
    } finally {
      await server.stop();
    }
  });

  it('server starts on specific port 8765', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      port: 8765,
    });
    try {
      expect(server.port).toBe(8765);
      await waitForHealth(server.baseUrl);
      const res = await fetch(`http://127.0.0.1:8765/api/auth/status`);
      expect([200, 401]).toContain(res.status);
    } finally {
      await server.stop();
    }
  });

  it('server starts with --host 0.0.0.0 and --no-auth', async () => {
    const server = await startServer({
      env,
      binaryPath: artifact.binaryPath,
      host: '0.0.0.0',
      noAuth: true,
    });
    try {
      await waitForHealth(server.baseUrl);
      // Connecting via 127.0.0.1 should work since 0.0.0.0 binds all interfaces
      const res = await fetch(`http://127.0.0.1:${server.port}/api/auth/status`);
      expect([200, 401]).toContain(res.status);
    } finally {
      await server.stop();
    }
  });
});
