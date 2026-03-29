import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createAgentFilesRouter } from './api/routes/agent-files.js';
import { FileWatcher, type FileChangeEvent, type PortChangeEvent } from './worker/file-watcher.js';
import { logger } from './services/logger.js';
import { StreamTap } from './services/stream-tap.js';

export interface AgentOptions {
  port?: number;
  host?: string;
}

export interface AgentResult {
  server: http.Server;
  port: number;
  host: string;
}

export async function startAgent(options: AgentOptions = {}): Promise<AgentResult> {
  const port = options.port ?? 4100;
  const host = options.host ?? '0.0.0.0';

  // Initialize file watcher
  const fileWatcher = new FileWatcher();

  // Create Express app
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Mount agent routes under /api
  app.use('/api', createAgentFilesRouter(fileWatcher));

  // Preview streaming endpoints (remote Chrome via Stream Tap)
  const streamTap = new StreamTap();

  app.post('/api/preview/start', async (_req, res) => {
    const connected = await streamTap.connect({
      onFrame: (frameData) => {
        // Send binary frame to all WS clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(frameData);
          }
        });
      },
      onStatus: (status, reason) => {
        broadcast({ type: 'preview:status', status, reason });
      },
      onUrl: (url) => {
        broadcast({ type: 'preview:url', url });
      },
    });
    if (connected) {
      await streamTap.startScreencast();
      res.json({ ok: true });
    } else {
      res.json({ ok: false, reason: 'Chrome not available' });
    }
  });

  app.post('/api/preview/stop', async (_req, res) => {
    await streamTap.stopScreencast();
    res.json({ ok: true });
  });

  app.post('/api/preview/navigate', async (req, res) => {
    const { url } = req.body;
    if (url) await streamTap.navigate(url);
    res.json({ ok: true });
  });

  app.post('/api/preview/input', async (req, res) => {
    const { inputType, ...params } = req.body;
    try {
      switch (inputType) {
        case 'mouse':
          if (params.action === 'click') {
            await streamTap.dispatchMouseEvent('mousePressed', params.x, params.y, params.button, 1);
            await streamTap.dispatchMouseEvent('mouseReleased', params.x, params.y, params.button, 1);
          } else {
            const cdpType = params.action === 'down' ? 'mousePressed' :
                            params.action === 'up' ? 'mouseReleased' : 'mouseMoved';
            await streamTap.dispatchMouseEvent(cdpType, params.x, params.y, params.button);
          }
          break;
        case 'key':
          await streamTap.dispatchKeyEvent(params.action, params.key, params.text, params.code, params.modifiers);
          break;
        case 'scroll':
          await streamTap.dispatchScroll(params.x, params.y, params.deltaX, params.deltaY);
          break;
        case 'touch':
          await streamTap.dispatchTouch(params.action, params.x, params.y);
          break;
        case 'resize':
          await streamTap.setViewport(params.width, params.height);
          break;
      }
      res.json({ ok: true });
    } catch (err) {
      res.json({ ok: false, error: (err as Error).message });
    }
  });

  // Create HTTP server
  const server = http.createServer(app);

  // WebSocket server for event streaming (US5, US1)
  const wss = new WebSocketServer({ server, path: '/ws/events' });

  // Broadcast helper
  function broadcast(data: Record<string, unknown>): void {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  // Wire file change events → WebSocket broadcast (US5)
  fileWatcher.on('changes', (event: FileChangeEvent) => {
    broadcast({
      type: 'file_changed',
      sessionId: event.sessionId,
      paths: event.paths,
      timestamp: event.timestamp,
    });
  });

  // Wire port change events → WebSocket broadcast (US1)
  fileWatcher.on('port_change', (event: PortChangeEvent) => {
    broadcast({
      type: 'port_change',
      sessionId: event.sessionId,
      port: event.port,
      pid: event.pid,
      process: event.process,
      action: event.action,
    });
  });

  // Start server
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      logger.info({ port }, `Remote agent listening on ${host}:${port}`);
      resolve();
    });
  });

  const actualPort = (server.address() as import('node:net').AddressInfo)?.port || port;

  // Graceful shutdown
  const shutdown = () => {
    logger.info('remote agent shutting down...');
    fileWatcher.destroy();
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, port: actualPort, host };
}

// Direct execution (when run as remote-agent-entry.ts directly)
const isDirectExecution = process.argv[1]?.endsWith('remote-agent-entry.js') ||
  process.argv[1]?.endsWith('remote-agent-entry.ts');
if (isDirectExecution) {
  // Parse CLI args for direct execution
  const args = process.argv.slice(2);
  let port = 4100;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }
  startAgent({ port }).catch((err) => {
    logger.error({ err }, 'failed to start remote agent');
    process.exit(1);
  });
}
