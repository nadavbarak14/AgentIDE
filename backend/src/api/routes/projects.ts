import { Router } from 'express';
import type { Repository } from '../../models/repository.js';
import type { ProjectService } from '../../services/project-service.js';
import { validateUuid, validateBody } from '../middleware.js';
import { logger } from '../../services/logger.js';
import { generateBranchName } from '../../services/github-service.js';
import { getIssueDetail, listIssues, listPRs } from '../../worker/github-cli.js';

export function createProjectsRouter(repo: Repository, projectService: ProjectService): Router {
  const router = Router();

  // GET /api/projects — list projects as a tree, optionally filtered by workerId
  router.get('/', (req, res) => {
    const workerId = req.query.workerId ? String(req.query.workerId) : undefined;
    const tree = projectService.getProjectTree(workerId);

    // Enrich with worker info
    const enrichTree = (nodes: typeof tree): typeof tree =>
      nodes.map((p) => {
        const worker = repo.getWorker(p.workerId);
        return {
          ...p,
          workerName: worker?.name ?? 'unknown',
          workerType: worker?.type ?? 'unknown',
          workerStatus: worker?.status ?? 'disconnected',
          children: enrichTree(p.children),
        };
      });

    res.json({ projects: enrichTree(tree) });
  });

  // POST /api/projects — create/bookmark a project
  router.post('/', validateBody(['workerId']), (req, res) => {
    const { workerId, directoryPath, displayName, bookmarked, parentId, githubRepo } = req.body;

    // Validate worker exists
    const worker = repo.getWorker(workerId);
    if (!worker) {
      res.status(400).json({ error: `Worker not found: ${workerId}` });
      return;
    }

    // Normalize githubRepo — accept full URLs like https://github.com/owner/repo
    let normalizedRepo = githubRepo;
    if (normalizedRepo) {
      const urlMatch = normalizedRepo.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
      if (urlMatch) {
        normalizedRepo = urlMatch[1].replace(/\.git$/, '');
      }
      if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(normalizedRepo)) {
        res.status(400).json({ error: 'Invalid repo format. Use "owner/repo" or paste a GitHub URL' });
        return;
      }
    }

    try {
      const project = projectService.createProject({
        workerId,
        directoryPath: directoryPath || '',
        displayName,
        bookmarked,
        parentId,
        githubRepo: normalizedRepo,
      });
      res.status(201).json(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      logger.error({ err, workerId, directoryPath }, 'failed to create project');
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/projects/:id — update alias, bookmark, position, githubRepo, parentId
  router.patch('/:id', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const { displayName, bookmarked, position, parentId, directoryPath } = req.body;
    let { githubRepo } = req.body;

    // Normalize githubRepo URL to owner/repo
    if (githubRepo) {
      const urlMatch = githubRepo.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
      if (urlMatch) githubRepo = urlMatch[1].replace(/\.git$/, '');
    }

    const updated = projectService.updateProject(id, { displayName, bookmarked, position, githubRepo, parentId, directoryPath });
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

  // POST /api/projects/:id/sessions/from-issue — create a session from a GitHub issue
  router.post('/:id/sessions/from-issue', validateUuid('id'), validateBody(['issueNumber']), (req, res) => {
    const id = String(req.params.id);
    const { issueNumber } = req.body;

    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!project.directoryPath) {
      res.status(400).json({ error: 'Project has no directory path configured' });
      return;
    }

    try {
      // Fetch issue details from GitHub to get the title
      const issueResult = getIssueDetail(project.directoryPath, issueNumber);
      const issueTitle = issueResult.issue?.title ?? `Issue #${issueNumber}`;
      const branchName = generateBranchName(issueNumber, issueTitle);

      // Create a session in the project's directory
      const session = repo.createSession({
        workingDirectory: project.directoryPath,
        title: `#${issueNumber}: ${issueTitle}`,
        targetWorker: project.workerId,
        worktree: true,
      });

      // Touch the project to update last_used_at
      projectService.touchProject(project.workerId, project.directoryPath);

      res.status(201).json({ session, branchName, issueTitle });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session from issue';
      logger.error({ err, projectId: id, issueNumber }, 'failed to create session from issue');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/suggested-sessions — find sessions whose working_directory matches this project
  router.get('/:id/suggested-sessions', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      // Get all sessions and find those matching the project's directory but not yet associated
      const allSessions = repo.listSessions();
      const suggested = allSessions.filter((s) => {
        // Match sessions whose working directory starts with the project's directory
        const normalizedSessionDir = s.workingDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
        const normalizedProjectDir = project.directoryPath.replace(/\\/g, '/').replace(/\/+$/, '');
        return normalizedSessionDir === normalizedProjectDir ||
               normalizedSessionDir.startsWith(normalizedProjectDir + '/');
      });

      res.json({ sessions: suggested });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get suggested sessions';
      logger.error({ err, projectId: id }, 'failed to get suggested sessions');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/issues — list GitHub issues for this project
  router.get('/:id/issues', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!project.directoryPath) {
      res.status(400).json({ error: 'Project has no directory path configured' });
      return;
    }

    const state = req.query.state as string | undefined;
    const label = req.query.label as string | undefined;
    const assignee = req.query.assignee?.toString().replace(/^@/, '').trim() || undefined;
    const labels = label ? label.split(',').map(l => l.trim()).filter(Boolean) : undefined;

    try {
      const result = listIssues(project.directoryPath, { state, assignee, labels });
      res.json({ issues: result.issues, fetchedAt: new Date().toISOString(), cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list issues';
      logger.error({ err, projectId: id }, 'failed to list project issues');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/issues/:number — get issue detail
  router.get('/:id/issues/:number', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!project.directoryPath) {
      res.status(400).json({ error: 'Project has no directory path configured' });
      return;
    }

    const issueNumber = parseInt(req.params.number as string, 10);
    if (isNaN(issueNumber) || issueNumber < 1) {
      res.status(400).json({ error: 'Invalid issue number' });
      return;
    }

    try {
      const result = getIssueDetail(project.directoryPath, issueNumber);
      if (!result.issue) {
        res.status(404).json({ error: result.error || 'Issue not found' });
        return;
      }
      res.json({ ...result.issue, fetchedAt: new Date().toISOString(), cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get issue detail';
      logger.error({ err, projectId: id, issueNumber }, 'failed to get project issue detail');
      res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:id/prs — list GitHub PRs for this project
  router.get('/:id/prs', validateUuid('id'), (req, res) => {
    const id = String(req.params.id);
    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!project.directoryPath) {
      res.status(400).json({ error: 'Project has no directory path configured' });
      return;
    }

    const state = req.query.state as string | undefined;
    const label = req.query.label as string | undefined;
    const labels = label ? label.split(',').map(l => l.trim()).filter(Boolean) : undefined;

    try {
      const result = listPRs(project.directoryPath, { state, labels });
      res.json({ prs: result.prs, fetchedAt: new Date().toISOString(), cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list PRs';
      logger.error({ err, projectId: id }, 'failed to list project PRs');
      res.status(500).json({ error: message });
    }
  });

  // POST /api/projects/:id/associate-sessions — associate sessions with this project
  router.post('/:id/associate-sessions', validateUuid('id'), validateBody(['sessionIds']), (req, res) => {
    const id = String(req.params.id);
    const { sessionIds } = req.body;

    const project = projectService.getProject(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (!Array.isArray(sessionIds)) {
      res.status(400).json({ error: 'sessionIds must be an array' });
      return;
    }

    try {
      // Touch the project for each associated session to update last_used_at
      projectService.touchProject(project.workerId, project.directoryPath);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to associate sessions';
      logger.error({ err, projectId: id, sessionIds }, 'failed to associate sessions');
      res.status(500).json({ error: message });
    }
  });

  return router;
}
