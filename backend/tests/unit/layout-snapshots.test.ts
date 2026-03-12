import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Layout Snapshots Repository', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  // ─── T006: Repository unit tests ───

  it('returns null when snapshot not found', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const snapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files');
    expect(snapshot).toBeNull();
  });

  it('creates a new snapshot that can be retrieved', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });

    const snapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sessionId).toBe(session.id);
    expect(snapshot!.viewMode).toBe('grid');
    expect(snapshot!.combinationKey).toBe('files');
    expect(snapshot!.leftWidthPercent).toBe(20);
    expect(snapshot!.rightWidthPercent).toBe(40);
    expect(snapshot!.bottomHeightPercent).toBe(30);
    expect(snapshot!.updatedAt).toBeTruthy();
  });

  it('updates an existing snapshot (INSERT OR REPLACE)', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 15,
      rightWidthPercent: 50,
      bottomHeightPercent: 25,
    });

    const snapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.leftWidthPercent).toBe(15);
    expect(snapshot!.rightWidthPercent).toBe(50);
    expect(snapshot!.bottomHeightPercent).toBe(25);
  });

  it('deleteLayoutSnapshots without viewMode filter deletes all for session', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });
    repo.saveLayoutSnapshot(session.id, 'zoomed', 'files+git', {
      leftWidthPercent: 10,
      rightWidthPercent: 50,
      bottomHeightPercent: 35,
    });

    repo.deleteLayoutSnapshots(session.id);

    expect(repo.getLayoutSnapshot(session.id, 'grid', 'files')).toBeNull();
    expect(repo.getLayoutSnapshot(session.id, 'zoomed', 'files+git')).toBeNull();
  });

  it('deleteLayoutSnapshots with viewMode filter only deletes matching', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });
    repo.saveLayoutSnapshot(session.id, 'zoomed', 'files+git', {
      leftWidthPercent: 10,
      rightWidthPercent: 50,
      bottomHeightPercent: 35,
    });

    repo.deleteLayoutSnapshots(session.id, 'grid');

    expect(repo.getLayoutSnapshot(session.id, 'grid', 'files')).toBeNull();
    const remaining = repo.getLayoutSnapshot(session.id, 'zoomed', 'files+git');
    expect(remaining).not.toBeNull();
    expect(remaining!.leftWidthPercent).toBe(10);
    expect(remaining!.rightWidthPercent).toBe(50);
    expect(remaining!.bottomHeightPercent).toBe(35);
  });

  it('CASCADE delete when session is deleted also removes snapshots', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 25,
      rightWidthPercent: 35,
      bottomHeightPercent: 40,
    });

    repo.completeSession(session.id, null);
    repo.deleteSession(session.id);

    expect(repo.getLayoutSnapshot(session.id, 'grid', 'files')).toBeNull();
  });

  // ─── T018: Per-combination independence ───

  it('saves different dimensions for "files" vs "files+git" and returns each independently', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });
    repo.saveLayoutSnapshot(session.id, 'grid', 'files+git', {
      leftWidthPercent: 15,
      rightWidthPercent: 45,
      bottomHeightPercent: 25,
    });

    const filesSnapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files');
    const filesGitSnapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files+git');

    expect(filesSnapshot).not.toBeNull();
    expect(filesSnapshot!.combinationKey).toBe('files');
    expect(filesSnapshot!.leftWidthPercent).toBe(20);
    expect(filesSnapshot!.rightWidthPercent).toBe(40);
    expect(filesSnapshot!.bottomHeightPercent).toBe(30);

    expect(filesGitSnapshot).not.toBeNull();
    expect(filesGitSnapshot!.combinationKey).toBe('files+git');
    expect(filesGitSnapshot!.leftWidthPercent).toBe(15);
    expect(filesGitSnapshot!.rightWidthPercent).toBe(45);
    expect(filesGitSnapshot!.bottomHeightPercent).toBe(25);
  });

  it('saves snapshots for grid vs zoomed viewModes independently', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });
    repo.saveLayoutSnapshot(session.id, 'zoomed', 'files', {
      leftWidthPercent: 10,
      rightWidthPercent: 60,
      bottomHeightPercent: 20,
    });

    const gridSnapshot = repo.getLayoutSnapshot(session.id, 'grid', 'files');
    const zoomedSnapshot = repo.getLayoutSnapshot(session.id, 'zoomed', 'files');

    expect(gridSnapshot).not.toBeNull();
    expect(gridSnapshot!.viewMode).toBe('grid');
    expect(gridSnapshot!.leftWidthPercent).toBe(20);
    expect(gridSnapshot!.rightWidthPercent).toBe(40);
    expect(gridSnapshot!.bottomHeightPercent).toBe(30);

    expect(zoomedSnapshot).not.toBeNull();
    expect(zoomedSnapshot!.viewMode).toBe('zoomed');
    expect(zoomedSnapshot!.leftWidthPercent).toBe(10);
    expect(zoomedSnapshot!.rightWidthPercent).toBe(60);
    expect(zoomedSnapshot!.bottomHeightPercent).toBe(20);
  });

  it('never-saved combination returns null (graceful fallback)', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.saveLayoutSnapshot(session.id, 'grid', 'files', {
      leftWidthPercent: 20,
      rightWidthPercent: 40,
      bottomHeightPercent: 30,
    });

    expect(repo.getLayoutSnapshot(session.id, 'grid', 'preview')).toBeNull();
    expect(repo.getLayoutSnapshot(session.id, 'zoomed', 'files')).toBeNull();
    expect(repo.getLayoutSnapshot(session.id, 'grid', 'files+git+preview')).toBeNull();
  });
});
