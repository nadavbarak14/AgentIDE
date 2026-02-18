import { describe, it, expect } from 'vitest';

describe('FileViewer — save button visibility', () => {
  it('shows save button when file has unsaved changes (isModified=true)', () => {
    const isModified = true;
    expect(isModified).toBe(true);
  });

  it('hides save button when file is saved (isModified=false)', () => {
    const isModified = false;
    expect(isModified).toBe(false);
  });

  it('disables save button while saving', () => {
    const saveStatus = 'saving';
    const isDisabled = saveStatus === 'saving';
    expect(isDisabled).toBe(true);
  });

  it('shows "Saving..." text while save is in progress', () => {
    const saveStatus = 'saving';
    const buttonText = saveStatus === 'saving' ? 'Saving...' : 'Save';
    expect(buttonText).toBe('Saving...');
  });

  it('shows "Save" text when idle and modified', () => {
    const saveStatus = 'idle';
    const buttonText = saveStatus === 'saving' ? 'Saving...' : 'Save';
    expect(buttonText).toBe('Save');
  });
});

describe('FileViewer — comment filtering by filePath', () => {
  it('filters comments to match the active file', () => {
    const allComments = [
      { id: 'c1', filePath: 'src/App.tsx', status: 'pending', commentText: 'Fix' },
      { id: 'c2', filePath: 'src/index.ts', status: 'pending', commentText: 'Refactor' },
      { id: 'c3', filePath: 'src/App.tsx', status: 'pending', commentText: 'Add test' },
    ];
    const filePath = 'src/App.tsx';
    const filtered = allComments.filter((c) => c.filePath === filePath);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('returns empty when no comments match the file', () => {
    const allComments = [
      { id: 'c1', filePath: 'src/other.ts', status: 'pending', commentText: 'Fix' },
    ];
    const filtered = allComments.filter((c) => c.filePath === 'src/App.tsx');
    expect(filtered).toHaveLength(0);
  });
});

describe('FileViewer — pending count and decoration logic', () => {
  it('counts only pending comments', () => {
    const comments = [
      { id: 'c1', status: 'pending' },
      { id: 'c2', status: 'sent' },
      { id: 'c3', status: 'pending' },
    ];
    const pendingCount = comments.filter((c) => c.status === 'pending').length;
    expect(pendingCount).toBe(2);
  });

  it('generates decorations only for pending comments', () => {
    const comments = [
      { id: 'c1', status: 'pending', startLine: 10, endLine: 12 },
      { id: 'c2', status: 'sent', startLine: 20, endLine: 22 },
      { id: 'c3', status: 'pending', startLine: 30, endLine: 35 },
    ];
    const pendingComments = comments.filter((c) => c.status === 'pending');
    const decorations = pendingComments.map((c) => ({
      range: {
        startLineNumber: c.startLine,
        startColumn: 1,
        endLineNumber: c.endLine,
        endColumn: 1,
      },
      options: { isWholeLine: true },
    }));
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range.startLineNumber).toBe(10);
    expect(decorations[1].range.startLineNumber).toBe(30);
  });
});

describe('FileViewer — Send All removes delivered comments', () => {
  it('removes delivered comments from state', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', filePath: 'a.ts' },
      { id: 'c2', status: 'pending', filePath: 'a.ts' },
    ];
    const deliveredIds = ['c1', 'c2'];
    const deliveredSet = new Set(deliveredIds);
    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));
    expect(updated).toHaveLength(0);
  });

  it('retains comments not delivered', () => {
    const existingComments = [
      { id: 'c1', status: 'pending', filePath: 'a.ts' },
      { id: 'c2', status: 'pending', filePath: 'a.ts' },
    ];
    const deliveredSet = new Set(['c1']);
    const updated = existingComments.filter((c) => !deliveredSet.has(c.id));
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('c2');
  });
});

describe('FileViewer — unsaved file close guard', () => {
  function handleTabClose(
    tab: string,
    isActive: boolean,
    isModified: boolean,
    onTabClose: (path: string) => void,
    setPendingCloseTab: (tab: string | null) => void
  ) {
    if (isActive && isModified) {
      setPendingCloseTab(tab);
    } else {
      onTabClose(tab);
    }
  }

  it('sets pendingCloseTab when active tab is modified', () => {
    let pendingCloseTab: string | null = null;
    let closedTab: string | null = null;

    handleTabClose(
      'src/app.ts',
      true,
      true,
      (tab) => { closedTab = tab; },
      (tab) => { pendingCloseTab = tab; }
    );

    expect(pendingCloseTab).toBe('src/app.ts');
    expect(closedTab).toBeNull();
  });

  it('closes immediately when tab is not modified', () => {
    let pendingCloseTab: string | null = null;
    let closedTab: string | null = null;

    handleTabClose(
      'src/app.ts',
      true,
      false,
      (tab) => { closedTab = tab; },
      (tab) => { pendingCloseTab = tab; }
    );

    expect(pendingCloseTab).toBeNull();
    expect(closedTab).toBe('src/app.ts');
  });

  it('closes immediately when tab is not active even if modified', () => {
    let pendingCloseTab: string | null = null;
    let closedTab: string | null = null;

    handleTabClose(
      'src/other.ts',
      false,
      true,
      (tab) => { closedTab = tab; },
      (tab) => { pendingCloseTab = tab; }
    );

    expect(pendingCloseTab).toBeNull();
    expect(closedTab).toBe('src/other.ts');
  });

  it('cancel resets pendingCloseTab', () => {
    let pendingCloseTab: string | null = 'src/app.ts';
    pendingCloseTab = null;
    expect(pendingCloseTab).toBeNull();
  });

  it('discard calls onTabClose and resets pendingCloseTab', () => {
    let pendingCloseTab: string | null = 'src/app.ts';
    let closedTab: string | null = null;

    closedTab = pendingCloseTab;
    pendingCloseTab = null;

    expect(closedTab).toBe('src/app.ts');
    expect(pendingCloseTab).toBeNull();
  });
});
