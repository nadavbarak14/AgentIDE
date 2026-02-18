import { useState, useEffect, useCallback } from 'react';
import { files as filesApi, comments as commentsApi, type DiffResult, type CommentData } from '../services/api';

interface DiffViewerProps {
  sessionId: string;
  onClose: () => void;
  refreshKey?: number;
}

interface ParsedFile {
  path: string;
  changeType: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'header';
  content: string;
  lineNumber: number | null;
}

export function DiffViewer({ sessionId, onClose, refreshKey = 0 }: DiffViewerProps) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<{ start: number; end: number } | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingComments, setExistingComments] = useState<CommentData[]>([]);

  // Load diff
  useEffect(() => {
    setLoading(true);
    filesApi.diff(sessionId)
      .then((result) => {
        setDiff(result);
        setParsedFiles(parseDiff(result.diff));
      })
      .catch(() => setDiff(null))
      .finally(() => setLoading(false));
  }, [sessionId, refreshKey]);

  // Load existing comments
  useEffect(() => {
    commentsApi.list(sessionId)
      .then((result) => setExistingComments(result.comments))
      .catch(() => setExistingComments([]));
  }, [sessionId, refreshKey]);

  const handleGutterClick = useCallback((lineNum: number, shiftKey: boolean) => {
    if (shiftKey && selectedLines) {
      // Extend range
      setSelectedLines({
        start: Math.min(selectedLines.start, lineNum),
        end: Math.max(selectedLines.end, lineNum),
      });
    } else {
      setSelectedLines({ start: lineNum, end: lineNum });
    }
    setShowCommentInput(false);
  }, [selectedLines]);

  const handleCommentSubmit = useCallback(async () => {
    if (!selectedFile || !selectedLines || !commentText.trim()) return;

    const file = parsedFiles.find((f) => f.path === selectedFile);
    if (!file) return;

    // Get selected lines' content as code snippet
    const allLines = file.hunks.flatMap((h) => h.lines);
    const selectedContent = allLines
      .filter((l) => l.lineNumber !== null && l.lineNumber >= selectedLines.start && l.lineNumber <= selectedLines.end)
      .map((l) => l.content)
      .join('\n');

    setSubmitting(true);
    try {
      const created = await commentsApi.create(sessionId, {
        filePath: selectedFile,
        startLine: selectedLines.start,
        endLine: selectedLines.end,
        codeSnippet: selectedContent || '(selected code)',
        commentText: commentText.trim(),
      });
      setExistingComments((prev) => [...prev, created]);
      setCommentText('');
      setShowCommentInput(false);
      setSelectedLines(null);
    } catch {
      // Error handled silently
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, selectedFile, selectedLines, commentText, parsedFiles]);

  const selectedParsedFile = parsedFiles.find((f) => f.path === selectedFile);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Changes</span>
          {diff && (
            <span className="text-xs text-gray-400">
              {diff.filesChanged} files ·{' '}
              <span className="text-green-400">+{diff.additions}</span>{' '}
              <span className="text-red-400">-{diff.deletions}</span>
            </span>
          )}
          {draftComments.length > 0 && (
            <button
              onClick={handleSubmitAll}
              disabled={submittingAll}
              className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {submittingAll ? 'Submitting...' : `Submit All (${draftComments.length})`}
            </button>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading diff...</div>
      ) : !diff || !diff.diff ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">No uncommitted changes</div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File List */}
          <div className="border-b border-gray-700 overflow-x-auto flex-shrink-0">
            <div className="flex gap-0">
              {parsedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    setSelectedFile(file.path);
                    setSelectedLines(null);
                    setShowCommentInput(false);
                  }}
                  className={`px-3 py-1.5 text-xs border-r border-gray-700 flex items-center gap-1.5 flex-shrink-0 ${
                    selectedFile === file.path
                      ? 'bg-gray-900 text-white border-b-2 border-b-blue-400'
                      : 'text-gray-400 hover:bg-gray-700/50'
                  }`}
                >
                  <span className={`font-mono text-[10px] px-1 rounded ${
                    file.changeType === 'A' ? 'bg-green-500/20 text-green-400' :
                    file.changeType === 'D' ? 'bg-red-500/20 text-red-400' :
                    file.changeType === 'R' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {file.changeType}
                  </span>
                  <span className="truncate max-w-[150px]">{file.path.split('/').pop()}</span>
                  <span className="text-[10px]">
                    <span className="text-green-400">+{file.additions}</span>
                    <span className="text-red-400">-{file.deletions}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Diff Content */}
          <div className="flex-1 overflow-auto bg-gray-900 font-mono text-sm">
            {selectedParsedFile ? (
              <div>
                {selectedParsedFile.hunks.map((hunk, hunkIdx) => (
                  <div key={hunkIdx}>
                    <div className="bg-blue-500/10 text-blue-400 px-3 py-0.5 text-xs">
                      {hunk.header}
                    </div>
                    {hunk.lines.map((line, lineIdx) => {
                      const isSelected = selectedLines && line.lineNumber !== null &&
                        line.lineNumber >= selectedLines.start && line.lineNumber <= selectedLines.end;
                      const lineComments = existingComments.filter(
                        (c) => c.filePath === selectedFile && c.startLine <= (line.lineNumber || 0) && c.endLine >= (line.lineNumber || 0)
                      );

                      return (
                        <div key={`${hunkIdx}-${lineIdx}`}>
                          <div
                            className={`flex ${
                              isSelected
                                ? 'bg-blue-500/20'
                                : line.type === 'add'
                                  ? 'bg-green-500/10'
                                  : line.type === 'del'
                                    ? 'bg-red-500/10'
                                    : ''
                            }`}
                          >
                            {/* Gutter */}
                            <div
                              className="w-8 flex-shrink-0 text-right pr-1 text-gray-600 cursor-pointer hover:bg-blue-500/20 select-none text-xs leading-5"
                              onClick={(e) => line.lineNumber !== null && handleGutterClick(line.lineNumber, e.shiftKey)}
                            >
                              {line.lineNumber || ''}
                            </div>
                            {/* Content */}
                            <div className={`flex-1 px-2 whitespace-pre leading-5 ${
                              line.type === 'add' ? 'text-green-400' :
                              line.type === 'del' ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {line.content}
                            </div>
                          </div>
                          {/* Inline comments at this line */}
                          {lineComments.length > 0 && line.lineNumber === lineComments[0].startLine && (
                            <div className="ml-8 border-l-2 border-blue-500 bg-blue-500/5 px-3 py-1.5">
                              {lineComments.map((c) => (
                                <div key={c.id} className="text-xs mb-1">
                                  <span className={`inline-block px-1.5 py-0.5 rounded mr-2 text-[10px] ${
                                    c.status === 'sent' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                  }`}>
                                    {c.status === 'sent' ? 'Sent' : 'Pending'}
                                  </span>
                                  <span className="text-gray-300">{c.commentText}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Comment button for selection */}
                {selectedLines && !showCommentInput && (
                  <div className="ml-8 py-1">
                    <button
                      onClick={() => setShowCommentInput(true)}
                      className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                    >
                      Comment on {selectedLines.start === selectedLines.end
                        ? `line ${selectedLines.start}`
                        : `lines ${selectedLines.start}-${selectedLines.end}`}
                    </button>
                  </div>
                )}

                {/* Comment input */}
                {showCommentInput && selectedLines && (
                  <div className="ml-8 border-l-2 border-blue-500 bg-gray-800 p-2">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Enter your feedback..."
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={handleCommentSubmit}
                        disabled={submitting || !commentText.trim()}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        {submitting ? 'Sending...' : 'Submit'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCommentInput(false);
                          setCommentText('');
                        }}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                Select a file to view its diff
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parse a unified diff string into structured file objects.
 */
function parseDiff(diffText: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = diffText.split('\n');
  let currentFile: ParsedFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let lineNumber = 0;

  for (const line of lines) {
    // New file header
    if (line.startsWith('diff --git')) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) files.push(currentFile);

      const pathMatch = line.match(/diff --git a\/(.+) b\/(.+)/);
      const filePath = pathMatch ? pathMatch[2] : 'unknown';
      currentFile = {
        path: filePath,
        changeType: 'M',
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    // Detect change type
    if (line.startsWith('new file')) {
      currentFile.changeType = 'A';
    } else if (line.startsWith('deleted file')) {
      currentFile.changeType = 'D';
    } else if (line.startsWith('rename from')) {
      currentFile.changeType = 'R';
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (currentHunk) currentFile.hunks.push(currentHunk);
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      lineNumber = match ? parseInt(match[1], 10) - 1 : 0;
      currentHunk = { header: line, lines: [] };
      continue;
    }

    if (!currentHunk) continue;

    // Skip --- and +++ headers
    if (line.startsWith('---') || line.startsWith('+++')) continue;

    if (line.startsWith('+')) {
      lineNumber++;
      currentFile.additions++;
      currentHunk.lines.push({ type: 'add', content: line.slice(1), lineNumber });
    } else if (line.startsWith('-')) {
      currentFile.deletions++;
      currentHunk.lines.push({ type: 'del', content: line.slice(1), lineNumber: null });
    } else {
      lineNumber++;
      currentHunk.lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, lineNumber });
    }
  }

  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) files.push(currentFile);

  return files;
}
