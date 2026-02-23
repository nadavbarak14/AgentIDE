import fs from 'node:fs';
import path from 'node:path';
import { createReleaseEnvironment } from '../helpers/environment.js';
import { packArtifact, installArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth } from '../helpers/server.js';

const SERVER_INFO_PATH = path.resolve(import.meta.dirname, '.server-info.json');

export default async function globalSetup() {
  console.log('[browser-e2e] Packing artifact...');
  const tarball = packArtifact();

  console.log('[browser-e2e] Creating release environment...');
  const env = await createReleaseEnvironment();

  console.log('[browser-e2e] Installing artifact...');
  const artifact = installArtifact(env, tarball);

  console.log('[browser-e2e] Starting server...');
  const server = await startServer({
    env,
    binaryPath: artifact.binaryPath,
    timeout: 60_000,
  });

  console.log(`[browser-e2e] Waiting for health at ${server.baseUrl}...`);
  await waitForHealth(server.baseUrl, 30_000);

  console.log(`[browser-e2e] Server ready at ${server.baseUrl}`);

  // Write server info so tests and teardown can access it
  const serverInfo = {
    baseURL: server.baseUrl,
    port: server.port,
    pid: server.process.pid,
    dataDir: env.dataDir,
    tempDir: env.tempDir,
    homeDir: env.homeDir,
    npmPrefix: env.npmPrefix,
    binDir: env.binDir,
    envVars: env.env,
  };

  fs.writeFileSync(SERVER_INFO_PATH, JSON.stringify(serverInfo, null, 2));

  // Store refs for teardown
  (globalThis as Record<string, unknown>).__BROWSER_E2E_SERVER__ = server;
  (globalThis as Record<string, unknown>).__BROWSER_E2E_ENV__ = env;
}
