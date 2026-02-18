import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { initDb } from './models/db.js';
import { Repository } from './models/repository.js';
import { PtySpawner } from './worker/pty-spawner.js';
import { QueueManager } from './services/queue-manager.js';
import { SessionManager } from './services/session-manager.js';
import { WorkerManager } from './services/worker-manager.js';
import { createSettingsRouter } from './api/routes/settings.js';
import { createSessionsRouter } from './api/routes/sessions.js';
import { createFilesRouter } from './api/routes/files.js';
import { createWorkersRouter } from './api/routes/workers.js';
import { createDirectoriesRouter } from './api/routes/directories.js';
import { createHooksRouter } from './api/routes/hooks.js';
import { setupWebSocket, broadcastToSession } from './api/websocket.js';
import { FileWatcher } from './worker/file-watcher.js';
import { requestLogger, errorHandler } from './api/middleware.js';
import { logger } from './services/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Initialize database
  const db = initDb();
  const repo = new Repository(db);

  // Register local worker if none exists
  const localWorker = repo.getLocalWorker();
  if (!localWorker) {
    const settings = repo.getSettings();
    repo.createLocalWorker('Local', settings.maxConcurrentSessions);
    logger.info('registered local worker');
  }

  // Initialize services
  const ptySpawner = new PtySpawner({ hubPort: PORT });
  const queueManager = new QueueManager(repo);
  const sessionManager = new SessionManager(repo, ptySpawner, queueManager);
  const workerManager = new WorkerManager(repo);

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
  app.use(requestLogger);

  // API routes
  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager));
  app.use('/api/sessions', createFilesRouter(repo));
  app.use('/api/workers', createWorkersRouter(repo, workerManager));
  app.use('/api/directories', createDirectoriesRouter());
  app.use('/api/hooks', createHooksRouter(repo));

  // Serve static frontend in production
  const frontendDist = path.join(import.meta.dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app);
  setupWebSocket(server, repo, sessionManager, ptySpawner, fileWatcher);

  // Start auto-dispatch
  queueManager.startAutoDispatch();

  // Start server
  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'C3 Hub started');
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
}

main().catch((err) => {
  logger.error({ err }, 'failed to start hub');
  process.exit(1);
});
