import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { initDb } from './models/db.js';
import { Repository } from './models/repository.js';
import { PtySpawner } from './worker/pty-spawner.js';
import { RemotePtyBridge } from './worker/remote-pty-bridge.js';
import { ShellSpawner } from './worker/shell-spawner.js';
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
import { createHealthRouter } from './api/routes/health.js';
import { createGitHubRouter } from './api/routes/github.js';
import { createPreviewRouter } from './api/routes/preview.js';
import { createUploadsRouter } from './api/routes/uploads.js';
import { PreviewService } from './services/preview-service.js';
import { setupWebSocket, broadcastToSession } from './api/websocket.js';
import { FileWatcher } from './worker/file-watcher.js';
import { requestLogger, errorHandler } from './api/middleware.js';
import { logger } from './services/logger.js';
import { checkPrerequisites, detectWSLVersion } from './services/prerequisites.js';

export interface HubOptions {
  port?: number;
  host?: string;
}

export async function startHub(options: HubOptions = {}): Promise<http.Server> {
  const port = options.port || parseInt(process.env.PORT || '3000', 10);
  const host = options.host || process.env.HOST || '127.0.0.1';

  const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  // Initialize database
  const db = initDb();
  const repo = new Repository(db);

  // Register local worker if none exists
  const localWorker = repo.getLocalWorker();
  if (!localWorker) {
    repo.createLocalWorker('Local', 999);
    logger.info('registered local worker');
  }

  // Initialize services
  const ptySpawner = new PtySpawner({ hubPort: port });
  const shellSpawner = new ShellSpawner();
  const workerManager = new WorkerManager(repo);
  const tunnelManager = workerManager.getTunnelManager();
  const remotePtyBridge = new RemotePtyBridge(tunnelManager, { hubPort: port });
  const sessionManager = new SessionManager(repo, ptySpawner, shellSpawner, remotePtyBridge, tunnelManager);
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
  // Parse JSON bodies for all routes EXCEPT proxy routes (proxy needs raw stream for piping)
  app.use((req, res, next) => {
    if (req.path.includes('/proxy/') || req.path.includes('/proxy-url/')) {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  // Security headers (skip X-Frame-Options and CSP for proxy/serve routes used by preview iframe)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const isProxyRoute = req.path.includes('/proxy/') || req.path.includes('/proxy-url/') || req.path.includes('/serve/');
    const isExtensionRoute = req.path.startsWith('/extensions/');
    if (!isProxyRoute && !isExtensionRoute) {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss: https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net");
    }
    next();
  });

  app.use(requestLogger);

  // Health check endpoint
  app.use('/api/health', createHealthRouter());

  // Hooks routes (restricted to localhost when server binds to non-localhost)
  app.use('/api/hooks', createHooksRouter(repo, !isLocalhost));

  // API routes
  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createFilesRouter(repo));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager, projectService, tunnelManager));
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

  // Dynamic extensions index — scans extensions/ directory at runtime (no rebuild needed)
  app.get('/api/extensions', (_req, res) => {
    const extensionsDir = path.join(import.meta.dirname, '../../extensions');
    if (!fs.existsSync(extensionsDir)) {
      res.json({ extensions: [] });
      return;
    }
    try {
      const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
      const names: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(extensionsDir, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          names.push(entry.name);
        }
      }
      res.json({ extensions: names.sort() });
    } catch {
      res.json({ extensions: [] });
    }
  });

  // Serve extension files dynamically from extensions/ directory (not build)
  app.use('/extensions', (req, res, next) => {
    const extensionsDir = path.join(import.meta.dirname, '../../extensions');
    if (!req.url) return next();
    const filePath = path.join(extensionsDir, req.url);
    // Prevent path traversal
    if (!filePath.startsWith(extensionsDir)) {
      res.status(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.sendFile(filePath);
    } else {
      next();
    }
  });

  // ─── Per-session extension management ───

  // Helper: get all skill names for an extension from its manifest
  function getExtensionSkillNames(extensionsDir: string, extName: string): { autoSkills: string[]; customSkills: { name: string; sourcePath: string }[] } {
    const manifestPath = path.join(extensionsDir, extName, 'manifest.json');
    let manifest: { skills?: string[]; panel?: unknown } = {};
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { return { autoSkills: [], customSkills: [] }; }

    const autoSkills = manifest.panel ? [
      `${extName}.open`, `${extName}.comment`, `${extName}.select-text`
    ] : [];

    const customSkills = (manifest.skills || []).map((s: string) => ({
      name: s.split('/').pop()!,
      sourcePath: path.join(extensionsDir, extName, s),
    }));

    return { autoSkills, customSkills };
  }

  // Helper: sync skills into a session's .claude/skills/ directory based on enabled extensions
  function syncSessionSkills(sessionWorkDir: string, enabled: string[]): { added: number; removed: number } {
    const extensionsDir = path.join(import.meta.dirname, '../../extensions');
    const hubSkillsDir = path.join(import.meta.dirname, '../../.claude-skills/skills');
    const sessionSkillsDir = path.join(sessionWorkDir, '.claude', 'skills');
    if (!fs.existsSync(sessionSkillsDir)) fs.mkdirSync(sessionSkillsDir, { recursive: true });

    // Build set of skill names that SHOULD be in the session
    const enabledSkillNames = new Set<string>();
    // Always include non-extension skills (built-in skills)
    const builtinSkills = ['open-file', 'open-preview', 'show-diff', 'show-panel',
      'view-click', 'view-navigate', 'view-read-page', 'view-record-start',
      'view-record-stop', 'view-screenshot', 'view-set-resolution', 'view-type'];
    for (const s of builtinSkills) enabledSkillNames.add(s);

    // Get all installed extensions
    const allExtensions: string[] = [];
    if (fs.existsSync(extensionsDir)) {
      for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && fs.existsSync(path.join(extensionsDir, entry.name, 'manifest.json'))) {
          allExtensions.push(entry.name);
        }
      }
    }

    // Add skills for enabled extensions
    for (const extName of enabled) {
      const { autoSkills, customSkills } = getExtensionSkillNames(extensionsDir, extName);
      for (const s of autoSkills) enabledSkillNames.add(s);
      for (const s of customSkills) enabledSkillNames.add(s.name);
    }

    let added = 0;
    let removed = 0;

    // Remove skills that shouldn't be there
    if (fs.existsSync(sessionSkillsDir)) {
      for (const entry of fs.readdirSync(sessionSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (!enabledSkillNames.has(entry.name)) {
          const p = path.join(sessionSkillsDir, entry.name);
          try {
            const stat = fs.lstatSync(p);
            if (stat.isSymbolicLink()) fs.unlinkSync(p);
            else fs.rmSync(p, { recursive: true });
            removed++;
          } catch { /* ignore */ }
        }
      }
    }

    // Add skills that should be there but aren't
    for (const skillName of enabledSkillNames) {
      const dest = path.join(sessionSkillsDir, skillName);
      if (fs.existsSync(dest)) continue;
      // Try to copy from hub skills dir
      const hubSource = path.join(hubSkillsDir, skillName);
      if (fs.existsSync(hubSource)) {
        try {
          fs.cpSync(hubSource, dest, { recursive: true });
          added++;
        } catch { /* ignore */ }
      }
    }

    return { added, removed };
  }

  // GET per-session enabled extensions
  app.get('/api/sessions/:id/extensions', (req, res) => {
    const enabled = repo.getSessionExtensions(req.params.id);
    res.json({ enabled });
  });

  // PUT per-session enabled extensions + live-sync skills
  app.put('/api/sessions/:id/extensions', (req, res) => {
    const { enabled } = req.body as { enabled?: string[] };
    if (!Array.isArray(enabled)) {
      res.status(400).json({ error: 'enabled must be an array of extension names' });
      return;
    }
    const session = repo.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Store in DB
    repo.setSessionExtensions(session.id, enabled);

    // Live-sync skills into session's .claude/skills/ directory
    const { added, removed } = syncSessionSkills(session.workingDirectory, enabled);

    res.json({ ok: true, enabled, added, removed });
  });

  // Legacy global toggle-skills (kept for backward compat / tests)
  app.post('/api/extensions/toggle-skills', (req, res) => {
    const { enabled } = req.body as { enabled?: string[] };
    if (!Array.isArray(enabled)) {
      res.status(400).json({ error: 'enabled must be an array of extension names' });
      return;
    }
    // No-op for global — per-session is the real mechanism now
    res.json({ ok: true, added: 0, removed: 0, enabled });
  });

  // Register extension skills (runs the register script and returns output)
  app.post('/api/register-extensions', (_req, res) => {
    const scriptPath = path.join(import.meta.dirname, '../../scripts/register-extension-skills.js');
    if (!fs.existsSync(scriptPath)) {
      res.status(404).json({ error: 'Register script not found' });
      return;
    }
    import('node:child_process').then(({ execFile }) => {
      execFile('node', [scriptPath], { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          res.status(500).json({ error: stderr || err.message, output: stdout });
          return;
        }
        res.json({ ok: true, output: stdout + stderr });
      });
    });
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

  const server = http.createServer(app);
  setupWebSocket(server, repo, sessionManager, ptySpawner, fileWatcher, shellSpawner, remotePtyBridge);

  // Start server
  server.listen(port, host, () => {
    logger.info(
      { port, host },
      `AgentIDE Hub started on http://${host}:${port}`,
    );
  });

  // Start worker health checks
  workerManager.startHealthCheck();

  // Check platform prerequisites (non-blocking warnings)
  detectWSLVersion();
  checkPrerequisites();

  // Graceful shutdown
  const shutdown = () => {
    logger.info('shutting down...');
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
