import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const CLI_PATH = path.join(import.meta.dirname, '../../src/cli.ts');
const tsxBin = path.join(import.meta.dirname, '../../../node_modules/.bin/tsx');

interface ServerProcess {
  proc: ChildProcess;
  port: number;
  baseUrl: string;
  tmpDir: string;
}

/**
 * Start the CLI server as a subprocess, wait for it to be ready.
 * Uses a temp directory for HOME and cwd to isolate DB files.
 */
function startServer(
  args: string[] = [],
  options?: { timeout?: number },
): Promise<ServerProcess> {
  const timeout = options?.timeout || 15000;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adyx-cli-test-'));

  return new Promise((resolve, reject) => {
    // Use tsx directly (not npx) so SIGTERM propagates properly
    const proc = spawn(tsxBin, [CLI_PATH, 'start', ...args], {
      cwd: tmpDir,
      env: {
        ...process.env,
        HOME: tmpDir,
        LOG_LEVEL: 'info',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Watch for server started message in stderr (pino logs go to stderr)
    const checkReady = () => {
      // pino outputs JSON — look for "started on" in combined output
      const combined = stdout + stderr;
      const portMatch = combined.match(/started on https?:\/\/[\w.:]+:(\d+)/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        resolve({
          proc,
          port,
          baseUrl: `http://127.0.0.1:${port}`,
          tmpDir,
        });
        return true;
      }
      return false;
    };

    proc.stdout?.on('data', () => checkReady());
    proc.stderr?.on('data', () => checkReady());

    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (!checkReady()) {
        reject(new Error(`Server exited with code ${code} before ready.\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });

    setTimeout(() => {
      if (!checkReady()) {
        proc.kill('SIGTERM');
        reject(new Error(`Server did not start within ${timeout}ms.\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    }, timeout);
  });
}

function killServer(sp: ServerProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (sp.proc.exitCode !== null) {
      resolve(sp.proc.exitCode);
      return;
    }
    let resolved = false;
    sp.proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    });
    try {
      if (sp.proc.pid) process.kill(-sp.proc.pid, 'SIGTERM');
    } catch {
      sp.proc.kill('SIGTERM');
    }
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (sp.proc.exitCode !== null) {
          resolve(sp.proc.exitCode);
        } else {
          try {
            if (sp.proc.pid) process.kill(-sp.proc.pid, 'SIGKILL');
          } catch {
            sp.proc.kill('SIGKILL');
          }
          resolve(null);
        }
      }
    }, 5000);
  });
}

function cleanup(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

describe('System: CLI E2E', { timeout: 30000 }, () => {
  const servers: ServerProcess[] = [];

  afterEach(async () => {
    for (const sp of servers) {
      await killServer(sp);
      cleanup(sp.tmpDir);
    }
    servers.length = 0;
  });

  it('adyx start --port PORT launches and responds to HTTP', async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const sp = await startServer(['--port', String(port)]);
    servers.push(sp);

    expect(sp.port).toBe(port);

    const res = await fetch(`${sp.baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('API routes are accessible without authentication', async () => {
    const port = 18100 + Math.floor(Math.random() * 1000);
    const sp = await startServer(['--port', String(port)]);
    servers.push(sp);

    // Sessions endpoint should be accessible
    const sessionsRes = await fetch(`${sp.baseUrl}/api/sessions`);
    expect(sessionsRes.status).toBe(200);
  });

  it('--host 0.0.0.0 starts without auth, routes accessible', async () => {
    const port = 18200 + Math.floor(Math.random() * 1000);
    const sp = await startServer(['--port', String(port), '--host', '0.0.0.0']);
    servers.push(sp);

    // Health check
    const healthRes = await fetch(`http://127.0.0.1:${sp.port}/api/health`);
    expect(healthRes.status).toBe(200);

    // Sessions should be accessible (no auth required)
    const sessionsRes = await fetch(`http://127.0.0.1:${sp.port}/api/sessions`);
    expect(sessionsRes.status).toBe(200);
  });
});
