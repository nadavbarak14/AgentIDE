import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import type { WorkerManager } from '../../services/worker-manager.js';
import { validateUuid, validateBody } from '../middleware.js';

export function createWorkersRouter(repo: Repository, workerManager: WorkerManager): Router {
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
    try {
      const worker = repo.createWorker(req.body);
      await workerManager.connectWorker(worker);
      res.status(201).json(repo.getWorker(worker.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create worker';
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

  return router;
}
