import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createAgentFilesRouter } from './api/routes/agent-files.js';
import { FileWatcher, type FileChangeEvent, type PortChangeEvent } from './worker/file-watcher.js';
import { logger } from './services/logger.js';

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
  const host = options.host ?? '127.0.0.1';

  // Initialize file watcher
  const fileWatcher = new FileWatcher();

  // Create Express app
  const app = express();
  // Parse JSON bodies for all routes EXCEPT proxy routes (proxy needs raw stream for piping)
  app.use((req, res, next) => {
    if (req.path.includes('/proxy/') || req.path.includes('/proxy-url/')) {
      next();
    } else {
      express.json({ limit: '50mb' })(req, res, next);
    }
  });

  // Mount agent routes under /api
  app.use('/api', createAgentFilesRouter(fileWatcher));

  // Serve inspect bridge script (US2)
  app.get('/api/inspect-bridge.js', (_req, res) => {
    const bridgePath = path.join(import.meta.dirname, 'api/inspect-bridge.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(bridgePath);
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
