import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('Install: npx-style execution via global install', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let server: RunningServer | null = null;

  afterAll(async () => {
    try {
      if (server) await server.stop();
    } finally {
      if (env) await env.cleanup();
    }
  });

  it('fresh install in isolated env starts server and serves health', async () => {
    // This simulates what a first-time user does:
    // npm install -g c3-dashboard && agentide start
    // (npx <tarball> doesn't work because npx treats tarballs differently)
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    const artifact = installArtifact(env, tarball);

    // Start from a completely fresh data directory (no pre-existing DB)
    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);

    // Verify it's functional — create a session
    const res = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: env.dataDir,
        title: 'npx-test',
      }),
    });
    expect([200, 201, 202]).toContain(res.status);
    const body = await res.json();
    expect(body.id).toBeDefined();
  });
});
