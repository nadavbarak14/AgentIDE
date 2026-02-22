import express from 'express';
import http from 'node:http';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createSettingsRouter } from '../../src/api/routes/settings.js';
import { createSessionsRouter } from '../../src/api/routes/sessions.js';
import { createFilesRouter } from '../../src/api/routes/files.js';
import { setupWebSocket } from '../../src/api/websocket.js';
import { SessionManager } from '../../src/services/session-manager.js';
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
  return spawner;
}

export interface TestServer {
  app: express.Express;
  server: http.Server;
  port: number;
  repo: Repository;
  sessionManager: SessionManager;
  ptySpawner: PtySpawner;
  db: Database.Database;
  close: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServer> {
  const db = createTestDb();
  const repo = new Repository(db);
  const ptySpawner = createMockPtySpawner();
  const sessionManager = new SessionManager(repo, ptySpawner);

  const app = express();
  app.use(express.json());

  app.use('/api/settings', createSettingsRouter(repo));
  app.use('/api/sessions', createSessionsRouter(repo, sessionManager));

  // Files router requires real filesystem — skip in system tests
  try {
    app.use('/api/sessions', createFilesRouter(repo));
  } catch {
    // Files router may fail without real working directories — that's OK
  }

  const server = http.createServer(app);
  setupWebSocket(server, repo, sessionManager, ptySpawner);

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
    ptySpawner,
    db,
    close: async () => {
      sessionManager.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      closeDb();
    },
  };
}

export function getBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}
