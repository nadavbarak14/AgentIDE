import path from 'node:path';
import type { Repository } from '../models/repository.js';
import type { Project, CreateProjectInput, UpdateProjectInput, ProjectTree } from '../models/types.js';
import { logger } from './logger.js';

export class ProjectService {
  constructor(private repo: Repository) {}

  createProject(input: CreateProjectInput): Project {
    // Validate worker exists
    const worker = this.repo.getWorker(input.workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${input.workerId}`);
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

  /**
   * Get immediate children of a project.
   */
  getChildProjects(parentId: string): Project[] {
    return this.repo.getChildProjects(parentId);
  }

  /**
   * Get aggregate status for a project and all its descendants.
   */
  getAggregateStatus(projectId: string): { activeAgents: number; waitingAgents: number; sessionCount: number } {
    const sessionCounts = this.repo.getSessionCountsByProject();
    const allProjects = this.repo.listProjects();

    // Build a map of parentId -> children for fast lookup
    const childrenMap = new Map<string, Project[]>();
    for (const p of allProjects) {
      const parentKey = p.parentId || '__root__';
      const siblings = childrenMap.get(parentKey);
      if (siblings) {
        siblings.push(p);
      } else {
        childrenMap.set(parentKey, [p]);
      }
    }

    // Recursively collect all descendant IDs
    const collectDescendantIds = (id: string): string[] => {
      const ids: string[] = [id];
      const children = childrenMap.get(id) || [];
      for (const child of children) {
        ids.push(...collectDescendantIds(child.id));
      }
      return ids;
    };

    const allIds = collectDescendantIds(projectId);
    let activeAgents = 0;
    let waitingAgents = 0;
    let sessionCount = 0;

    for (const id of allIds) {
      const counts = sessionCounts.get(id);
      if (counts) {
        activeAgents += counts.active;
        waitingAgents += counts.waiting;
        sessionCount += counts.total;
      }
    }

    return { activeAgents, waitingAgents, sessionCount };
  }

  /**
   * Build a tree of all projects with aggregated session counts.
   * Top-level projects have parentId=null. Aggregate counts bubble up
   * so a parent's counts include all descendants.
   */
  getProjectTree(workerId?: string): ProjectTree[] {
    const projects = this.repo.listProjects(workerId);
    const sessionCounts = this.repo.getSessionCountsByProject();
    return this.buildTree(projects, sessionCounts);
  }

  /**
   * Build a tree structure from a flat list of projects.
   * Each node includes session counts that aggregate from all descendants.
   */
  private buildTree(
    projects: Project[],
    sessionCounts: Map<string, { active: number; waiting: number; total: number }>,
  ): ProjectTree[] {
    // Create ProjectTree nodes (without children yet)
    const nodeMap = new Map<string, ProjectTree>();
    for (const project of projects) {
      const counts = sessionCounts.get(project.id) || { active: 0, waiting: 0, total: 0 };
      nodeMap.set(project.id, {
        ...project,
        children: [],
        activeAgents: counts.active,
        waitingAgents: counts.waiting,
        sessionCount: counts.total,
      });
    }

    // Group children under parents
    const roots: ProjectTree[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        // Top-level: no parent or parent not in the filtered set
        roots.push(node);
      }
    }

    // Aggregate counts from children up to parents (post-order traversal)
    const aggregate = (node: ProjectTree): void => {
      for (const child of node.children) {
        aggregate(child);
        node.activeAgents += child.activeAgents;
        node.waitingAgents += child.waitingAgents;
        node.sessionCount += child.sessionCount;
      }
    };

    for (const root of roots) {
      aggregate(root);
    }

    return roots;
  }
}
