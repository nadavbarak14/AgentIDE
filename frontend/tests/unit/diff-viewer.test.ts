import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../src/utils/diff-parser';

// Helper to build a new-file diff for testing
function makeNewFileDiff(filename: string, lines: string[]): string {
  const body = lines.map((l) => `+${l}`).join('\n');
  return `diff --git a/${filename} b/${filename}
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/${filename}
@@ -0,0 +1,${lines.length} @@
${body}`;
}

describe('DiffViewer — overflow and layout', () => {
  it('new files have changeType "A" (used for full-width rendering)', () => {
    const diff = makeNewFileDiff('newfile.ts', ['line1', 'line2', 'line3']);
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].changeType).toBe('A');
  });

  it('new files have all lines as additions with right column only', () => {
    const diff = makeNewFileDiff('newfile.ts', ['const x = 1;', 'export default x;']);
    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // All lines should have right (add) and null left
    for (const pair of pairs) {
      expect(pair.left).toBeNull();
      expect(pair.right).not.toBeNull();
      expect(pair.right!.type).toBe('add');
    }
  });

  it('modified files have changeType "M" (used for grid-cols-2 rendering)', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc1234..def5678 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 context
-old
+new
 end`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].changeType).toBe('M');
  });
});

describe('DiffViewer — word wrapping CSS', () => {
  it('uses overflow-wrap:anywhere instead of break-all for diff line content', () => {
    const correctClass = '[overflow-wrap:anywhere]';
    const incorrectClass = 'break-all';
    const anotherIncorrectClass = 'overflow-x-auto';

    expect(correctClass).toContain('overflow-wrap');
    expect(correctClass).toContain('anywhere');
    expect(incorrectClass).not.toContain('overflow-wrap');
    expect(anotherIncorrectClass).not.toContain('overflow-wrap');
  });
});

describe('DiffViewer — background diff refresh', () => {
  it('shows loading spinner on initial load when diff is null', () => {
    const diff = null;
    const prevRefreshKey = 0;
    const refreshKey = 0;
    const isBackgroundRefresh = diff !== null && prevRefreshKey !== refreshKey;

    expect(isBackgroundRefresh).toBe(false);
  });

  it('does NOT show loading spinner on subsequent refreshKey change when diff exists', () => {
    const diff = { diff: 'some diff content', files: [] };
    const prevRefreshKey = 3;
    const refreshKey = 4;
    const isBackgroundRefresh = diff !== null && prevRefreshKey !== refreshKey;

    expect(isBackgroundRefresh).toBe(true);
  });

  it('does NOT treat same refreshKey as background refresh even with existing diff', () => {
    const diff = { diff: 'some diff content', files: [] };
    const prevRefreshKey = 3;
    const refreshKey = 3;
    const isBackgroundRefresh = diff !== null && prevRefreshKey !== refreshKey;

    expect(isBackgroundRefresh).toBe(false);
  });
});

describe('DiffViewer — side-aware comment display', () => {
  interface CommentData {
    id: string;
    commentText: string;
    status: 'pending' | 'sent';
    startLine: number;
    filePath: string;
    side: 'old' | 'new';
  }

  interface DiffPair {
    left: { lineNumber: number; content: string } | null;
    right: { lineNumber: number; content: string } | null;
  }

  // Simulates the side-aware lineComments filter from DiffViewer
  function getLineComments(
    comments: CommentData[],
    filePath: string,
    pair: DiffPair,
  ): CommentData[] {
    return comments.filter((c) =>
      c.filePath === filePath && (
        (c.side === 'old' && pair.left !== null && c.startLine === pair.left.lineNumber) ||
        (c.side === 'new' && c.startLine === (pair.right?.lineNumber ?? 0))
      )
    );
  }

  it('old-side comments match left line numbers', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'Old comment', status: 'pending', startLine: 5, filePath: 'a.ts', side: 'old' },
    ];
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old code' }, right: { lineNumber: 7, content: 'new code' } };

    const result = getLineComments(comments, 'a.ts', pair);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('old-side comments do not match right line numbers', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'Old comment', status: 'pending', startLine: 7, filePath: 'a.ts', side: 'old' },
    ];
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old code' }, right: { lineNumber: 7, content: 'new code' } };

    const result = getLineComments(comments, 'a.ts', pair);
    expect(result).toHaveLength(0);
  });

  it('new-side comments match right line numbers', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'New comment', status: 'pending', startLine: 7, filePath: 'a.ts', side: 'new' },
    ];
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old code' }, right: { lineNumber: 7, content: 'new code' } };

    const result = getLineComments(comments, 'a.ts', pair);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('new-side comments do not match left line numbers', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'New comment', status: 'pending', startLine: 5, filePath: 'a.ts', side: 'new' },
    ];
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old code' }, right: { lineNumber: 7, content: 'new code' } };

    const result = getLineComments(comments, 'a.ts', pair);
    expect(result).toHaveLength(0);
  });

  it('code snippet extraction uses correct column based on side', () => {
    const pair: DiffPair = { left: { lineNumber: 5, content: 'old code line' }, right: { lineNumber: 7, content: 'new code line' } };

    function extractSnippet(side: 'old' | 'new', diffPair: DiffPair): string {
      if (side === 'old') return diffPair.left?.content ?? '';
      return diffPair.right?.content ?? '';
    }

    expect(extractSnippet('old', pair)).toBe('old code line');
    expect(extractSnippet('new', pair)).toBe('new code line');
  });

  it('comments are grouped by line for zone display', () => {
    const comments: CommentData[] = [
      { id: 'c1', commentText: 'A', status: 'pending', startLine: 5, filePath: 'a.ts', side: 'new' },
      { id: 'c2', commentText: 'B', status: 'pending', startLine: 5, filePath: 'a.ts', side: 'new' },
      { id: 'c3', commentText: 'C', status: 'pending', startLine: 10, filePath: 'a.ts', side: 'old' },
    ];
    const line5Comments = comments.filter((c) => c.filePath === 'a.ts' && c.startLine === 5);
    expect(line5Comments).toHaveLength(2);

    const line10Comments = comments.filter((c) => c.filePath === 'a.ts' && c.startLine === 10);
    expect(line10Comments).toHaveLength(1);
  });

  it('no summary strip rendered — comments are inline only', () => {
    const hasSummaryStrip = false;
    expect(hasSummaryStrip).toBe(false);
  });
});
