export interface DiffLine {
  type: 'add' | 'del' | 'context';
  content: string;
  lineNumber: number;
}

export interface SideBySideLine {
  left: DiffLine | null;
  right: DiffLine | null;
}

export interface ParsedFile {
  path: string;
  changeType: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
  sideBySideLines: SideBySideLine[];
}

/**
 * Parse a unified diff string into structured file objects with
 * side-by-side paired lines for two-column rendering.
 *
 * Context lines populate both left and right.
 * Added lines (+) populate right only (left is null).
 * Deleted lines (-) populate left only (right is null).
 * Old and new line numbers are tracked independently.
 */
export function parseDiff(diffText: string): ParsedFile[] {
  if (!diffText.trim()) return [];

  const files: ParsedFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: ParsedFile | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  let inHunk = false;

  for (const line of lines) {
    // New file header
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);

      const pathMatch = line.match(/diff --git a\/(.+) b\/(.+)/);
      const filePath = pathMatch ? pathMatch[2] : 'unknown';
      currentFile = {
        path: filePath,
        changeType: 'M',
        additions: 0,
        deletions: 0,
        sideBySideLines: [],
      };
      inHunk = false;
      continue;
    }

    if (!currentFile) continue;

    // Detect change type
    if (line.startsWith('new file')) {
      currentFile.changeType = 'A';
      continue;
    }
    if (line.startsWith('deleted file')) {
      currentFile.changeType = 'D';
      continue;
    }
    if (line.startsWith('rename from')) {
      currentFile.changeType = 'R';
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      oldLineNum = match ? parseInt(match[1], 10) - 1 : 0;
      newLineNum = match ? parseInt(match[2], 10) - 1 : 0;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    // Skip --- and +++ headers
    if (line.startsWith('---') || line.startsWith('+++')) continue;

    if (line.startsWith('+')) {
      newLineNum++;
      currentFile.additions++;
      currentFile.sideBySideLines.push({
        left: null,
        right: { type: 'add', content: line.slice(1), lineNumber: newLineNum },
      });
    } else if (line.startsWith('-')) {
      oldLineNum++;
      currentFile.deletions++;
      currentFile.sideBySideLines.push({
        left: { type: 'del', content: line.slice(1), lineNumber: oldLineNum },
        right: null,
      });
    } else {
      // Context line (starts with space or is bare text)
      oldLineNum++;
      newLineNum++;
      const content = line.startsWith(' ') ? line.slice(1) : line;
      currentFile.sideBySideLines.push({
        left: { type: 'context', content, lineNumber: oldLineNum },
        right: { type: 'context', content, lineNumber: newLineNum },
      });
    }
  }

  if (currentFile) files.push(currentFile);

  return files;
}
