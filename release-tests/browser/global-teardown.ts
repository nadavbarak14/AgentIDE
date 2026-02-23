import fs from 'node:fs';
import path from 'node:path';
import type { RunningServer } from '../helpers/server.js';
import type { ReleaseEnvironment } from '../helpers/environment.js';

const SERVER_INFO_PATH = path.resolve(import.meta.dirname, '.server-info.json');

export default async function globalTeardown() {
  console.log('[browser-e2e] Tearing down...');

  // Try to stop server from global refs first (same process)
  const server = (globalThis as Record<string, unknown>).__BROWSER_E2E_SERVER__ as RunningServer | undefined;
  const env = (globalThis as Record<string, unknown>).__BROWSER_E2E_ENV__ as ReleaseEnvironment | undefined;

  if (server) {
    try {
      console.log('[browser-e2e] Stopping server...');
      await server.stop();
    } catch (err) {
      console.warn('[browser-e2e] Error stopping server:', err);
    }
  } else {
    // Fallback: read PID from file and kill
    try {
      const info = JSON.parse(fs.readFileSync(SERVER_INFO_PATH, 'utf-8'));
      if (info.pid) {
        console.log(`[browser-e2e] Killing server PID ${info.pid}...`);
        try {
          process.kill(-info.pid, 'SIGTERM');
        } catch {
          try { process.kill(info.pid, 'SIGTERM'); } catch { /* already dead */ }
        }
      }
    } catch {
      // No server info file — nothing to clean up
    }
  }

  if (env) {
    try {
      await env.cleanup();
    } catch (err) {
      console.warn('[browser-e2e] Error cleaning up environment:', err);
    }
  }

  // Remove server info file
  try {
    fs.unlinkSync(SERVER_INFO_PATH);
  } catch {
    // Already removed or never created
  }

  console.log('[browser-e2e] Teardown complete.');
}
