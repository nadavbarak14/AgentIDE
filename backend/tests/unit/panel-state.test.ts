import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Panel State Repository', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('returns null for session with no panel state', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const state = repo.getPanelState(session.id);
    expect(state).toBeNull();
  });

  it('creates and retrieves panel state', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.savePanelState(session.id, {
      activePanel: 'files',
      fileTabs: ['src/index.ts', 'src/App.tsx'],
      activeTabIndex: 1,
      tabScrollPositions: { 'src/index.ts': { line: 42, column: 0 } },
      gitScrollPosition: 0,
      previewUrl: '',
      panelWidthPercent: 40,
    });

    const state = repo.getPanelState(session.id);
    expect(state).not.toBeNull();
    expect(state!.sessionId).toBe(session.id);
    expect(state!.activePanel).toBe('files');
    expect(state!.fileTabs).toEqual(['src/index.ts', 'src/App.tsx']);
    expect(state!.activeTabIndex).toBe(1);
    expect(state!.tabScrollPositions).toEqual({ 'src/index.ts': { line: 42, column: 0 } });
    expect(state!.gitScrollPosition).toBe(0);
    expect(state!.previewUrl).toBe('');
    expect(state!.panelWidthPercent).toBe(40);
    expect(state!.updatedAt).toBeTruthy();
  });

  it('upserts panel state (INSERT OR REPLACE)', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });

    repo.savePanelState(session.id, {
      activePanel: 'files',
      fileTabs: ['a.ts'],
      activeTabIndex: 0,
      tabScrollPositions: {},
      gitScrollPosition: 0,
      previewUrl: '',
      panelWidthPercent: 40,
    });

    repo.savePanelState(session.id, {
      activePanel: 'git',
      fileTabs: ['a.ts', 'b.ts'],
      activeTabIndex: 1,
      tabScrollPositions: { 'a.ts': { line: 10, column: 5 } },
      gitScrollPosition: 100,
      previewUrl: 'http://localhost:3000',
      panelWidthPercent: 50,
    });

    const state = repo.getPanelState(session.id);
    expect(state!.activePanel).toBe('git');
    expect(state!.fileTabs).toEqual(['a.ts', 'b.ts']);
    expect(state!.activeTabIndex).toBe(1);
    expect(state!.gitScrollPosition).toBe(100);
    expect(state!.previewUrl).toBe('http://localhost:3000');
    expect(state!.panelWidthPercent).toBe(50);
  });

  it('serializes and deserializes JSON fields correctly', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const scrollPositions = {
      'src/index.ts': { line: 42, column: 10 },
      'src/App.tsx': { line: 1, column: 0 },
      'src/utils/helpers.ts': { line: 200, column: 5 },
    };

    repo.savePanelState(session.id, {
      activePanel: 'files',
      fileTabs: ['src/index.ts', 'src/App.tsx', 'src/utils/helpers.ts'],
      activeTabIndex: 2,
      tabScrollPositions: scrollPositions,
      gitScrollPosition: 0,
      previewUrl: '',
      panelWidthPercent: 40,
    });

    const state = repo.getPanelState(session.id);
    expect(state!.fileTabs).toEqual(['src/index.ts', 'src/App.tsx', 'src/utils/helpers.ts']);
    expect(state!.tabScrollPositions).toEqual(scrollPositions);
  });

  it('deletes panel state', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.savePanelState(session.id, {
      activePanel: 'files',
      fileTabs: [],
      activeTabIndex: 0,
      tabScrollPositions: {},
      gitScrollPosition: 0,
      previewUrl: '',
      panelWidthPercent: 40,
    });

    repo.deletePanelState(session.id);
    expect(repo.getPanelState(session.id)).toBeNull();
  });

  it('cascades delete when session is deleted', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.savePanelState(session.id, {
      activePanel: 'preview',
      fileTabs: [],
      activeTabIndex: 0,
      tabScrollPositions: {},
      gitScrollPosition: 0,
      previewUrl: 'http://localhost:5173',
      panelWidthPercent: 35,
    });

    repo.deleteSession(session.id);
    expect(repo.getPanelState(session.id)).toBeNull();
  });
});
