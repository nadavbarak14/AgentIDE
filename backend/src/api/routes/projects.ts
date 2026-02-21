import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import type { ProjectService } from '../../services/project-service.js';
import { validateUuid, validateBody } from '../middleware.js';
import { isWithinHomeDir } from './directories.js';
import { logger } from '../../services/logger.js';

export function createProjectsRouter(repo: Repository, projectService: ProjectService): Router {
  const router = Router();

  // GET /api/projects — list projects, optionally filtered by workerId
  router.get('/', (req, res) => {
    const workerId = req.query.workerId ? String(req.query.workerId) : undefined;
    const projects = projectService.listProjects(workerId);

    // Enrich with worker info
    const enriched = projects.map((p) => {
      const worker = repo.getWorker(p.workerId);
      return {
        ...p,
        workerName: worker?.name ?? 'unknown',
        workerType: worker?.type ?? 'unknown',
        workerStatus: worker?.status ?? 'disconnected',
      };
    });

    res.json({ projects: enriched });
  });

  // POST /api/projects — create/bookmark a project
  router.post('/', validateBody(['workerId', 'directoryPath']), (req, res) => {
    const { workerId, directoryPath, displayName, bookmarked } = req.body;

    // Validate worker exists
    const worker = repo.getWorker(workerId);
    if (!worker) {
      res.status(400).json({ error: `Worker not found: ${workerId}` });
      return;
    }

    // Validate $HOME restriction for local workers
    if (worker.type === 'local' && !isWithinHomeDir(directoryPath)) {
      res.status(403).json({ error: 'Directory not allowed: path must be within home directory' });
      return;
    }

    try {
      const project = projectService.createProject({
        workerId,
        directoryPath,
        displayName,
        bookmarked,
      });
      res.status(201).json(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      logger.error({ err, workerId, directoryPath }, 'failed to create project');
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/projects/:id — update alias, bookmark, position
  router.patch('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const { displayName, bookmarked, position } = req.body;

    const updated = projectService.updateProject(id, { displayName, bookmarked, position });
    if (!updated) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(updated);
  });

  // DELETE /api/projects/:id — remove a project
  router.delete('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const deleted = projectService.deleteProject(id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  });

  return router;
}
