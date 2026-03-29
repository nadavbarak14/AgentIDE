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
import type { AgentTunnelManager } from '../hub/agent-tunnel.js';

// Map of sessionId → Set of connected WebSocket clients
const sessionClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → Set of connected shell WebSocket clients
const shellClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → Set of connected preview WebSocket clients
const previewClients = new Map<string, Set<WebSocket>>();
// Map of sessionId → StreamTap instance (local sessions)
const streamTaps = new Map<string, StreamTap>();
// Map of sessionId → remote agent preview WS (remote sessions)
const remotePreviewWs = new Map<string, WebSocket>();

export function setupWebSocket(
  server: Server,
  repo: Repository,
  sessionManager: SessionManager,
  ptySpawner: PtySpawner,
  fileWatcher?: FileWatcher,
  shellSpawner?: ShellSpawner,
  remotePtyBridge?: RemotePtyBridge,
  agentTunnelManager?: AgentTunnelManager,
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
      socket.destroy();
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
        const isRemote = !!getRemoteAgentPort(sessionId);
        const tap = streamTaps.get(sessionId);

        switch (msg.type) {
          case 'preview:start':
            handlePreviewStart(sessionId).catch(err => log.error({ err }, 'preview:start failed'));
            break;
          case 'preview:stop':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'stop', {}).catch(() => {});
            } else {
              tap?.stopScreencast().catch(err => log.error({ err }, 'preview:stop failed'));
            }
            break;
          case 'preview:navigate':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'navigate', { url: msg.url }).catch(() => {});
            } else {
              tap?.navigate(msg.url).catch(err => log.error({ err }, 'navigate failed'));
            }
            break;
          case 'preview:back':
            tap?.goBack().catch(err => log.error({ err }, 'back failed'));
            break;
          case 'preview:forward':
            tap?.goForward().catch(err => log.error({ err }, 'forward failed'));
            break;
          case 'preview:mouse':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'input', { inputType: 'mouse', x: msg.x, y: msg.y, button: msg.button, action: msg.action }).catch(() => {});
            } else if (msg.action === 'click') {
              tap?.dispatchMouseEvent('mousePressed', msg.x, msg.y, msg.button, 1).catch(err => log.error({ err }, 'mouse press failed'));
              tap?.dispatchMouseEvent('mouseReleased', msg.x, msg.y, msg.button, 1).catch(err => log.error({ err }, 'mouse release failed'));
            } else {
              const cdpType = msg.action === 'down' ? 'mousePressed' : msg.action === 'up' ? 'mouseReleased' : 'mouseMoved';
              tap?.dispatchMouseEvent(cdpType, msg.x, msg.y, msg.button, msg.action === 'down' ? 1 : 0).catch(err => log.error({ err }, 'mouse event failed'));
            }
            break;
          case 'preview:key':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'input', { inputType: 'key', key: msg.key, text: msg.text, code: msg.code, action: msg.action, modifiers: msg.modifiers }).catch(() => {});
            } else {
              tap?.dispatchKeyEvent(msg.action, msg.key, msg.text, msg.code, msg.modifiers).catch(err => log.error({ err }, 'key event failed'));
            }
            break;
          case 'preview:scroll':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'input', { inputType: 'scroll', x: msg.x, y: msg.y, deltaX: msg.deltaX, deltaY: msg.deltaY }).catch(() => {});
            } else {
              tap?.dispatchScroll(msg.x, msg.y, msg.deltaX, msg.deltaY).catch(err => log.error({ err }, 'scroll event failed'));
            }
            break;
          case 'preview:resize':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'input', { inputType: 'resize', width: msg.width, height: msg.height }).catch(() => {});
            } else if (msg.width === 1280 && msg.height === 720) {
              // Default size = responsive mode, clear device override
              tap?.clearViewport().catch(err => log.error({ err }, 'clear viewport failed'));
            } else {
              tap?.setViewport(msg.width, msg.height).catch(err => log.error({ err }, 'resize failed'));
            }
            break;
          case 'preview:touch':
            if (isRemote) {
              relayToRemoteAgent(sessionId, 'input', { inputType: 'touch', x: msg.x, y: msg.y, action: msg.action }).catch(() => {});
            } else {
              tap?.dispatchTouch(msg.action, msg.x, msg.y).catch(err => log.error({ err }, 'touch event failed'));
            }
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
          // Stop screencast but keep Chrome alive for fast reconnect
          const tap = streamTaps.get(sessionId);
          if (tap) {
            tap.stopScreencast().catch(err => log.error({ err }, 'stopScreencast on last-client-close failed'));
            tap.disconnect();
            // Don't delete from streamTaps — reuse on reconnect
          }
          // Close remote agent preview WS if open
          const rws = remotePreviewWs.get(sessionId);
          if (rws) {
            relayToRemoteAgent(sessionId, 'stop', {}).catch(() => {});
            rws.close();
            remotePreviewWs.delete(sessionId);
          }
        }
      }
    });
  });

  /**
   * Get the remote agent's tunneled local port for a session, or null if local.
   */
  function getRemoteAgentPort(sessionId: string): number | null {
    if (!agentTunnelManager) return null;
    const session = repo.getSession(sessionId);
    if (!session?.workerId) return null;
    const worker = repo.getWorker(session.workerId);
    if (!worker || worker.type !== 'remote' || !worker.remoteAgentPort) return null;
    return agentTunnelManager.getLocalPort(worker.id);
  }

  /**
   * Start preview: for remote sessions, relay via remote agent HTTP/WS;
   * for local sessions, use local StreamTap.
   */
  async function handlePreviewStart(sessionId: string): Promise<void> {
    const log = createSessionLogger(sessionId);
    const remotePort = getRemoteAgentPort(sessionId);

    if (remotePort) {
      // Remote session — relay via remote agent
      await handleRemotePreviewStart(sessionId, remotePort, log);
    } else {
      // Local session — use local StreamTap
      await handleLocalPreviewStart(sessionId, log);
    }
  }

  async function handleLocalPreviewStart(sessionId: string, log: ReturnType<typeof createSessionLogger>): Promise<void> {
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

    await tap.startScreencast().catch((err: unknown) => {
      log.warn({ err }, 'StreamTap startScreencast failed (Chrome may have disconnected)');
    });
  }

  async function handleRemotePreviewStart(sessionId: string, agentPort: number, log: ReturnType<typeof createSessionLogger>): Promise<void> {
    // Start screencast on remote agent
    try {
      const resp = await fetch(`http://127.0.0.1:${agentPort}/api/preview/start`, { method: 'POST' });
      const result = await resp.json() as { ok: boolean; reason?: string };
      if (!result.ok) {
        broadcastPreviewJson(sessionId, { type: 'preview:status', status: 'unavailable', reason: result.reason || 'Remote Chrome not available' });
        return;
      }
    } catch (err) {
      log.warn({ err }, 'Failed to start remote preview');
      broadcastPreviewJson(sessionId, { type: 'preview:status', status: 'unavailable', reason: 'Remote agent unreachable' });
      return;
    }

    // Connect to remote agent's /ws/events to receive frames
    if (!remotePreviewWs.has(sessionId)) {
      const agentWs = new WebSocket(`ws://127.0.0.1:${agentPort}/ws/events`);
      remotePreviewWs.set(sessionId, agentWs);

      agentWs.on('message', (data, isBinary) => {
        const clients = previewClients.get(sessionId);
        if (!clients) return;

        if (isBinary) {
          // Binary = screencast frame, relay to user
          for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data as Buffer, { binary: true });
            }
          }
        } else {
          // JSON = status/url messages, relay to user
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'preview:status' || msg.type === 'preview:url') {
              for (const ws of clients) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(data.toString());
                }
              }
            }
          } catch { /* ignore malformed JSON from remote */ }
        }
      });

      agentWs.on('close', () => {
        remotePreviewWs.delete(sessionId);
        broadcastPreviewJson(sessionId, { type: 'preview:status', status: 'unavailable', reason: 'Remote agent disconnected' });
      });

      agentWs.on('error', () => {
        remotePreviewWs.delete(sessionId);
      });
    }

    broadcastPreviewJson(sessionId, { type: 'preview:status', status: 'connected' });
  }

  /**
   * Relay a preview command to the remote agent via HTTP.
   */
  async function relayToRemoteAgent(sessionId: string, endpoint: string, body: Record<string, unknown>): Promise<void> {
    const agentPort = getRemoteAgentPort(sessionId);
    if (!agentPort) return;
    try {
      await fetch(`http://127.0.0.1:${agentPort}/api/preview/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* fire-and-forget relay */ }
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
    // Clean up Chrome process for this session
    const tap = streamTaps.get(sessionId);
    if (tap) {
      tap.destroy();
      streamTaps.delete(sessionId);
    }
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

/**
 * Handle view-* board commands directly on the backend via StreamTap CDP.
 * Returns a result string, or null if the command isn't a view command.
 */
export async function handleViewCommand(
  sessionId: string,
  command: string,
  params: Record<string, unknown>,
): Promise<string | null> {
  const log = createSessionLogger(sessionId);

  // Only handle view-* commands
  if (!command.startsWith('view-')) return null;

  // Get or create StreamTap for this session
  let tap = streamTaps.get(sessionId);
  if (!tap || !tap.isConnected()) {
    // If existing tap is recording, try to reconnect it instead of replacing
    if (tap && tap.isRecording()) {
      const reconnected = await tap.connect({
        onFrame: (frame: Buffer) => {
          const clients = previewClients.get(sessionId);
          if (!clients) return;
          for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame, { binary: true });
          }
        },
        onStatus: () => {},
        onUrl: () => {},
      });
      if (!reconnected) {
        return 'Error: Chrome disconnected during recording and could not reconnect.';
      }
    } else {
      tap = new StreamTap();
      const connected = await tap.connect({
        onFrame: (frame: Buffer) => {
          const clients = previewClients.get(sessionId);
          if (!clients) return;
          for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame, { binary: true });
          }
        },
        onStatus: () => {},
        onUrl: () => {},
      });
      if (!connected) {
        return 'Error: Chrome is not available. Launch headless Chrome first.';
      }
      streamTaps.set(sessionId, tap);
    }
  }

  try {
    switch (command) {
      case 'view-navigate': {
        const url = String(params.url || '');
        if (!url) return 'Error: url parameter required';
        await tap.navigate(url);
        // Also broadcast URL to frontend preview
        broadcastPreviewJson(sessionId, { type: 'preview:url', url });
        return `Navigated to ${url}`;
      }

      case 'view-read-page': {
        const tree = await tap.getAccessibilityTree();
        return tree;
      }

      case 'view-click': {
        const role = String(params.role || '');
        const name = String(params.name || '');
        if (!role || !name) return 'Error: role and name parameters required';
        const clicked = await tap.clickByRoleName(role, name);
        return clicked ? `Clicked ${role} "${name}"` : `Error: Could not find ${role} "${name}" on the page`;
      }

      case 'view-type': {
        const role = String(params.role || '');
        const name = String(params.name || '');
        const text = String(params.text || '');
        if (!role || !name || !text) return 'Error: role, name, and text parameters required';
        const typed = await tap.typeByRoleName(role, name, text);
        return typed ? `Typed "${text}" into ${role} "${name}"` : `Error: Could not find ${role} "${name}" on the page`;
      }

      case 'view-screenshot': {
        const screenshot = await tap.captureScreenshot();
        // Save to session's working directory
        const fs = await import('node:fs');
        const path = await import('node:path');
        const uploadsDir = path.join(process.cwd(), '.c3-uploads', 'screenshots');
        fs.mkdirSync(uploadsDir, { recursive: true });
        const filename = `screenshot-${sessionId.slice(0, 8)}-${Date.now()}.png`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, screenshot);
        log.info({ filepath }, 'screenshot captured via view-screenshot');
        return `Screenshot saved to ${filepath}`;
      }

      case 'view-set-resolution':
      case 'view-set-viewport': {
        const width = Number(params.width || 0);
        const height = Number(params.height || 0);
        if (!width || !height) return 'Error: width and height parameters required';
        await tap.setViewport(width, height);
        return `Viewport set to ${width}x${height}`;
      }

      case 'view-set-device':
      case 'view-set-desktop': {
        const deviceName = String(params.device || params.name || '');
        if (!deviceName) return 'Error: device name parameter required';
        // Common device presets
        const devices: Record<string, [number, number]> = {
          'iphone-17-pro-max': [440, 956], 'iphone-17-pro': [402, 874], 'iphone-16-pro-max': [430, 932],
          'iphone-16-pro': [393, 852], 'iphone-se': [375, 667], 'ipad-pro-13': [1032, 1376],
          'ipad-pro-11': [834, 1210], 'ipad-air-11': [820, 1180], 'ipad-mini': [744, 1133],
          'galaxy-s25-ultra': [412, 891], 'pixel-10': [412, 923], 'desktop': [1280, 720],
          '1080p': [1920, 1080], '1440p': [2560, 1440], '4k': [3840, 2160],
        };
        const key = deviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const dims = devices[key];
        if (!dims) return `Error: Unknown device "${deviceName}". Available: ${Object.keys(devices).join(', ')}`;
        await tap.setViewport(dims[0], dims[1]);
        return `Viewport set to ${deviceName} (${dims[0]}x${dims[1]})`;
      }

      case 'view-record-start': {
        if (tap.isRecording()) return 'Already recording. Use view-record-stop to stop.';
        await tap.startRecording();
        return 'Recording started. Use view-record-stop to stop and save.';
      }

      case 'view-record-stop': {
        const recording = tap.stopRecording();
        if (!recording || recording.frames.length === 0) {
          return 'No recording in progress or no frames captured.';
        }
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { execFileSync } = await import('node:child_process');
        const uploadsDir = path.join(process.cwd(), '.c3-uploads', 'recordings');
        fs.mkdirSync(uploadsDir, { recursive: true });
        const id = `recording-${sessionId.slice(0, 8)}-${Date.now()}`;
        const fps = Math.max(1, Math.round(recording.frames.length / (recording.durationMs / 1000)));
        const durationSec = (recording.durationMs / 1000).toFixed(1);

        // Save frames to temp directory
        const framesDir = path.join(uploadsDir, id);
        fs.mkdirSync(framesDir, { recursive: true });
        for (let i = 0; i < recording.frames.length; i++) {
          fs.writeFileSync(path.join(framesDir, `frame-${String(i).padStart(4, '0')}.jpg`), recording.frames[i]);
        }

        // Try to encode video with ffmpeg
        const videoPath = path.join(uploadsDir, `${id}.mp4`);
        let hasVideo = false;
        try {
          execFileSync('ffmpeg', [
            '-y', '-framerate', String(fps),
            '-i', path.join(framesDir, 'frame-%04d.jpg'),
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-crf', '28', '-preset', 'ultrafast',
            videoPath,
          ], { stdio: 'pipe', timeout: 30000 });
          hasVideo = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0;
          if (hasVideo) {
            // Clean up frames directory
            for (const f of fs.readdirSync(framesDir)) fs.unlinkSync(path.join(framesDir, f));
            fs.rmdirSync(framesDir);
          }
        } catch (ffErr) {
          log.warn({ err: ffErr instanceof Error ? ffErr.message : ffErr }, 'ffmpeg encoding failed, keeping raw frames');
        }

        log.info({ videoPath: hasVideo ? videoPath : framesDir, frameCount: recording.frames.length, durationMs: recording.durationMs, hasVideo }, 'recording saved');
        if (hasVideo) {
          return `Recording stopped. ${recording.frames.length} frames over ${durationSec}s encoded to video: ${videoPath}`;
        }
        return `Recording stopped. ${recording.frames.length} frames over ${durationSec}s saved to: ${framesDir} (install ffmpeg for MP4 encoding)`;
      }

      default:
        return null; // Not a recognized view command — let frontend handle
    }
  } catch (err) {
    log.error({ err, command }, 'view command failed');
    return `Error executing ${command}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

