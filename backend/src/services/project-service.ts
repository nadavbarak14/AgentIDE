import path from 'node:path';
import type { Repository } from '../models/repository.js';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../models/types.js';
import { isWithinHomeDir } from '../api/routes/directories.js';
import { logger } from './logger.js';

export class ProjectService {
  constructor(private repo: Repository) {}

  createProject(input: CreateProjectInput): Project {
    // Validate worker exists
    const worker = this.repo.getWorker(input.workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${input.workerId}`);
    }

    // Validate path within $HOME for local workers
    if (worker.type === 'local' && !isWithinHomeDir(input.directoryPath)) {
      throw new Error('Directory not allowed: path must be within home directory');
    }

    // Auto-derive display name if not provided
    const displayName = input.displayName || path.basename(input.directoryPath) || 'Untitled';

    const project = this.repo.createProject({
      ...input,
      displayName,
    });

    logger.info({ projectId: project.id, path: input.directoryPath, workerId: input.workerId }, 'project created');
    return project;
  }

  getProject(id: string): Project | null {
    return this.repo.getProject(id);
  }

  listProjects(workerId?: string): Project[] {
    return this.repo.listProjects(workerId);
  }

  updateProject(id: string, input: UpdateProjectInput): Project | null {
    const project = this.repo.updateProject(id, input);
    if (project) {
      logger.info({ projectId: id, updates: input }, 'project updated');
    }
    return project;
  }

  deleteProject(id: string): boolean {
    const deleted = this.repo.deleteProject(id);
    if (deleted) {
      logger.info({ projectId: id }, 'project deleted');
    }
    return deleted;
  }

  /**
   * Touch a project (update last_used_at or auto-create) when a session is created.
   * Also evicts old recent projects beyond the limit.
   */
  touchProject(workerId: string, directoryPath: string): Project {
    const project = this.repo.touchProject(workerId, directoryPath);
    this.repo.evictOldRecent(10);
    logger.debug({ workerId, directoryPath }, 'project touched');
    return project;
  }
}
