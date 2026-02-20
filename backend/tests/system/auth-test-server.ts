import express from 'express';
import http from 'node:http';
import https from 'node:https';
import cookieParser from 'cookie-parser';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSettingsRouter } from '../../src/api/routes/settings.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { createFilesRouter } from '../../src/api/routes/files.js';
import { createWorkersRouter } from '../../src/api/routes/workers.js';
import { createAuthRouter } from '../../src/api/routes/auth.js';
import { createHooksRouter } from '../../src/api/routes/hooks.js';
import { createAuthMiddleware, requestLogger, errorHandler } from '../../src/api/middleware.js';
import { setupWebSocket } from '../../src/api/websocket.js';
import { QueueManager } from '../../src/services/queue-manager.js';
import { SessionManager } from '../../src/services/session-manager.js';
import { WorkerManager } from '../../src/services/worker-manager.js';
import { PtySpawner } from '../../src/worker/pty-spawner.js';
import type Database from 'better-sqlite3';

function createMockPtySpawner(): PtySpawner {
  const spawner = new PtySpawner();
  spawner.spawn = function (sessionId: string, _workingDirectory: string, _args?: string[]) {
    const fakePid = Math.floor(Math.random() * 90000) + 10000;
    return {
      pid: fakePid,
      sessionId,
      write: () => {},
      resize: () => {},
      kill: () => {
        spawner.emit('exit', sessionId, 0, 'mock-claude-session-id');
      },
    };
  };
  spawner.spawnContinue = spawner.spawn;
  return spawner;
}

export interface AuthTestServerOptions {
  authRequired: boolean;
  isHttps?: boolean;
  tlsCert?: string;
  tlsKey?: string;
}

export interface AuthTestServer {
  app: express.Express;
  server: http.Server | https.Server;
  port: number;
  repo: Repository;
  sessionManager: SessionManager;
  queueManager: QueueManager;
  workerManager: WorkerManager;
  ptySpawner: PtySpawner;
  db: Database.Database;
  close: () => Promise<void>;
}

/**
 * Create a test server that mirrors hub-entry.ts middleware ordering exactly:
 * 1. express.json() → cookieParser()
 * 2. Security headers
 * 3. requestLogger
 * 4. /api/auth (unprotected)
 * 5. /api/hooks (unprotected, localhost-restricted in remote mode)
 * 6. Auth middleware (protects remaining /api/* routes)
 * 7. Protected routes (/api/settings, /api/sessions, /api/workers)
 */
export async function createAuthTestServer(
  options: AuthTestServerOptions,
): Promise<AuthTestServer> {
  const { authRequired, isHttps = false, tlsCert, tlsKey } = options;

  const db = createTestDb();
  const repo = new Repository(db);
  const authConfig = repo.getAuthConfig();

  // Sync authRequired in DB
  if (authConfig.authRequired !== authRequired) {
    repo.updateAuthConfig({ authRequired });
  }

  // Register local worker if none
  const localWorker = repo.getLocalWorker();
  if (!localWorker) {
    const settings = repo.getSettings();
    repo.createLocalWorker('Local', settings.maxConcurrentSessions);
  }

  const ptySpawner = createMockPtySpawner();
  const queueManager = new QueueManager(repo);
  const sessionManager = new SessionManager(repo, ptySpawner, queueManager);
  const workerManager = new WorkerManager(repo);

  const app = express();

  // 1. Body parsing + cookies
  app.use(express.json());
  app.use(cookieParser());

  // 2. Security headers (matches hub-entry.ts)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'",
    );
    next();
  });

  // 3. Request logging
  app.use(requestLogger);

  // 4. Auth routes (always accessible — no auth check)
  app.use('/api/auth', createAuthRouter(repo, authRequired, isHttps));

  // 5. Hooks routes (accessible without auth, but restricted to localhost when remote)
  app.use('/api/hooks', createHooksRouter(repo, authRequired));

  // 6. Auth middleware (applied to all remaining /api/* routes)
  app.use('/api', createAuthMiddleware(authConfig.jwtSecret, authRequired));

  // 7. Protected API routes
  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager));
  app.use('/api/workers', createWorkersRouter(repo, workerManager));

  // Files router — may fail without real working directories
  try {
    app.use('/api/sessions', createFilesRouter(repo));
  } catch {
    // Files router may fail without real working directories — OK
  }

  app.use(errorHandler);

  // Create HTTP or HTTPS server
  let server: http.Server | https.Server;
  if (isHttps && tlsCert && tlsKey) {
    server = https.createServer({ cert: tlsCert, key: tlsKey }, app);
  } else {
    server = http.createServer(app);
  }

  // Setup WebSocket with JWT auth
  setupWebSocket(server, repo, sessionManager, ptySpawner, undefined, authConfig.jwtSecret, authRequired);

  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      }
    });
  });

  return {
    app,
    server,
    port,
    repo,
    sessionManager,
    queueManager,
    workerManager,
    ptySpawner,
    db,
    close: async () => {
      sessionManager.destroy();
      workerManager.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      closeDb();
    },
  };
}

/**
 * Generate a valid test license key, activate it via /api/auth/activate,
 * and return the Set-Cookie header value for use in subsequent requests.
 */
export async function generateAndActivate(
  baseUrl: string,
  options?: { email?: string; plan?: string; maxSessions?: number },
): Promise<{ cookie: string; email: string; plan: string }> {
  const { generateTestLicenseKey } = await import('../helpers/license-helper.js');

  const email = options?.email || 'test@example.com';
  const plan = options?.plan || 'pro';
  const maxSessions = options?.maxSessions || 10;

  const licenseKey = generateTestLicenseKey({
    email,
    plan,
    maxSessions,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const res = await fetch(`${baseUrl}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey }),
  });

  if (!res.ok) {
    throw new Error(`Activation failed: ${res.status} ${await res.text()}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  if (!setCookie.includes('agentide_session=')) {
    throw new Error('No session cookie in activation response');
  }

  // Extract just the cookie name=value pair for forwarding
  const cookieValue = setCookie.split(';')[0];
  return { cookie: cookieValue, email, plan };
}

export function getBaseUrl(port: number, isHttps = false): string {
  return `${isHttps ? 'https' : 'http'}://localhost:${port}`;
}
