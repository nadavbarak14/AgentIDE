import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Repository } from '../models/repository.js';
import type { SessionManager } from '../services/session-manager.js';
import type { PtySpawner } from '../worker/pty-spawner.js';
import type { FileWatcher } from '../worker/file-watcher.js';
import type { WsClientMessage, BoardCommand } from '../models/types.js';
import { createSessionLogger, logger } from '../services/logger.js';
import { verifyToken, COOKIE_NAME } from '../auth/jwt.js';

// Map of sessionId → Set of connected WebSocket clients
const sessionClients = new Map<string, Set<WebSocket>>();

export function setupWebSocket(
  server: Server,
  repo: Repository,
  sessionManager: SessionManager,
  ptySpawner: PtySpawner,
  fileWatcher?: FileWatcher,
  jwtSecret?: string,
  authRequired?: boolean,
): void {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/sessions\/([a-f0-9-]+)$/);

    if (!match) {
      socket.destroy();
      return;
    }

    // JWT auth check on WebSocket upgrade (when auth is required)
    if (authRequired && jwtSecret) {
      const cookieHeader = request.headers.cookie || '';
      const cookies: Record<string, string> = {};
      for (const pair of cookieHeader.split(';')) {
        const [key, ...vals] = pair.trim().split('=');
        if (key) cookies[key.trim()] = vals.join('=').trim();
      }
      const token = cookies[COOKIE_NAME];
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const payload = await verifyToken(token, jwtSecret);
      if (!payload) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    const sessionId = match[1];
    const session = repo.getSession(sessionId);

    if (!session) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, sessionId);
    });
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket, sessionId: string) => {
    const log = createSessionLogger(sessionId);
    log.info('websocket client connected');

    // Register client
    const isFirstClient = !sessionClients.has(sessionId) || sessionClients.get(sessionId)!.size === 0;
    if (!sessionClients.has(sessionId)) {
      sessionClients.set(sessionId, new Set());
    }
    sessionClients.get(sessionId)!.add(ws);

    // Start file watching when first client connects (works for any session status)
    if (isFirstClient && fileWatcher) {
      const sess = repo.getSession(sessionId);
      if (sess && !fileWatcher.isWatching(sessionId)) {
        fileWatcher.startWatching(sessionId, sess.workingDirectory, sess.pid || undefined);
      }
    }

    // Send current session status
    const session = repo.getSession(sessionId);
    if (session) {
      ws.send(
        JSON.stringify({
          type: 'session_status',
          sessionId: session.id,
          status: session.status,
          claudeSessionId: session.claudeSessionId,
          pid: session.pid,
        }),
      );
    }

    // Send scrollback if available
    const scrollback = ptySpawner.loadScrollback(sessionId);
    if (scrollback) {
      ws.send(Buffer.from(scrollback), { binary: true });
    }

    // Handle incoming messages
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary: raw keyboard input → PTY
        ptySpawner.write(sessionId, data.toString());
        return;
      }

      // Text: JSON control message
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;
        switch (msg.type) {
          case 'input':
            sessionManager.sendInput(sessionId, msg.data);
            break;
          case 'resize':
            sessionManager.resizeSession(sessionId, msg.cols, msg.rows);
            break;
          case 'auto_approve':
            // Store per-session auto-approve preference
            log.info({ enabled: msg.enabled }, 'auto_approve toggled');
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      log.info('websocket client disconnected');
      const clients = sessionClients.get(sessionId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          sessionClients.delete(sessionId);
          // Stop file watching when last client disconnects (unless session is active — PTY still running)
          const sess = repo.getSession(sessionId);
          if (fileWatcher && sess && sess.status !== 'active') {
            fileWatcher.stopWatching(sessionId);
          }
        }
      }
    });
  });

  // Forward PTY output to all connected WebSocket clients for a session
  ptySpawner.on('data', (sessionId: string, data: string) => {
    const clients = sessionClients.get(sessionId);
    if (!clients) return;
    const buf = Buffer.from(data);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(buf, { binary: true });
      }
    }
  });

  // Forward board commands from terminal parser to connected clients
  ptySpawner.on('board_command', (sessionId: string, command: BoardCommand) => {
    broadcastJson(sessionId, {
      type: 'board_command',
      sessionId,
      command: command.type,
      params: command.params,
    });
  });

  // Forward session status changes
  sessionManager.on('session_activated', (session) => {
    broadcastJson(session.id, {
      type: 'session_status',
      sessionId: session.id,
      status: 'active',
      claudeSessionId: session.claudeSessionId,
      pid: session.pid,
    });
  });

  sessionManager.on('session_completed', (sessionId: string, claudeSessionId: string | null) => {
    broadcastJson(sessionId, {
      type: 'session_status',
      sessionId,
      status: 'completed',
      claudeSessionId,
      pid: null,
    });
  });

  sessionManager.on('session_failed', (sessionId: string) => {
    broadcastJson(sessionId, {
      type: 'session_status',
      sessionId,
      status: 'failed',
      claudeSessionId: null,
      pid: null,
    });
  });

  // Forward needs_input events
  sessionManager.on(
    'needs_input_changed',
    (sessionId: string, needsInput: boolean, pattern?: string, idleSeconds?: number) => {
      broadcastJson(sessionId, {
        type: 'needs_input',
        sessionId,
        needsInput,
        detectedPattern: pattern || '',
        idleSeconds: idleSeconds || 0,
      });
    },
  );

  logger.info('websocket server initialized');
}

function broadcastJson(sessionId: string, message: Record<string, unknown>): void {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const json = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

// Export for broadcasting from other modules (e.g., file watcher)
export function broadcastToSession(sessionId: string, message: Record<string, unknown>): void {
  broadcastJson(sessionId, message);
}
