import { spawn, type ChildProcess } from 'node:child_process';
import type { ReleaseEnvironment } from './environment.js';

export interface RunningServer {
  process: ChildProcess;
  port: number;
  baseUrl: string;
  protocol: 'http' | 'https';
  /** Returns recent server stderr output (useful for diagnosing session failures) */
  getStderr(): string;
  stop(): Promise<number | null>;
}

export interface StartOptions {
  env: ReleaseEnvironment;
  binaryPath: string;
  port?: number;
  host?: string;
  extraArgs?: string[];
  timeout?: number;
}

/** Generate a random high port to avoid conflicts */
function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

export function startServer(opts: StartOptions): Promise<RunningServer> {
  const {
    env,
    binaryPath,
    host,
    extraArgs = [],
    timeout = 30_000,
  } = opts;

  // hub-entry.ts treats port=0 as falsy and defaults to 24880,
  // so use a random high port when no specific port is requested
  const port = opts.port || randomPort();

  const args = [binaryPath, 'start', '--port', String(port)];
  if (host) args.push('--host', host);
  args.push(...extraArgs);

  return new Promise((resolve, reject) => {
    const proc = spawn('node', args, {
      cwd: env.dataDir,
      env: env.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      checkReady();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      checkReady();
    });

    function checkReady(): void {
      if (resolved) return;
      const combined = stdout + stderr;
      const match = combined.match(/started on (https?):\/\/[\w.:]+:(\d+)/);
      if (match) {
        resolved = true;
        const protocol = match[1] as 'http' | 'https';
        const resolvedPort = parseInt(match[2], 10);
        const baseUrl = `${protocol}://127.0.0.1:${resolvedPort}`;
        resolve({
          process: proc,
          port: resolvedPort,
          baseUrl,
          protocol,
          getStderr: () => stderr,
          stop: () => stopServer(proc),
        });
      }
    }

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            `Server exited with code ${code} before ready.\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
        } catch {
          proc.kill('SIGTERM');
        }
        reject(
          new Error(
            `Server did not start within ${timeout}ms.\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
      }
    }, timeout);
  });
}

function stopServer(proc: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null) {
      resolve(proc.exitCode);
      return;
    }

    let resolved = false;
    proc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        resolve(code);
      }
    });

    // Kill the process group (negative PID) so node and children all get the signal
    try {
      if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (proc.exitCode !== null) {
          resolve(proc.exitCode);
        } else {
          try {
            if (proc.pid) process.kill(-proc.pid, 'SIGKILL');
          } catch {
            proc.kill('SIGKILL');
          }
          resolve(null);
        }
      }
    }, 5000);
  });
}

/**
 * Creates a session and polls until it reaches 'active' status.
 * Throws with detailed diagnostics if the session fails to activate.
 */
export async function createActiveSession(
  server: RunningServer,
  workingDirectory: string,
  title = 'test-session',
  timeoutMs = 30_000,
): Promise<string> {
  const createRes = await fetch(`${server.baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workingDirectory, title }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create session: ${createRes.status} ${await createRes.text()}`);
  }
  const body = await createRes.json();
  const sessionId = body.id as string;

  const deadline = Date.now() + timeoutMs;
  let lastStatus = body.status as string;
  while (Date.now() < deadline) {
    const listRes = await fetch(`${server.baseUrl}/api/sessions`);
    const sessions = await listRes.json() as Array<{ id: string; status: string }>;
    const session = sessions.find(s => s.id === sessionId);

    if (session?.status === 'active') return sessionId;
    if (session?.status === 'failed' || !session) {
      lastStatus = session?.status ?? 'deleted';
      break;
    }
    lastStatus = session.status;
    await new Promise(r => setTimeout(r, 500));
  }

  // Extract relevant error lines from server stderr
  const stderrLines = server.getStderr().split('\n');
  const errorLines = stderrLines
    .filter(l => l.includes('ERROR') || l.includes('failed') || l.includes('posix_spawn'))
    .slice(-10)
    .join('\n');

  throw new Error(
    `Session failed to activate (status: ${lastStatus})\n` +
    `  Platform: ${process.platform} (${process.arch})\n` +
    `  Node: ${process.version}\n` +
    `  Server errors:\n${errorLines || '  (no error lines found in server output)'}`,
  );
}

export async function waitForHealth(
  baseUrl: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Health check failed after ${timeoutMs}ms for ${baseUrl}`);
}
