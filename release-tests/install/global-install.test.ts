import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('Install: Global npm install', { timeout: 120_000 }, () => {
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

  it('adyx binary exists in bin directory', () => {
    expect(fs.existsSync(artifact.binaryPath)).toBe(true);
  });

  it('adyx --help exits 0 and shows commands', () => {
    const output = execSync(`node "${artifact.binaryPath}" --help`, {
      env: env.env,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    expect(output).toContain('start');
  });

  it('adyx --version matches package version', () => {
    const output = execSync(`node "${artifact.binaryPath}" --version`, {
      env: env.env,
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
    expect(output).toBe(artifact.version);
  });

  it('installed server starts, responds to health check, stops cleanly', async () => {
    let server: RunningServer | null = null;
    try {
      server = await startServer({ env, binaryPath: artifact.binaryPath });
      await waitForHealth(server.baseUrl);
      const res = await fetch(`${server.baseUrl}/api/health`);
      expect(res.status).toBe(200);
    } finally {
      if (server) await server.stop();
    }
  });
});
