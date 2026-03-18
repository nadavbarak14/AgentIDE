import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Repository } from '../models/repository.js';
import type { SessionManager } from '../services/session-manager.js';
import type { PtySpawner } from '../worker/pty-spawner.js';
import type { RemotePtyBridge } from '../worker/remote-pty-bridge.js';
import type { ShellSpawner } from '../worker/shell-spawner.js';
import type { FileWatcher } from '../worker/file-watcher.js';
import type { WsClientMessage, BoardCommand, PreviewClientMessage } from '../models/types.js';
import { createSessionLogger, logger } from '../services/logger.js';
import { validateCookieValue, isLocalhostIp } from '../services/auth-service.js';
import { StreamTap } from '../services/stream-tap.js';

// Map of sessionId → Set of connected WebSocket clients
const sessionClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → Set of connected shell WebSocket clients
const shellClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → Set of connected preview WebSocket clients
const previewClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → StreamTap instance
const streamTaps = new Map<string, StreamTap>();

export function setupWebSocket(
  server: Server,
  repo: Repository,
  sessionManager: SessionManager,
  ptySpawner: PtySpawner,
  fileWatcher?: FileWatcher,
  shellSpawner?: ShellSpawner,
  remotePtyBridge?: RemotePtyBridge,
  proxyWsFallback?: (req: import('node:http').IncomingMessage, socket: import('stream').Duplex, head: Buffer) => void,
): void {
  const wss = new WebSocketServer({ noServer: true });
  const shellWss = new WebSocketServer({ noServer: true });
  const previewWss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade
  server.on('upgrade', async (request, socket, head) => {
    // Auth check for non-localhost WebSocket connections
    const remoteAddr = request.socket.remoteAddress;
    if (!isLocalhostIp(remoteAddr)) {
      // Parse cookies from upgrade request headers
      const cookieHeader = request.headers.cookie || '';
      const cookies: Record<string, string> = {};
      for (const pair of cookieHeader.split(';')) {
        const [name, ...rest] = pair.trim().split('=');
        if (name) cookies[name.trim()] = rest.join('=').trim();
      }

      const authCookie = cookies['adyx_auth'];
      const authConfig = repo.getAuthConfig();

      if (authConfig && (!authCookie || !validateCookieValue(authCookie, authConfig.cookieSecret))) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    const url = new URL(request.url || '', `http://${request.headers.host}`);

    // Match shell WebSocket: /ws/sessions/:id/shell
    const shellMatch = url.pathname.match(/^\/ws\/sessions\/([a-f0-9-]+)\/shell$/);
    // Match preview WebSocket: /ws/sessions/:id/preview
    const previewMatch = url.pathname.match(/^\/ws\/sessions\/([a-f0-9-]+)\/preview$/);
    // Match Claude terminal WebSocket: /ws/sessions/:id
    const claudeMatch = url.pathname.match(/^\/ws\/sessions\/([a-f0-9-]+)$/);

    if (!shellMatch && !previewMatch && !claudeMatch) {
      if (proxyWsFallback) {
        proxyWsFallback(request, socket, head);
      } else {
        socket.destroy();
      }
      return;
    }

    if (shellMatch) {
      const sessionId = shellMatch[1];
      const session = repo.getSession(sessionId);
      if (!session) {
        socket.destroy();
        return;
      }
      shellWss.handleUpgrade(request, socket, head, (ws) => {
        shellWss.emit('connection', ws, sessionId);
      });
    } else if (previewMatch) {
      const sessionId = previewMatch[1];
      const session = repo.getSession(sessionId);
      if (!session) {
        socket.destroy();
        return;
      }
      previewWss.handleUpgrade(request, socket, head, (ws) => {
        previewWss.emit('connection', ws, sessionId);
      });
    } else {
      const sessionId = claudeMatch![1];
      const session = repo.getSession(sessionId);
      if (!session) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, sessionId);
      });
    }
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

      // Send currently known ports so reconnecting clients see the preview
      if (fileWatcher) {
        const knownPorts = fileWatcher.getKnownPorts(sessionId);
        for (const p of knownPorts) {
          ws.send(
            JSON.stringify({
              type: 'port_detected',
              port: p.port,
              localPort: p.port,
              protocol: 'http',
            }),
          );
        }
      }
    }

    // Force a TUI redraw for the new client by "bouncing" the PTY size.
    // A simple resize to the current dimensions is a kernel no-op (no SIGWINCH),
    // so we shrink by 1 col first, then restore — guaranteeing the application redraws.
    // We delay the bounce to let the client's resize message arrive first,
    // then read the CURRENT stored dimensions (not stale captured ones).
    const isRemote = sessionManager.isRemoteSession(sessionId) && remotePtyBridge;
    const bounceTimer = setTimeout(() => {
      if (isRemote) {
        const dims = remotePtyBridge!.getDimensions(sessionId) || { cols: 120, rows: 40 };
        remotePtyBridge!.resize(sessionId, Math.max(dims.cols - 1, 1), dims.rows);
        setTimeout(() => {
          const currentDims = remotePtyBridge!.getDimensions(sessionId) || dims;
          remotePtyBridge!.resize(sessionId, currentDims.cols, currentDims.rows);
        }, 50);
      } else {
        const proc = ptySpawner.getProcess(sessionId);
        if (proc) {
          const dims = ptySpawner.getDimensions(sessionId) || { cols: 120, rows: 40 };
          ptySpawner.resize(sessionId, Math.max(dims.cols - 1, 1), dims.rows);
          setTimeout(() => {
            const currentDims = ptySpawner.getDimensions(sessionId) || dims;
            ptySpawner.resize(sessionId, currentDims.cols, currentDims.rows);
          }, 50);
        }
      }
    }, 200);

    // Handle incoming messages — route to local PTY or remote bridge
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary: raw keyboard input → PTY (local or remote)
        if (sessionManager.isRemoteSession(sessionId) && remotePtyBridge) {
          remotePtyBridge.write(sessionId, data.toString());
        } else {
          ptySpawner.write(sessionId, data.toString());
        }
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
      clearTimeout(bounceTimer);
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

  // ─── Shell WebSocket ───

  shellWss.on('connection', (ws: WebSocket, sessionId: string) => {
    const log = createSessionLogger(sessionId);
    log.info('shell websocket client connected');

    // Register shell client
    if (!shellClients.has(sessionId)) {
      shellClients.set(sessionId, new Set());
    }
    shellClients.get(sessionId)!.add(ws);

    // Send current shell status
    if (shellSpawner) {
      const hasShell = shellSpawner.hasShell(sessionId);
      const info = shellSpawner.getShellInfo(sessionId);
      const proc = shellSpawner.getProcess(sessionId);
      ws.send(JSON.stringify({
        type: 'shell_status',
        sessionId,
        status: hasShell ? 'running' : 'none',
        pid: proc?.pid ?? null,
        shell: info?.shell ?? null,
      }));

      // Send scrollback if available
      const scrollback = shellSpawner.loadScrollback(sessionId);
      if (scrollback) {
        ws.send(Buffer.from(scrollback), { binary: true });
      }
    }

    // Handle incoming messages
    ws.on('message', (data, isBinary) => {
      if (!shellSpawner) return;

      if (isBinary) {
        // Binary: keyboard input → shell PTY
        shellSpawner.write(sessionId, data.toString());
        return;
      }

      // Text: JSON control message
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
          shellSpawner.resize(sessionId, msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      log.info('shell websocket client disconnected');
      const clients = shellClients.get(sessionId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          shellClients.delete(sessionId);
        }
      }
    });
  });

  // ─── Preview WebSocket ───

  previewWss.on('connection', (ws: WebSocket, sessionId: string) => {
    const log = createSessionLogger(sessionId);
    log.info('preview websocket client connected');

    // Register preview client
    if (!previewClients.has(sessionId)) {
      previewClients.set(sessionId, new Set());
    }
    previewClients.get(sessionId)!.add(ws);

    // Handle incoming messages
    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // Only JSON text frames expected

      try {
        const msg = JSON.parse(data.toString()) as PreviewClientMessage;
        const tap = streamTaps.get(sessionId);
        switch (msg.type) {
          case 'preview:start':
            handlePreviewStart(sessionId).catch(err => log.error({ err }, 'preview:start failed'));
            break;
          case 'preview:stop':
            tap?.stopScreencast().catch(err => log.error({ err }, 'preview:stop failed'));
            break;
          case 'preview:navigate':
            tap?.navigate(msg.url).catch(err => log.error({ err }, 'navigate failed'));
            break;
          case 'preview:mouse':
            if (msg.action === 'click') {
              tap?.dispatchMouseEvent('mousePressed', msg.x, msg.y, msg.button, 1).catch(err => log.error({ err }, 'mouse press failed'));
              tap?.dispatchMouseEvent('mouseReleased', msg.x, msg.y, msg.button, 1).catch(err => log.error({ err }, 'mouse release failed'));
            } else {
              const cdpType = msg.action === 'down' ? 'mousePressed' : msg.action === 'up' ? 'mouseReleased' : 'mouseMoved';
              tap?.dispatchMouseEvent(cdpType, msg.x, msg.y, msg.button, msg.action === 'down' ? 1 : 0).catch(err => log.error({ err }, 'mouse event failed'));
            }
            break;
          case 'preview:key':
            tap?.dispatchKeyEvent(msg.action, msg.key, msg.text, msg.code, msg.modifiers).catch(err => log.error({ err }, 'key event failed'));
            break;
          case 'preview:scroll':
            tap?.dispatchScroll(msg.x, msg.y, msg.deltaX, msg.deltaY).catch(err => log.error({ err }, 'scroll event failed'));
            break;
          case 'preview:resize':
            tap?.setViewport(msg.width, msg.height).catch(err => log.error({ err }, 'resize failed'));
            break;
          case 'preview:touch':
            tap?.dispatchTouch(msg.action, msg.x, msg.y).catch(err => log.error({ err }, 'touch event failed'));
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      log.info('preview websocket client disconnected');
      const clients = previewClients.get(sessionId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          previewClients.delete(sessionId);
          // Stop screencast and disconnect Stream Tap when last client leaves
          const tap = streamTaps.get(sessionId);
          if (tap) {
            tap.stopScreencast().catch(err => log.error({ err }, 'stopScreencast on last-client-close failed'));
            tap.disconnect();
            streamTaps.delete(sessionId);
          }
        }
      }
    });
  });

  async function handlePreviewStart(sessionId: string): Promise<void> {
    const log = createSessionLogger(sessionId);
    let tap = streamTaps.get(sessionId);
    if (!tap) {
      tap = new StreamTap();
      streamTaps.set(sessionId, tap);
    }

    if (!tap.isConnected()) {
      const connected = await tap.connect({
        onFrame: (frame: Buffer) => {
          const clients = previewClients.get(sessionId);
          if (!clients) return;
          for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(frame, { binary: true });
            }
          }
        },
        onStatus: (status: 'connected' | 'unavailable', reason?: string) => {
          broadcastPreviewJson(sessionId, { type: 'preview:status', status, ...(reason ? { reason } : {}) });
        },
        onUrl: (url: string) => {
          broadcastPreviewJson(sessionId, { type: 'preview:url', url });
        },
      });

      if (!connected) {
        log.warn('StreamTap failed to connect to Chrome');
        return;
      }
    }

    await tap.startScreencast();
  }

  // Forward shell PTY output to connected shell WebSocket clients
  if (shellSpawner) {
    shellSpawner.on('data', (sessionId: string, data: string) => {
      const clients = shellClients.get(sessionId);
      if (!clients) return;
      const buf = Buffer.from(data);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(buf, { binary: true });
        }
      }
    });

    shellSpawner.on('exit', (sessionId: string, exitCode: number) => {
      broadcastShellJson(sessionId, {
        type: 'shell_status',
        sessionId,
        status: exitCode === 0 ? 'stopped' : 'killed',
        exitCode,
      });
    });
  }

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

  // Forward remote PTY output to connected WebSocket clients
  if (remotePtyBridge) {
    remotePtyBridge.on('data', (sessionId: string, data: string) => {
      const clients = sessionClients.get(sessionId);
      if (!clients) return;
      const buf = Buffer.from(data);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(buf, { binary: true });
        }
      }
    });
  }

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
    (sessionId: string, needsInput: boolean, waitReason?: string | null) => {
      broadcastJson(sessionId, {
        type: 'needs_input',
        sessionId,
        needsInput,
        waitReason: waitReason || null,
        detectedPattern: '',
        idleSeconds: 0,
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

function broadcastShellJson(sessionId: string, message: Record<string, unknown>): void {
  const clients = shellClients.get(sessionId);
  if (!clients) return;
  const json = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  }
}

function broadcastPreviewJson(sessionId: string, message: Record<string, unknown>): void {
  const clients = previewClients.get(sessionId);
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

/** Broadcast a message to ALL connected WebSocket clients across every session */
function broadcastToAll(message: Record<string, unknown>): void {
  const json = JSON.stringify(message);
  for (const clients of sessionClients.values()) {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }
}

/** Broadcast session state changes to all connected clients (not just per-session) */
export function broadcastSessionStateChanged(sessionId: string, changes: Record<string, unknown>): void {
  broadcastToAll({ type: 'session_state_changed', sessionId, changes });
}
