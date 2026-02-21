import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Project Repository Methods', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    // Ensure a local worker exists (like hub-entry does at startup)
    if (!repo.getLocalWorker()) {
      repo.createLocalWorker('Local', 2);
    }
  });

  afterEach(() => {
    closeDb();
  });

  function getLocalWorkerId(): string {
    const worker = repo.getLocalWorker();
    if (!worker) throw new Error('Local worker not found');
    return worker.id;
  }

  describe('createProject', () => {
    it('creates a new project with auto-generated id', () => {
      const workerId = getLocalWorkerId();
      const project = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });

      expect(project.id).toBeTruthy();
      expect(project.workerId).toBe(workerId);
      expect(project.directoryPath).toBe('/home/user/myapp');
      expect(project.displayName).toBe('MyApp');
      expect(project.bookmarked).toBe(false);
      expect(project.position).toBeNull();
      expect(project.lastUsedAt).toBeTruthy();
      expect(project.createdAt).toBeTruthy();
    });

    it('upserts on duplicate worker_id + directory_path', () => {
      const workerId = getLocalWorkerId();
      const p1 = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });
      const p2 = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp Updated',
      });

      // Should return the same project (upsert)
      expect(p2.id).toBe(p1.id);
      expect(p2.displayName).toBe('MyApp Updated');
    });

    it('creates separate projects for different workers', () => {
      const workerId = getLocalWorkerId();
      const remoteWorker = repo.createWorker({
        name: 'Remote',
        sshHost: '192.168.1.100',
        sshUser: 'user',
        sshKeyPath: '/home/user/.ssh/id_rsa',
      });

      const p1 = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp Local',
      });
      const p2 = repo.createProject({
        workerId: remoteWorker.id,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp Remote',
      });

      expect(p1.id).not.toBe(p2.id);
    });

    it('creates a bookmarked project', () => {
      const workerId = getLocalWorkerId();
      const project = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
        bookmarked: true,
      });

      expect(project.bookmarked).toBe(true);
    });
  });

  describe('getProject', () => {
    it('returns a project by id', () => {
      const workerId = getLocalWorkerId();
      const created = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });

      const project = repo.getProject(created.id);
      expect(project).not.toBeNull();
      expect(project!.id).toBe(created.id);
      expect(project!.displayName).toBe('MyApp');
    });

    it('returns null for non-existent id', () => {
      const project = repo.getProject('nonexistent-id');
      expect(project).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('returns bookmarked projects first, then recent', () => {
      const workerId = getLocalWorkerId();

      // Create some recent projects
      repo.createProject({ workerId, directoryPath: '/home/user/recent1', displayName: 'Recent1' });
      repo.createProject({ workerId, directoryPath: '/home/user/recent2', displayName: 'Recent2' });

      // Create a bookmarked project
      const bookmarked = repo.createProject({
        workerId,
        directoryPath: '/home/user/fav',
        displayName: 'Favorite',
        bookmarked: true,
      });
      repo.updateProject(bookmarked.id, { position: 0 });

      const projects = repo.listProjects();
      expect(projects.length).toBe(3);
      // Bookmarked should be first
      expect(projects[0].displayName).toBe('Favorite');
      expect(projects[0].bookmarked).toBe(true);
    });

    it('limits recent (non-bookmarked) projects to 10', () => {
      const workerId = getLocalWorkerId();

      // Create 12 recent projects
      for (let i = 0; i < 12; i++) {
        repo.createProject({
          workerId,
          directoryPath: `/home/user/project${i}`,
          displayName: `Project ${i}`,
        });
      }

      const projects = repo.listProjects();
      // Should return max 10 recent (no bookmarked ones)
      expect(projects.length).toBe(10);
    });

    it('filters by workerId', () => {
      const localId = getLocalWorkerId();
      const remote = repo.createWorker({
        name: 'Remote',
        sshHost: '192.168.1.100',
        sshUser: 'user',
        sshKeyPath: '/home/user/.ssh/id_rsa',
      });

      repo.createProject({ workerId: localId, directoryPath: '/home/user/local', displayName: 'Local' });
      repo.createProject({ workerId: remote.id, directoryPath: '/home/user/remote', displayName: 'Remote' });

      const localProjects = repo.listProjects(localId);
      expect(localProjects.length).toBe(1);
      expect(localProjects[0].displayName).toBe('Local');

      const remoteProjects = repo.listProjects(remote.id);
      expect(remoteProjects.length).toBe(1);
      expect(remoteProjects[0].displayName).toBe('Remote');
    });
  });

  describe('touchProject', () => {
    it('creates a new project if it does not exist', () => {
      const workerId = getLocalWorkerId();
      const project = repo.touchProject(workerId, '/home/user/newproject');

      expect(project).toBeTruthy();
      expect(project.directoryPath).toBe('/home/user/newproject');
      expect(project.displayName).toBe('newproject'); // auto-derived from basename
    });

    it('updates last_used_at if project already exists', () => {
      const workerId = getLocalWorkerId();
      const p1 = repo.touchProject(workerId, '/home/user/myapp');
      const firstUsedAt = p1.lastUsedAt;

      // Touch again
      const p2 = repo.touchProject(workerId, '/home/user/myapp');
      expect(p2.id).toBe(p1.id);
      // last_used_at should be >= first time
      expect(new Date(p2.lastUsedAt).getTime()).toBeGreaterThanOrEqual(new Date(firstUsedAt).getTime());
    });
  });

  describe('evictOldRecent', () => {
    it('deletes oldest non-bookmarked projects beyond the limit', () => {
      const workerId = getLocalWorkerId();

      // Create 12 recent projects
      for (let i = 0; i < 12; i++) {
        repo.createProject({
          workerId,
          directoryPath: `/home/user/project${i}`,
          displayName: `Project ${i}`,
        });
      }

      // Create one bookmarked project
      repo.createProject({
        workerId,
        directoryPath: '/home/user/fav',
        displayName: 'Favorite',
        bookmarked: true,
      });

      repo.evictOldRecent(10);

      const projects = repo.listProjects();
      // 10 recent + 1 bookmarked = 11
      const bookmarkedCount = projects.filter((p) => p.bookmarked).length;
      const recentCount = projects.filter((p) => !p.bookmarked).length;

      expect(bookmarkedCount).toBe(1);
      expect(recentCount).toBeLessThanOrEqual(10);
    });

    it('does not evict bookmarked projects', () => {
      const workerId = getLocalWorkerId();

      // Create 15 bookmarked projects
      for (let i = 0; i < 15; i++) {
        repo.createProject({
          workerId,
          directoryPath: `/home/user/fav${i}`,
          displayName: `Fav ${i}`,
          bookmarked: true,
        });
      }

      repo.evictOldRecent(10);

      const projects = repo.listProjects();
      // All bookmarked should remain
      expect(projects.filter((p) => p.bookmarked).length).toBe(15);
    });
  });

  describe('deleteProject', () => {
    it('deletes an existing project', () => {
      const workerId = getLocalWorkerId();
      const project = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });

      const deleted = repo.deleteProject(project.id);
      expect(deleted).toBe(true);

      const found = repo.getProject(project.id);
      expect(found).toBeNull();
    });

    it('returns false for non-existent project', () => {
      const deleted = repo.deleteProject('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('updateProject', () => {
    it('updates displayName', () => {
      const workerId = getLocalWorkerId();
      const project = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });

      const updated = repo.updateProject(project.id, { displayName: 'My Application' });
      expect(updated).not.toBeNull();
      expect(updated!.displayName).toBe('My Application');
    });

    it('updates bookmarked status', () => {
      const workerId = getLocalWorkerId();
      const project = repo.createProject({
        workerId,
        directoryPath: '/home/user/myapp',
        displayName: 'MyApp',
      });

      const updated = repo.updateProject(project.id, { bookmarked: true });
      expect(updated).not.toBeNull();
      expect(updated!.bookmarked).toBe(true);
    });

    it('returns null for non-existent project', () => {
      const updated = repo.updateProject('nonexistent-id', { displayName: 'Test' });
      expect(updated).toBeNull();
    });
  });
});
