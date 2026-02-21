import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import type { WorkerManager } from '../../services/worker-manager.js';
import type { TunnelManager } from '../../hub/tunnel.js';
import { validateUuid, validateBody } from '../middleware.js';
import { logger } from '../../services/logger.js';

// Cache remote directory results (5-second TTL)
const dirCache = new Map<string, { data: unknown; expiry: number }>();
// Cache remote $HOME paths
const homeCache = new Map<string, string>();

export function createWorkersRouter(repo: Repository, workerManager: WorkerManager, tunnelManager?: TunnelManager): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const workers = repo.listWorkers();
    // Enrich with active session count
    const enriched = workers.map((w) => ({
      ...w,
      activeSessionCount: repo.getActiveSessionsOnWorker(w.id),
    }));
    res.json(enriched);
  });

  router.post('/', validateBody(['name', 'sshHost', 'sshUser', 'sshKeyPath']), async (req, res) => {
    // Validate SSH key file before creating the worker record
    try {
      workerManager.validateSshKeyFile(req.body.sshKeyPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid SSH key file';
      res.status(400).json({ error: message });
      return;
    }

    try {
      const worker = repo.createWorker(req.body);
      await workerManager.connectWorker(worker);
      res.status(201).json(repo.getWorker(worker.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create worker';
      res.status(500).json({ error: message });
    }
  });

  router.put('/:id', validateUuid('id'), async (req, res) => {
    const id = String(req.params.id);
    const worker = repo.getWorker(id);
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    if (worker.type === 'local') {
      res.status(403).json({ error: 'Cannot edit the local worker' });
      return;
    }

    const newKeyPath = req.body.sshKeyPath;
    if (newKeyPath !== undefined) {
      try {
        workerManager.validateSshKeyFile(newKeyPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid SSH key file';
        res.status(400).json({ error: message });
        return;
      }
    }

    try {
      const updated = repo.updateWorker(id, req.body);
      if (!updated) {
        res.status(404).json({ error: 'Worker not found' });
        return;
      }

      const sshFieldsChanged =
        req.body.sshHost !== undefined ||
        req.body.sshPort !== undefined ||
        req.body.sshUser !== undefined ||
        req.body.sshKeyPath !== undefined;

      if (sshFieldsChanged) {
        workerManager.disconnectWorker(id);
        await workerManager.connectWorker(updated);
      }

      const enriched = repo.getWorker(id);
      res.json({
        ...enriched,
        activeSessionCount: repo.getActiveSessionsOnWorker(id),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update worker';
      res.status(500).json({ error: message });
    }
  });

  router.delete('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const worker = repo.getWorker(id);
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    const activeSessions = repo.getActiveSessionsOnWorker(worker.id);
    if (activeSessions > 0) {
      res.status(409).json({ error: 'Worker has active sessions' });
      return;
    }
    workerManager.disconnectWorker(worker.id);
    repo.deleteWorker(worker.id);
    res.status(204).send();
  });

  router.post('/:id/test', validateUuid('id'), async (req, res) => {
    const id = String(req.params.id);
    const worker = repo.getWorker(id);
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    try {
      const result = await workerManager.testConnection(worker);
      if (result.ok) {
        res.json(result);
      } else {
        res.status(502).json({ error: 'Connection failed' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      res.status(502).json({ error: message });
    }
  });

  // Remote directory browsing
  router.get('/:id/directories', validateUuid('id'), async (req, res) => {
    const id = String(req.params.id);
    const worker = repo.getWorker(id);
    if (!worker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    if (worker.type === 'local') {
      res.status(400).json({ error: 'Use /api/directories for local workers' });
      return;
    }
    if (!tunnelManager || !tunnelManager.isConnected(id)) {
      res.status(502).json({ error: 'Worker not connected' });
      return;
    }

    const queryPath = String(req.query.path || '');
    const query = String(req.query.query || '');

    try {
      // Get remote $HOME (cached)
      let remoteHome = homeCache.get(id);
      if (!remoteHome) {
        const homeResult = await tunnelManager.exec(id, 'echo $HOME');
        remoteHome = homeResult.trim();
        homeCache.set(id, remoteHome);
      }

      // Default to remote $HOME
      const browsePath = queryPath || remoteHome;

      // Restrict to remote $HOME
      if (!browsePath.startsWith(remoteHome)) {
        logger.warn({ workerId: id, path: browsePath, remoteHome }, 'remote directory browse rejected: outside $HOME');
        res.status(403).json({ error: 'Directory not allowed: path must be within home directory' });
        return;
      }

      // Check cache
      const cacheKey = `${id}:${browsePath}:${query}`;
      const cached = dirCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        res.json(cached.data);
        return;
      }

      // List directories via SSH
      let lsCmd = `ls -1pa ${escapeShellArg(browsePath)} 2>/dev/null | grep '/$' | head -20`;
      if (query) {
        lsCmd = `ls -1pa ${escapeShellArg(browsePath)} 2>/dev/null | grep '/$' | grep -i '^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}' | head -20`;
      }

      const output = await tunnelManager.exec(id, lsCmd);
      const lines = output.trim().split('\n').filter(Boolean);

      const entries = lines
        .filter((name) => {
          // Exclude hidden dirs (except .config) and node_modules
          if (name === './' || name === '../') return false;
          const clean = name.replace(/\/$/, '');
          if (clean === 'node_modules') return false;
          if (clean.startsWith('.') && clean !== '.config') return false;
          return true;
        })
        .map((name) => {
          const clean = name.replace(/\/$/, '');
          const entryPath = browsePath.endsWith('/') ? `${browsePath}${clean}` : `${browsePath}/${clean}`;
          return { name: clean, path: entryPath };
        });

      // Check if path exists
      let exists = true;
      if (entries.length === 0 && !query) {
        const testResult = await tunnelManager.exec(id, `test -d ${escapeShellArg(browsePath)} && echo yes || echo no`);
        exists = testResult.trim() === 'yes';
      }

      const data = { path: browsePath, entries, exists };

      // Cache for 5 seconds
      dirCache.set(cacheKey, { data, expiry: Date.now() + 5000 });

      logger.debug({ workerId: id, path: browsePath, entryCount: entries.length }, 'remote directory browse');
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to browse remote directory';
      logger.error({ workerId: id, err }, 'remote directory browse failed');
      res.status(502).json({ error: message });
    }
  });

  return router;
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
