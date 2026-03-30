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
import { createGitHubRouter, createGithubCheckRouter } from './api/routes/github.js';
import { createPreviewRouter } from './api/routes/preview.js';
import { createUploadsRouter } from './api/routes/uploads.js';
import { PreviewService } from './services/preview-service.js';
import { GitHubService } from './services/github-service.js';
import { setupWebSocket, broadcastToSession, broadcastSessionStateChanged, handleViewCommand } from './api/websocket.js';
import { FileWatcher } from './worker/file-watcher.js';
import { requestLogger, errorHandler } from './api/middleware.js';
import { logger } from './services/logger.js';
import { checkPrerequisites, detectWSLVersion, requireTmux } from './services/prerequisites.js';
import { WebSocket as WsClient } from 'ws';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './api/routes/auth.js';
import { getLoginPageHtml } from './api/login-page.js';
import { requireAuth } from './api/middleware.js';
import { generateAccessKey, hashKey, generateCookieSecret } from './services/auth-service.js';

// ── Widget types (dynamic skill UI) ────────────────────────────────────────
interface Widget {
  name: string;
  html: string;
  sessionId: string;
  createdAt: number;
  result: Record<string, unknown> | null;
  resultAt: number | null;
}

const WIDGET_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WIDGET_HTML_MAX_BYTES = 512 * 1024; // 512 KB
const WIDGET_RESULT_MAX_BYTES = 1024 * 1024; // 1 MB

// In-memory widget store: sessionId → Map<widgetName, Widget>
const widgetStore = new Map<string, Map<string, Widget>>();

function getSessionWidgets(sessionId: string): Map<string, Widget> {
  let session = widgetStore.get(sessionId);
  if (!session) {
    session = new Map();
    widgetStore.set(sessionId, session);
  }
  return session;
}

function getWidget(sessionId: string, name: string): Widget | undefined {
  return widgetStore.get(sessionId)?.get(name);
}

function setWidget(sessionId: string, name: string, widget: Widget): void {
  getSessionWidgets(sessionId).set(name, widget);
}

function deleteWidget(sessionId: string, name: string): boolean {
  const session = widgetStore.get(sessionId);
  if (!session) return false;
  return session.delete(name);
}

export interface HubOptions {
  port?: number;
  host?: string;
  password?: string;
}

export interface HubResult {
  server: http.Server;
  url: string;
  port: number;
  host: string;
  accessKey?: string;
}

export async function startHub(options: HubOptions = {}): Promise<HubResult> {
  const port = options.port || parseInt(process.env.PORT || '24880', 10);
  const host = options.host || process.env.HOST || '0.0.0.0';

  const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '0.0.0.0';

  // Initialize database
  const db = initDb();
  const repo = new Repository(db);

  // Crash detection: check if previous hub exit was a crash
  const previousHubStatus = repo.getHubStatus();
  const wasCrash = previousHubStatus === 'running';
  if (wasCrash) {
    logger.warn('crash detected: hub_status was "running" from previous session');
  }

  // Clean up sessions that completed/failed more than 7 days ago.
  // Recent completed/failed sessions are preserved for user reference.
  const cleanedUp = repo.cleanupStaleSessions(7);
  if (cleanedUp > 0) {
    logger.info({ count: cleanedUp }, 'cleaned up sessions older than 7 days on startup');
  }

  // Set hub_status to 'running' before processing sessions
  repo.setHubStatus('running');

  // Register local worker if none exists
  const localWorker = repo.getLocalWorker();
  if (!localWorker) {
    repo.createLocalWorker('Local', 999);
    logger.info('registered local worker');
  }

  // Require tmux for local session crash resilience
  requireTmux();

  // ── Auth setup ─────────────────────────────────────────────────────────────
  let generatedAccessKey: string | undefined;
  if (options.password) {
    // User-provided password — reset auth config with it
    const keyHash = hashKey(options.password);
    const cookieSecret = generateCookieSecret();
    repo.setAuthConfig(keyHash, cookieSecret);
    generatedAccessKey = options.password;
    logger.info('Access key set from --password flag');
  } else {
    const existingAuth = repo.getAuthConfig();
    if (!existingAuth) {
      // First startup — generate and store access key
      const accessKey = generateAccessKey();
      const keyHash = hashKey(accessKey);
      const cookieSecret = generateCookieSecret();
      repo.setAuthConfig(keyHash, cookieSecret);
      generatedAccessKey = accessKey;
      logger.info('Generated new access key for remote authentication');
    } else {
      logger.info('Authentication configured for remote access');
    }
  }

  // Initialize services
  const ptySpawner = new PtySpawner({ hubPort: port });
  const shellSpawner = new ShellSpawner();
  const workerManager = new WorkerManager(repo, port);
  const tunnelManager = workerManager.getTunnelManager();
  const agentTunnelManager = workerManager.getAgentTunnelManager();
  const remotePtyBridge = new RemotePtyBridge(tunnelManager, { hubPort: port });
  const sessionManager = new SessionManager(repo, ptySpawner, shellSpawner, remotePtyBridge, tunnelManager);
  const projectService = new ProjectService(repo);
  const previewService = new PreviewService(repo, sessionManager);
  const githubService = new GitHubService(repo);

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
    if (event.action === 'detected') {
      broadcastToSession(event.sessionId, {
        type: 'port_detected',
        port: event.port,
        localPort: event.port,
        protocol: 'http',
      });
    } else if (event.action === 'closed') {
      broadcastToSession(event.sessionId, {
        type: 'port_closed',
        port: event.port,
      });
    }
  });

  // Track agent WebSocket connections per worker
  const agentWsConnections = new Map<string, WsClient>();

  /** Register a session with the remote agent and connect WebSocket for events */
  function registerWithAgent(sessionId: string, workingDirectory: string, pid: number | null, workerId: string): void {
    const agentPort = agentTunnelManager.getLocalPort(workerId);
    if (!agentPort) {
      logger.warn({ sessionId, workerId }, 'cannot register session with agent: no tunnel');
      return;
    }

    // POST /api/sessions/:id/register
    const postData = JSON.stringify({ workingDirectory, pid });
    const req = http.request({
      hostname: '127.0.0.1',
      port: agentPort,
      path: `/api/sessions/${sessionId}/register`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      res.resume(); // Drain response
      res.on('end', () => {
        logger.info({ sessionId, workerId, status: res.statusCode }, 'session registered with remote agent');
      });
    });
    req.on('error', (err) => {
      logger.warn({ sessionId, workerId, error: err.message }, 'failed to register session with agent');
    });
    req.end(postData);

    // Connect WebSocket to agent for file/port events (if not already connected)
    if (!agentWsConnections.has(workerId)) {
      const ws = new WsClient(`ws://127.0.0.1:${agentPort}/ws/events`);
      ws.on('open', () => {
        logger.info({ workerId }, 'connected to agent WebSocket');
      });
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'file_changed' && msg.sessionId) {
            broadcastToSession(msg.sessionId, {
              type: 'file_changed',
              paths: msg.paths,
              timestamp: msg.timestamp,
            });
          } else if (msg.type === 'port_change' && msg.sessionId) {
            if (msg.action === 'detected') {
              broadcastToSession(msg.sessionId, {
                type: 'port_detected',
                port: msg.port,
                localPort: msg.port,
                protocol: 'http',
              });
            } else if (msg.action === 'closed') {
              broadcastToSession(msg.sessionId, {
                type: 'port_closed',
                port: msg.port,
              });
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });
      ws.on('close', () => {
        logger.info({ workerId }, 'agent WebSocket closed');
        agentWsConnections.delete(workerId);
      });
      ws.on('error', (err) => {
        logger.warn({ workerId, error: err.message }, 'agent WebSocket error');
      });
      agentWsConnections.set(workerId, ws);
    }
  }

  /** Unregister a session from the remote agent */
  function unregisterFromAgent(sessionId: string, workerId: string): void {
    const agentPort = agentTunnelManager.getLocalPort(workerId);
    if (!agentPort) return;

    const req = http.request({
      hostname: '127.0.0.1',
      port: agentPort,
      path: `/api/sessions/${sessionId}/register`,
      method: 'DELETE',
    }, () => {
      logger.info({ sessionId, workerId }, 'session unregistered from remote agent');
    });
    req.on('error', (err) => {
      logger.warn({ sessionId, workerId, error: err.message }, 'failed to unregister session from agent');
    });
    req.end();
  }

  // Start/stop watching when sessions activate/complete
  sessionManager.on('session_activated', (session: { id: string; workingDirectory: string; pid: number | null; workerId: string | null }) => {
    if (session.workerId) {
      const worker = repo.getWorker(session.workerId);
      if (worker?.type === 'remote' && worker.remoteAgentPort && agentTunnelManager.isConnected(worker.id)) {
        registerWithAgent(session.id, session.workingDirectory, session.pid, worker.id);
        broadcastSessionStateChanged(session.id, { status: 'active' });
        return;
      }
    }
    fileWatcher.startWatching(session.id, session.workingDirectory, session.pid || undefined);
    broadcastSessionStateChanged(session.id, { status: 'active' });
  });

  sessionManager.on('session_completed', (sessionId: string) => {
    const session = repo.getSession(sessionId);
    if (session?.workerId) {
      const worker = repo.getWorker(session.workerId);
      if (worker?.type === 'remote' && worker.remoteAgentPort) {
        unregisterFromAgent(sessionId, worker.id);
      }
    }
    fileWatcher.stopWatching(sessionId);
    widgetStore.delete(sessionId);
    broadcastSessionStateChanged(sessionId, { status: 'completed' });
  });

  sessionManager.on('session_failed', (sessionId: string) => {
    const session = repo.getSession(sessionId);
    if (session?.workerId) {
      const worker = repo.getWorker(session.workerId);
      if (worker?.type === 'remote' && worker.remoteAgentPort) {
        unregisterFromAgent(sessionId, worker.id);
      }
    }
    fileWatcher.stopWatching(sessionId);
    widgetStore.delete(sessionId);
    broadcastSessionStateChanged(sessionId, { status: 'failed' });
  });

  sessionManager.on('session_recovering', (sessionId: string, workerId: string) => {
    broadcastToSession(sessionId, {
      type: 'session_recovering',
      sessionId,
      workerId,
      message: 'Reconnecting to remote session...',
    });
  });

  sessionManager.on('needs_input_changed', (sessionId: string, needsInput: boolean) => {
    broadcastSessionStateChanged(sessionId, { needsInput });
  });

  // Resume sessions that were active before restart
  // This marks all active sessions as 'crashed' so recovery can attempt tmux reattachment
  sessionManager.resumeSessions(ptySpawner, wasCrash);

  // Always attempt recovery of local sessions via tmux reattachment
  // tmux sessions survive both clean restarts and crashes
  try {
    const recovered = sessionManager.recoverCrashedLocalSessions();
    if (recovered > 0) {
      logger.info({ recovered }, 'recovered local sessions via tmux reattachment');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'failed to recover local sessions');
  }

  // Reconnect existing remote workers on startup (fire and forget)
  // After connecting, always attempt to recover sessions via tmux reattachment
  for (const worker of repo.listWorkers().filter((w) => w.type === 'remote')) {
    workerManager.connectWorker(worker).then(async () => {
      // After worker reconnects, attempt recovery of remote sessions via tmux
      try {
        const recovered = await sessionManager.recoverCrashedRemoteSessions();
        if (recovered > 0) {
          logger.info({ workerId: worker.id, recovered }, 'recovered remote sessions via tmux after worker reconnect');
        }
      } catch (err) {
        logger.warn({ workerId: worker.id, err: (err as Error).message }, 'failed to recover remote sessions');
      }

      if (!worker.remoteAgentPort) return;
      // Re-register all active sessions for this worker with the remote agent
      const activeSessions = repo.listSessions().filter(
        (s) => s.workerId === worker.id && s.status === 'active',
      );
      for (const session of activeSessions) {
        registerWithAgent(session.id, session.workingDirectory, session.pid ?? null, worker.id);
        logger.info({ sessionId: session.id, workerId: worker.id }, 're-registered session with remote agent on startup');
      }
    }).catch((err: Error) => {
      logger.warn({ workerId: worker.id, host: worker.sshHost, err: err.message }, 'failed to reconnect worker on startup');
    });
  }

  // Preserve completed/failed sessions across restarts — users expect session history to persist

  // Create Express app
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Parse cookies for auth
  app.use(cookieParser());

  // Security headers (skip X-Frame-Options and CSP for serve routes used by preview iframe)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const isServeRoute = req.path.includes('/serve/');
    const isExtensionRoute = req.path.startsWith('/extensions/');
    if (!isServeRoute && !isExtensionRoute) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' 'unsafe-inline' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss: https://cdn.jsdelivr.net blob:; font-src 'self' data: https://cdn.jsdelivr.net; frame-src 'self' http://localhost:* http: https:");
    }
    next();
  });

  app.use(requestLogger);

  // Health check endpoint (always open)
  app.use('/api/health', createHealthRouter());

  // Auth routes (before auth middleware — login must be accessible)
  app.use('/api/auth', createAuthRouter(repo));

  // Login page (before auth middleware)
  app.get('/login', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(getLoginPageHtml());
  });

  // PWA assets — serve before auth so manifest.json doesn't redirect to login
  const frontendDistForPwa = path.join(import.meta.dirname, '../../frontend/dist');
  for (const file of ['manifest.json', 'icon.svg']) {
    const filePath = path.join(frontendDistForPwa, file);
    app.get(`/${file}`, (_req, res) => {
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).end();
      }
    });
  }

  // Extension static files — serve before auth (public assets, no user data).
  // Without this, iframes on non-localhost get redirected to /login.
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

  // Auth middleware — gates all subsequent routes for non-localhost
  app.use(requireAuth(repo));

  // Hooks routes (restricted to localhost when server binds to non-localhost)
  app.use('/api/hooks', createHooksRouter(repo, !isLocalhost, (sessionId, needsInput, waitReason) => {
    sessionManager.emit('needs_input_changed', sessionId, needsInput, waitReason);
  }));

  // API routes
  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createFilesRouter(repo, agentTunnelManager));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager, projectService, tunnelManager, widgetStore));
  app.use('/api/workers', createWorkersRouter(repo, workerManager, tunnelManager));
  app.use('/api/directories', createDirectoriesRouter());
  app.use('/api/projects', createProjectsRouter(repo, projectService));
  app.use('/api/sessions', createGitHubRouter(repo));
  app.use('/api/github', createGithubCheckRouter(githubService));
  app.use('/api/sessions', createPreviewRouter(repo, previewService, agentTunnelManager));
  app.use('/api/sessions', createUploadsRouter(repo, previewService));

  // Serve inspect bridge script for preview iframe injection (after requireAuth)
  app.get('/api/inspect-bridge.js', (_req, res) => {
    const bridgePath = path.join(import.meta.dirname, 'api/inspect-bridge.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(bridgePath);
  });

  // Serve widget bridge SDK for dynamic skill UI widgets (after requireAuth)
  app.get('/api/widget-bridge.js', (_req, res) => {
    const bridgePath = path.join(import.meta.dirname, 'api/widget-bridge.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(bridgePath);
  });

  // Dynamic extensions index — scans extensions/ directory at runtime (after requireAuth)
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

  // NOTE: Extension static files are served before auth middleware (see above).
  // The /api/extensions index and per-session management routes below still require auth.

  // ─── Per-session extension management ───

  // Helper: get all skill names for an extension from its manifest
  function getExtensionSkillNames(extensionsDir: string, extName: string): { autoSkills: string[]; customSkills: { name: string; sourcePath: string }[] } {
    const manifestPath = path.join(extensionsDir, extName, 'manifest.json');
    let manifest: { skills?: string[]; panel?: unknown } = {};
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { return { autoSkills: [], customSkills: [] }; }

    const autoSkills = manifest.panel ? [
      `adyx.${extName}.open`, `adyx.${extName}.comment`, `adyx.${extName}.select-text`
    ] : [];

    const customSkills = (manifest.skills || []).map((s: string) => ({
      name: s.split('/').pop()!,
      sourcePath: path.join(extensionsDir, extName, s),
    }));

    return { autoSkills, customSkills };
  }

  // Helper: sync skills into a session's .claude/skills/ directory based on enabled extensions.
  // Only works for local sessions — remote session paths are not accessible from the hub.
  // Also syncs into any active worktree directories under .claude/worktrees/.
  function syncSessionSkills(sessionWorkDir: string, enabled: string[]): { added: number; removed: number } {
    const extensionsDir = path.join(import.meta.dirname, '../../extensions');
    const hubSkillsDir = path.join(import.meta.dirname, '../../.claude-skills/skills');
    const sessionSkillsDir = path.join(sessionWorkDir, '.claude', 'skills');
    try {
      if (!fs.existsSync(sessionSkillsDir)) fs.mkdirSync(sessionSkillsDir, { recursive: true });
    } catch {
      // Remote session path not accessible locally — skip
      return { added: 0, removed: 0 };
    }

    // Build set of skill names that SHOULD be in the session
    const enabledSkillNames = new Set<string>();
    // Always include non-extension skills (built-in skills from adyx-core)
    const builtinSkills = ['adyx.open-file', 'adyx.open-preview', 'adyx.show-diff', 'adyx.show-panel',
      'adyx.view-click', 'adyx.view-navigate', 'adyx.view-read-page', 'adyx.view-record-start',
      'adyx.view-record-stop', 'adyx.view-screenshot', 'adyx.view-set-resolution', 'adyx.view-set-viewport',
      'adyx.view-type', 'adyx.widget-create', 'adyx.widget-dismiss', 'adyx.widget-get-result'];
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

    // Add skills that should be there but aren't (or are broken stubs)
    const copySkillDir = (source: string, dest: string): boolean => {
      try {
        if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return false;
        fs.cpSync(source, dest, { recursive: true });
        // Ensure shell scripts are executable after copy
        const scriptsDir = path.join(dest, 'scripts');
        if (fs.existsSync(scriptsDir)) {
          for (const f of fs.readdirSync(scriptsDir)) {
            if (f.endsWith('.sh')) {
              fs.chmodSync(path.join(scriptsDir, f), 0o755);
            }
          }
        }
        return true;
      } catch { return false; }
    };

    for (const skillName of enabledSkillNames) {
      const dest = path.join(sessionSkillsDir, skillName);
      // Skip if already a valid directory with SKILL.md or scripts/
      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) continue;
      // Remove broken stub (file instead of directory — e.g. stale symlink target)
      if (fs.existsSync(dest) && !fs.statSync(dest).isDirectory()) {
        try { fs.rmSync(dest); } catch { /* ignore */ }
      }
      // Try hub skills dir first, then extension directories
      if (copySkillDir(path.join(hubSkillsDir, skillName), dest)) {
        added++;
      } else {
        // Search all installed extension skill directories
        for (const extName of allExtensions) {
          const extSkillSource = path.join(extensionsDir, extName, 'skills', skillName);
          if (copySkillDir(extSkillSource, dest)) {
            added++;
            break;
          }
        }
      }
    }

    // Also sync skills into active worktree directories (Claude --worktree runs from .claude/worktrees/<name>/)
    const worktreesDir = path.join(sessionWorkDir, '.claude', 'worktrees');
    try {
      if (fs.existsSync(worktreesDir)) {
        for (const entry of fs.readdirSync(worktreesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const wtSkillsDir = path.join(worktreesDir, entry.name, '.claude', 'skills');
          try {
            if (!fs.existsSync(wtSkillsDir)) fs.mkdirSync(wtSkillsDir, { recursive: true });
            // Copy each enabled skill into the worktree's skills dir
            for (const skillName of enabledSkillNames) {
              const srcSkill = path.join(sessionSkillsDir, skillName);
              const destSkill = path.join(wtSkillsDir, skillName);
              if (fs.existsSync(srcSkill) && fs.statSync(srcSkill).isDirectory() && !fs.existsSync(destSkill)) {
                copySkillDir(srcSkill, destSkill);
              }
            }
            // Remove skills that shouldn't be in the worktree
            for (const wtEntry of fs.readdirSync(wtSkillsDir, { withFileTypes: true })) {
              if (!wtEntry.isDirectory() && !wtEntry.isSymbolicLink()) continue;
              if (!enabledSkillNames.has(wtEntry.name)) {
                const p = path.join(wtSkillsDir, wtEntry.name);
                try {
                  const stat = fs.lstatSync(p);
                  if (stat.isSymbolicLink()) fs.unlinkSync(p);
                  else fs.rmSync(p, { recursive: true });
                } catch { /* ignore */ }
              }
            }
          } catch { /* skip inaccessible worktrees */ }
        }
      }
    } catch { /* ignore worktree sync errors */ }

    return { added, removed };
  }

  // Helper: get all available extension names
  function getAllExtensionNames(): string[] {
    const extensionsDir = path.join(import.meta.dirname, '../../extensions');
    if (!fs.existsSync(extensionsDir)) return [];
    try {
      return fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(extensionsDir, e.name, 'manifest.json')))
        .map(e => e.name)
        .sort();
    } catch { return []; }
  }

  // GET per-session enabled extensions (auto-enables all on first access)
  app.get('/api/sessions/:id/extensions', (req, res) => {
    let enabled = repo.getSessionExtensions(req.params.id);
    // Auto-enable all extensions for new sessions that haven't been configured yet
    if (enabled.length === 0) {
      const all = getAllExtensionNames();
      if (all.length > 0) {
        repo.setSessionExtensions(req.params.id, all);
        const session = repo.getSession(req.params.id);
        if (session) syncSessionSkills(session.workingDirectory, all);
        enabled = all;
      }
    }
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
      if (now - cmd.createdAt > 120_000) {
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
  app.post('/api/sessions/:id/board-command', async (req, res) => {
    const sessionId = req.params.id;
    const { command, params, requestId, waitForResult } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Missing command' });
      return;
    }

    // Try to handle view-* commands directly on the backend via CDP
    if (command.startsWith('view-') && waitForResult && requestId) {
      logger.info({ requestId, action: command, sessionId }, 'Handling view command via backend CDP');

      // Also broadcast to frontend for UI updates (e.g., open preview panel)
      broadcastToSession(sessionId, {
        type: 'board_command',
        sessionId,
        command,
        params: params || {},
        requestId,
      });

      try {
        const result = await handleViewCommand(sessionId, command, params || {});
        if (result !== null) {
          // Store result for the polling GET endpoint
          const timeoutHandle = setTimeout(() => { pendingCommands.delete(requestId); }, 30_000);
          timeoutHandle.unref();
          pendingCommands.set(requestId, {
            resolve: () => {},
            timeout: timeoutHandle,
            sessionId,
            action: command,
            createdAt: Date.now(),
          });
          (pendingCommands.get(requestId) as Record<string, unknown>).result = result;
          (pendingCommands.get(requestId) as Record<string, unknown>).resolvedAt = Date.now();
          res.status(202).json({ ok: true, requestId });
          return;
        }
      } catch (err) {
        logger.error({ err, command, sessionId }, 'view command handler failed');
      }
      // Fall through to normal flow if handler returned null
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
          logger.warn({ requestId, action: command }, 'Board command timed out (120s)');
        }
      }, 120_000);
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

  // ── Dynamic Skill UI — Widget endpoints ──────────────────────────────────

  // POST /api/sessions/:id/widget — create or replace a widget
  app.post('/api/sessions/:id/widget', (req, res) => {
    const sessionId = req.params.id;
    const { name, html } = req.body as { name?: string; html?: string };

    if (!name || !html) {
      res.status(400).json({ error: 'Missing name or html' });
      return;
    }

    if (!WIDGET_NAME_PATTERN.test(name)) {
      logger.warn({ sessionId, widgetName: name, action: 'create' }, 'Widget name validation failed');
      res.status(400).json({ error: 'Invalid widget name — must be lowercase alphanumeric with hyphens' });
      return;
    }

    const htmlBytes = Buffer.byteLength(html, 'utf-8');
    if (htmlBytes > WIDGET_HTML_MAX_BYTES) {
      logger.warn({ sessionId, widgetName: name, action: 'create', size: htmlBytes }, 'Widget HTML exceeds size limit');
      res.status(413).json({ error: 'Widget HTML exceeds 512KB limit' });
      return;
    }

    const existing = getWidget(sessionId, name);
    const replaced = !!existing;

    const widget: Widget = {
      name,
      html,
      sessionId,
      createdAt: Date.now(),
      result: null,
      resultAt: null,
    };
    setWidget(sessionId, name, widget);

    // Broadcast board command to frontend
    broadcastToSession(sessionId, {
      type: 'board_command',
      sessionId,
      command: 'widget.create',
      params: { name, html },
    });

    logger.info({ sessionId, widgetName: name, action: replaced ? 'replace' : 'create' }, 'Widget created');
    res.json({ ok: true, name, ...(replaced ? { replaced: true } : { created: true }) });
  });

  // DELETE /api/sessions/:id/widget/:name — dismiss a widget
  app.delete('/api/sessions/:id/widget/:name', (req, res) => {
    const sessionId = req.params.id;
    const { name } = req.params;

    if (!deleteWidget(sessionId, name)) {
      res.status(404).json({ error: 'Widget not found' });
      return;
    }

    broadcastToSession(sessionId, {
      type: 'board_command',
      sessionId,
      command: 'widget.dismiss',
      params: { name },
    });

    logger.info({ sessionId, widgetName: name, action: 'dismiss' }, 'Widget dismissed');
    res.json({ ok: true, name });
  });

  // POST /api/sessions/:id/widget/:name/result — submit widget result from frontend
  app.post('/api/sessions/:id/widget/:name/result', (req, res) => {
    const sessionId = req.params.id;
    const { name } = req.params;
    const { data } = req.body as { data?: unknown };

    const widget = getWidget(sessionId, name);
    if (!widget) {
      res.status(404).json({ error: 'Widget not found' });
      return;
    }

    // Check result size
    const resultJson = JSON.stringify(data ?? {});
    if (Buffer.byteLength(resultJson, 'utf-8') > WIDGET_RESULT_MAX_BYTES) {
      logger.warn({ sessionId, widgetName: name, action: 'result' }, 'Widget result exceeds size limit');
      res.status(413).json({ error: 'Result exceeds 1MB limit' });
      return;
    }

    widget.result = (data ?? {}) as Record<string, unknown>;
    widget.resultAt = Date.now();

    logger.info({ sessionId, widgetName: name, action: 'result' }, 'Widget result received');
    res.json({ ok: true });
  });

  // GET /api/sessions/:id/widget/:name/result — poll for widget result
  app.get('/api/sessions/:id/widget/:name/result', (req, res) => {
    const sessionId = req.params.id;
    const { name } = req.params;

    const widget = getWidget(sessionId, name);
    if (!widget) {
      res.status(404).json({ error: 'Widget not found' });
      return;
    }

    if (widget.result !== null) {
      res.json({ status: 'ready', result: widget.result, receivedAt: widget.resultAt });
    } else {
      res.json({ status: 'pending' });
    }
  });

  // GET /api/sessions/:id/widgets — list all widgets for a session
  app.get('/api/sessions/:id/widgets', (req, res) => {
    const sessionId = req.params.id;
    const session = widgetStore.get(sessionId);
    if (!session || session.size === 0) {
      res.json({ widgets: [] });
      return;
    }

    const widgets = Array.from(session.values()).map(w => ({
      name: w.name,
      html: w.html,
      createdAt: w.createdAt,
      hasResult: w.result !== null,
    }));
    res.json({ widgets });
  });

  // Debug endpoint for memory observability (must be before static frontend catch-all)
  app.get('/api/debug/memory', (_req, res) => {
    let totalWidgets = 0;
    for (const sessionWidgets of widgetStore.values()) {
      totalWidgets += sessionWidgets.size;
    }
    res.json({
      process: process.memoryUsage(),
      resources: {
        widgetSessions: widgetStore.size,
        totalWidgets,
        pendingCommands: pendingCommands.size,
        agentConnections: agentWsConnections.size,
        activePtys: sessionManager.activePtyCount,
      },
    });
  });

  // Serve static frontend in production
  const frontendDist = path.join(import.meta.dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    // Hashed assets (e.g. index-Dt79MJ_j.js) can be cached long-term.
    // Non-hashed assets and HTML are never cached to ensure rebuilds take effect immediately.
    app.use(express.static(frontendDist, {
      setHeaders: (res, filePath) => {
        // Vite hashes asset filenames — safe to cache indefinitely
        const isHashed = /[-.][a-zA-Z0-9]{8,}\.(js|css|woff2?)$/.test(filePath);
        if (isHashed) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
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
  setupWebSocket(
    server, repo, sessionManager, ptySpawner, fileWatcher, shellSpawner, remotePtyBridge, agentTunnelManager,
  );

  // Start server
  await new Promise<void>((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        const msg = `\n  Port ${port} is already in use.\n\n  Another instance of Adyx (or another process) is using this port.\n  To fix this, either:\n    1. Stop the other process: lsof -ti :${port} | xargs kill\n    2. Use a different port: PORT=${port + 1} adyx\n`;
        logger.error({ port }, `Port ${port} is already in use`);
        console.error(msg);
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
    server.listen(port, host, () => {
      logger.info(
        { port, host },
        `Adyx started on http://${host}:${port}`,
      );
      resolve();
    });
  });

  // Start worker health checks
  workerManager.startHealthCheck();

  // Sync extension skills for all active sessions on startup
  // (ensures skills persist after server restarts, worktree recreation, etc.)
  try {
    const activeSess = repo.listSessions('active');
    const allExts = getAllExtensionNames();
    for (const s of activeSess) {
      let enabled = repo.getSessionExtensions(s.id);
      // Auto-enable all extensions for sessions that haven't been configured
      if (enabled.length === 0 && allExts.length > 0) {
        repo.setSessionExtensions(s.id, allExts);
        enabled = allExts;
      }
      if (enabled.length > 0) {
        syncSessionSkills(s.workingDirectory, enabled);
      }
    }
    if (activeSess.length > 0) {
      logger.info({ count: activeSess.length }, 'synced extension skills for active sessions on startup');
    }
  } catch (err) {
    logger.warn({ err }, 'failed to sync extension skills on startup');
  }

  // Check platform prerequisites (non-blocking warnings)
  detectWSLVersion();
  checkPrerequisites();

  // Graceful shutdown
  const shutdown = () => {
    logger.info('shutting down...');
    // Set hub_status to 'stopped' FIRST — crash detection relies on this flag
    repo.setHubStatus('stopped');
    for (const [, ws] of agentWsConnections) {
      ws.close();
    }
    agentWsConnections.clear();
    workerManager.destroy();
    fileWatcher.destroy();
    ptySpawner.destroy();
    server.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const actualPort = (server.address() as import('node:net').AddressInfo)?.port || port;
  return { server, url: `http://${displayHost}:${actualPort}`, port: actualPort, host, accessKey: generatedAccessKey };
}

// Direct execution (when run as hub-entry.ts directly)
const isDirectExecution = process.argv[1]?.endsWith('hub-entry.js') ||
  process.argv[1]?.endsWith('hub-entry.ts');
if (isDirectExecution) {
  // Parse CLI args: node hub-entry.js [--password <pw>] [password]
  const args = process.argv.slice(2);
  const options: HubOptions = {};
  const pwIndex = args.indexOf('--password');
  if (pwIndex !== -1 && args[pwIndex + 1]) {
    options.password = args[pwIndex + 1];
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    // Legacy: bare positional argument as password
    options.password = args[0];
  }
  startHub(options).catch((err) => {
    logger.error({ err }, 'failed to start hub');
    process.exit(1);
  });
}
