import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../src/utils/diff-parser';

// Helper to build a minimal unified diff for testing
function makeDiff(body: string): string {
  return `diff --git a/file.ts b/file.ts
index abc1234..def5678 100644
--- a/file.ts
+++ b/file.ts
${body}`;
}

describe('parseDiff — side-by-side parser', () => {
  it('parses context lines into both left and right', () => {
    const diff = makeDiff(`@@ -1,3 +1,3 @@
 line one
 line two
 line three`);

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    const pairs = files[0].sideBySideLines;
    expect(pairs).toHaveLength(3);

    for (const pair of pairs) {
      expect(pair.left).not.toBeNull();
      expect(pair.right).not.toBeNull();
      expect(pair.left!.content).toBe(pair.right!.content);
    }

    // Old and new line numbers should both start at 1
    expect(pairs[0].left!.lineNumber).toBe(1);
    expect(pairs[0].right!.lineNumber).toBe(1);
    expect(pairs[2].left!.lineNumber).toBe(3);
    expect(pairs[2].right!.lineNumber).toBe(3);
  });

  it('puts additions in right column only (left is null)', () => {
    const diff = makeDiff(`@@ -1,2 +1,3 @@
 existing
+added line
 more`);

    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // Row 0: context "existing" — both sides
    expect(pairs[0].left).not.toBeNull();
    expect(pairs[0].right).not.toBeNull();

    // Row 1: addition "added line" — left null, right populated
    expect(pairs[1].left).toBeNull();
    expect(pairs[1].right).not.toBeNull();
    expect(pairs[1].right!.content).toBe('added line');
    expect(pairs[1].right!.type).toBe('add');

    // Row 2: context "more" — both sides
    expect(pairs[2].left).not.toBeNull();
    expect(pairs[2].right).not.toBeNull();
  });

  it('puts deletions in left column only (right is null)', () => {
    const diff = makeDiff(`@@ -1,3 +1,2 @@
 existing
-deleted line
 more`);

    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // Row 1: deletion — left populated, right null
    expect(pairs[1].left).not.toBeNull();
    expect(pairs[1].right).toBeNull();
    expect(pairs[1].left!.content).toBe('deleted line');
    expect(pairs[1].left!.type).toBe('del');
  });

  it('tracks old and new line numbers independently', () => {
    const diff = makeDiff(`@@ -10,4 +20,5 @@
 context
-old line
+new line A
+new line B
 end`);

    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // Row 0: context — old=10, new=20
    expect(pairs[0].left!.lineNumber).toBe(10);
    expect(pairs[0].right!.lineNumber).toBe(20);

    // Row 1: deletion — old=11, right null
    expect(pairs[1].left!.lineNumber).toBe(11);
    expect(pairs[1].right).toBeNull();

    // Row 2: addition — left null, new=21
    expect(pairs[2].left).toBeNull();
    expect(pairs[2].right!.lineNumber).toBe(21);

    // Row 3: addition — left null, new=22
    expect(pairs[3].left).toBeNull();
    expect(pairs[3].right!.lineNumber).toBe(22);

    // Row 4: context — old=12, new=23
    expect(pairs[4].left!.lineNumber).toBe(12);
    expect(pairs[4].right!.lineNumber).toBe(23);
  });

  it('handles multi-hunk files correctly', () => {
    const diff = makeDiff(`@@ -1,2 +1,2 @@
-old first
+new first
 same
@@ -10,2 +10,2 @@
-old tenth
+new tenth
 same`);

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    // Two hunks, each should produce side-by-side lines
    const pairs = files[0].sideBySideLines;
    // Hunk 1: del + add + context = 3 rows
    // Hunk 2: del + add + context = 3 rows
    expect(pairs.length).toBe(6);

    // First hunk
    expect(pairs[0].left!.content).toBe('old first');
    expect(pairs[0].left!.type).toBe('del');
    expect(pairs[1].right!.content).toBe('new first');
    expect(pairs[1].right!.type).toBe('add');
  });

  it('produces empty arrays for empty diff input', () => {
    const files = parseDiff('');
    expect(files).toHaveLength(0);
  });

  it('handles multiple files in a single diff', () => {
    const diff = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/b.ts b/b.ts
index 3333333..4444444 100644
--- a/b.ts
+++ b/b.ts
@@ -1,2 +1,2 @@
-old
+new
 same`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('a.ts');
    expect(files[1].path).toBe('b.ts');
  });

  it('detects change types (added, deleted, modified, renamed)', () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+line1
+line2
diff --git a/gone.ts b/gone.ts
deleted file mode 100644
index 1234567..0000000
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line1
-line2`;

    const files = parseDiff(diff);
    expect(files[0].changeType).toBe('A');
    expect(files[1].changeType).toBe('D');
  });

  it('counts additions and deletions per file', () => {
    const diff = makeDiff(`@@ -1,3 +1,4 @@
 context
-removed
+added1
+added2
 end`);

    const files = parseDiff(diff);
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(1);
  });

  it('handles paired modifications (del followed by add) as separate rows', () => {
    const diff = makeDiff(`@@ -1,3 +1,3 @@
 before
-const x = 1;
+const x = 2;
 after`);

    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // context, del, add, context = 4 rows
    expect(pairs).toHaveLength(4);

    // Row 1: deletion on left
    expect(pairs[1].left!.content).toBe('const x = 1;');
    expect(pairs[1].left!.type).toBe('del');
    expect(pairs[1].right).toBeNull();

    // Row 2: addition on right
    expect(pairs[2].left).toBeNull();
    expect(pairs[2].right!.content).toBe('const x = 2;');
    expect(pairs[2].right!.type).toBe('add');
  });
});
