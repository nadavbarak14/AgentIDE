import express from 'express';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import { initDb } from './models/db.js';
import { Repository } from './models/repository.js';
import { PtySpawner } from './worker/pty-spawner.js';
import { RemotePtyBridge } from './worker/remote-pty-bridge.js';
import { ShellSpawner } from './worker/shell-spawner.js';
import { QueueManager } from './services/queue-manager.js';
import { SessionManager } from './services/session-manager.js';
import { WorkerManager } from './services/worker-manager.js';
import { ProjectService } from './services/project-service.js';
import { createSettingsRouter } from './api/routes/settings.js';
import { createSessionsRouter } from './api/routes/sessions.js';
import { createFilesRouter } from './api/routes/files.js';
import { createWorkersRouter } from './api/routes/workers.js';
import { createDirectoriesRouter } from './api/routes/directories.js';
import { createProjectsRouter } from './api/routes/projects.js';
import { createHooksRouter } from './api/routes/hooks.js';
import { createAuthRouter } from './api/routes/auth.js';
import { createGitHubRouter } from './api/routes/github.js';
import { createPreviewRouter } from './api/routes/preview.js';
import { createUploadsRouter } from './api/routes/uploads.js';
import { PreviewService } from './services/preview-service.js';
import { setupWebSocket, broadcastToSession } from './api/websocket.js';
import { FileWatcher } from './worker/file-watcher.js';
import { requestLogger, errorHandler, createAuthMiddleware } from './api/middleware.js';
import { loadTlsConfig, generateSelfSignedCert } from './auth/tls.js';
import { validateLicense, loadLicenseFromDisk } from './auth/license.js';
import { logger } from './services/logger.js';

export interface HubOptions {
  port?: number;
  host?: string;
  tls?: boolean;
  certPath?: string;
  keyPath?: string;
  selfSigned?: boolean;
  noAuth?: boolean;
}

export async function startHub(options: HubOptions = {}): Promise<http.Server> {
  const port = options.port || parseInt(process.env.PORT || '3000', 10);
  const host = options.host || process.env.HOST || '127.0.0.1';

  // Auth is required when binding to non-localhost, unless explicitly disabled
  const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const authRequired = !isLocalhost && !options.noAuth;
  const isHttps = options.tls || false;

  // Security warnings
  if (!isLocalhost && !isHttps) {
    logger.warn('WARNING: Binding to a non-localhost address without TLS. Traffic is unencrypted. Use --tls --self-signed for HTTPS.');
  }

  // Startup license check — refuse to start if auth required but no valid license
  if (authRequired) {
    const licenseKey = loadLicenseFromDisk();
    if (licenseKey) {
      const result = validateLicense(licenseKey);
      if (!result.valid) {
        logger.error({ error: result.error }, 'License validation failed');
        throw new Error(`Invalid license: ${result.error}. Run 'agentide activate <key>' to activate.`);
      }
      logger.info({ email: result.payload?.email, plan: result.payload?.plan }, 'License validated');
    } else {
      logger.warn('No license found — remote users will need to activate via browser');
    }
  }

  // Initialize database
  const db = initDb();
  const repo = new Repository(db);

  // Set authRequired in database
  const authConfig = repo.getAuthConfig();
  if (authConfig.authRequired !== authRequired) {
    repo.updateAuthConfig({ authRequired });
  }

  // Register local worker if none exists
  const localWorker = repo.getLocalWorker();
  if (!localWorker) {
    const settings = repo.getSettings();
    repo.createLocalWorker('Local', settings.maxConcurrentSessions);
    logger.info('registered local worker');
  }

  // Initialize services
  const ptySpawner = new PtySpawner({ hubPort: port });
  const shellSpawner = new ShellSpawner();
  const queueManager = new QueueManager(repo);
  const workerManager = new WorkerManager(repo);
  const tunnelManager = workerManager.getTunnelManager();
  const remotePtyBridge = new RemotePtyBridge(tunnelManager, { hubPort: port });
  const sessionManager = new SessionManager(repo, ptySpawner, queueManager, shellSpawner, remotePtyBridge, tunnelManager);
  const projectService = new ProjectService(repo);
  const previewService = new PreviewService(repo, sessionManager);

  // File watcher — watches session working directories for changes
  const fileWatcher = new FileWatcher();

  // Wire file change events → WebSocket broadcasts
  fileWatcher.on('changes', (event: { sessionId: string; paths: string[]; timestamp: string }) => {
    broadcastToSession(event.sessionId, {
      type: 'file_changed',
      paths: event.paths,
      timestamp: event.timestamp,
    });
  });

  fileWatcher.on('port_change', (event: { sessionId: string; port: number; pid: number; process: string; action: string }) => {
    broadcastToSession(event.sessionId, {
      type: 'port_change',
      port: event.port,
      pid: event.pid,
      process: event.process,
      action: event.action,
    });
  });

  // Start/stop watching when sessions activate/complete
  sessionManager.on('session_activated', (session: { id: string; workingDirectory: string; pid: number | null }) => {
    fileWatcher.startWatching(session.id, session.workingDirectory, session.pid || undefined);
  });

  sessionManager.on('session_completed', (sessionId: string) => {
    fileWatcher.stopWatching(sessionId);
  });

  sessionManager.on('session_failed', (sessionId: string) => {
    fileWatcher.stopWatching(sessionId);
  });

  // Resume sessions that were active before restart
  sessionManager.resumeSessions(ptySpawner);

  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Security headers (skip X-Frame-Options and CSP for proxy/serve routes used by preview iframe)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const isProxyRoute = req.path.includes('/proxy/') || req.path.includes('/proxy-url/') || req.path.includes('/serve/');
    if (!isProxyRoute) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss: https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net");
    }
    next();
  });

  app.use(requestLogger);

  // Auth routes (always accessible — no auth check)
  app.use('/api/auth', createAuthRouter(repo, authRequired, isHttps));

  // Hooks routes (accessible without auth, but restricted to localhost when remote)
  app.use('/api/hooks', createHooksRouter(repo, authRequired));

  // Auth middleware (applied to all remaining /api/* routes)
  app.use('/api', createAuthMiddleware(authConfig.jwtSecret, authRequired));

  // Protected API routes
  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createFilesRouter(repo));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager, projectService));
  app.use('/api/workers', createWorkersRouter(repo, workerManager, tunnelManager));
  app.use('/api/directories', createDirectoriesRouter());
  app.use('/api/projects', createProjectsRouter(repo, projectService));
  app.use('/api/sessions', createGitHubRouter(repo));
  app.use('/api/sessions', createPreviewRouter(repo, previewService));
  app.use('/api/sessions', createUploadsRouter(repo, previewService));

  // Serve inspect bridge script for preview iframe injection
  app.get('/api/inspect-bridge.js', (_req, res) => {
    const bridgePath = path.join(import.meta.dirname, 'api/inspect-bridge.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(bridgePath);
  });

  // ── Board command system ─────────────────────────────────────────────────
  // In-memory map for pending board commands that expect a result (view-* skills)
  const pendingCommands = new Map<string, {
    resolve: (result: Record<string, unknown>) => void;
    timeout: ReturnType<typeof setTimeout>;
    sessionId: string;
    action: string;
    createdAt: number;
  }>();

  // Clean up stale pending commands every 30s
  const staleCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [reqId, cmd] of pendingCommands.entries()) {
      if (now - cmd.createdAt > 60_000) {
        logger.warn({ requestId: reqId, action: cmd.action, sessionId: cmd.sessionId }, 'Cleaning up stale pending board command');
        cmd.resolve({ error: 'Timeout — command expired' });
        clearTimeout(cmd.timeout);
        pendingCommands.delete(reqId);
      }
    }
  }, 30_000);
  // Don't keep process alive just for cleanup
  staleCleanupInterval.unref();

  // Board command endpoint — skills POST here via curl to control the IDE view
  app.post('/api/sessions/:id/board-command', (req, res) => {
    const sessionId = req.params.id;
    const { command, params, requestId, waitForResult } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Missing command' });
      return;
    }

    // Broadcast to frontend via WebSocket
    broadcastToSession(sessionId, {
      type: 'board_command',
      sessionId,
      command,
      params: params || {},
      requestId: requestId || undefined,
    });

    // If the caller expects a result (view-* skills), register pending command
    if (waitForResult && requestId) {
      logger.info({ requestId, action: command, sessionId }, 'Board command awaiting result');
      // Store pending — will be resolved when frontend POSTs result
      const timeoutHandle = setTimeout(() => {
        if (pendingCommands.has(requestId)) {
          pendingCommands.delete(requestId);
          logger.warn({ requestId, action: command }, 'Board command timed out (60s)');
        }
      }, 60_000);
      timeoutHandle.unref();

      pendingCommands.set(requestId, {
        resolve: () => {}, // placeholder — result fetched via GET poll
        timeout: timeoutHandle,
        sessionId,
        action: command,
        createdAt: Date.now(),
      });
      res.status(202).json({ ok: true, requestId });
    } else {
      res.json({ ok: true });
    }
  });

  // Frontend sends board command results here after bridge execution
  app.post('/api/sessions/:id/board-command-result', (req, res) => {
    const { requestId, result, error } = req.body;
    if (!requestId) {
      res.status(400).json({ error: 'Missing requestId' });
      return;
    }

    const pending = pendingCommands.get(requestId);
    if (!pending) {
      // Result arrived but nobody waiting — could be already timed out
      logger.debug({ requestId }, 'Board command result for unknown/expired requestId');
      res.json({ ok: true });
      return;
    }

    logger.info({ requestId, action: pending.action }, 'Board command result received');
    clearTimeout(pending.timeout);

    // Store the result in-place so the polling GET can find it
    (pending as Record<string, unknown>).result = error ? { error } : (result || {});
    (pending as Record<string, unknown>).resolvedAt = Date.now();

    res.json({ ok: true });
  });

  // Skill scripts poll here for board command results
  app.get('/api/sessions/:id/board-command-result/:requestId', (req, res) => {
    const { requestId } = req.params;
    const pending = pendingCommands.get(requestId);

    if (!pending) {
      res.status(404).json({ error: 'Unknown requestId' });
      return;
    }

    const stored = pending as Record<string, unknown>;
    if (stored.result) {
      // Result is ready — return it and clean up
      logger.info({ requestId, action: pending.action }, 'Board command result delivered via poll');
      const result = stored.result;
      pendingCommands.delete(requestId);
      res.json({ requestId, result });
      return;
    }

    // Long-poll: wait up to 30s for the result
    const pollTimeout = 30_000;
    const startTime = Date.now();
    const pollInterval = setInterval(() => {
      const p = pendingCommands.get(requestId);
      if (!p) {
        clearInterval(pollInterval);
        res.status(408).json({ requestId, error: 'Timeout waiting for result' });
        return;
      }
      const s = p as Record<string, unknown>;
      if (s.result) {
        clearInterval(pollInterval);
        logger.info({ requestId, action: (p as Record<string, unknown>).action }, 'Board command result delivered via long-poll');
        const result = s.result;
        pendingCommands.delete(requestId);
        res.json({ requestId, result });
        return;
      }
      if (Date.now() - startTime > pollTimeout) {
        clearInterval(pollInterval);
        res.status(202).json({ requestId, status: 'pending' });
      }
    }, 200);
  });

  // Serve static frontend in production
  const frontendDist = path.join(import.meta.dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    // Cache hashed assets forever, never cache index.html
    app.use(express.static(frontendDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  // Create HTTP or HTTPS server
  let server: http.Server | https.Server;
  if (isHttps) {
    let tlsConfig;
    if (options.selfSigned) {
      tlsConfig = await generateSelfSignedCert();
    } else if (options.certPath && options.keyPath) {
      tlsConfig = loadTlsConfig(options.certPath, options.keyPath);
    } else {
      throw new Error('TLS enabled but no certificate provided. Use --self-signed or --cert/--key.');
    }
    server = https.createServer({ cert: tlsConfig.cert, key: tlsConfig.key }, app);
  } else {
    server = http.createServer(app);
  }
  setupWebSocket(server, repo, sessionManager, ptySpawner, fileWatcher, authConfig.jwtSecret, authRequired, shellSpawner, remotePtyBridge);

  // Start auto-dispatch
  queueManager.startAutoDispatch();

  // Start server
  server.listen(port, host, () => {
    logger.info(
      { port, host, authRequired, tls: isHttps },
      `AgentIDE Hub started on ${isHttps ? 'https' : 'http'}://${host}:${port}`,
    );
    if (!authRequired) {
      logger.info('Auth disabled (localhost mode)');
    }
  });

  // Start worker health checks
  workerManager.startHealthCheck();

  // Graceful shutdown
  const shutdown = () => {
    logger.info('shutting down...');
    queueManager.stopAutoDispatch();
    workerManager.destroy();
    fileWatcher.destroy();
    ptySpawner.destroy();
    server.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

// Direct execution (when run as hub-entry.ts directly)
const isDirectExecution = process.argv[1]?.endsWith('hub-entry.js') ||
  process.argv[1]?.endsWith('hub-entry.ts');
if (isDirectExecution) {
  startHub().catch((err) => {
    logger.error({ err }, 'failed to start hub');
    process.exit(1);
  });
}
