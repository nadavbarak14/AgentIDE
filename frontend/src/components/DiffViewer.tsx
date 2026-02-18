import { useState, useEffect, useCallback } from 'react';
import { files as filesApi, comments as commentsApi, type DiffResult, type CommentData } from '../services/api';
import { parseDiff, type ParsedFile, type SideBySideLine } from '../utils/diff-parser';

interface DiffViewerProps {
  sessionId: string;
  onClose: () => void;
  refreshKey?: number;
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

  // Gutter "+" click — immediately opens comment input
  const handleGutterPlusClick = useCallback((lineNum: number, shiftKey: boolean) => {
    if (shiftKey && selectedLines) {
      setSelectedLines({
        start: Math.min(selectedLines.start, lineNum),
        end: Math.max(selectedLines.end, lineNum),
      });
    } else {
      setSelectedLines({ start: lineNum, end: lineNum });
    }
    setShowCommentInput(true);
    setCommentText('');
  }, [selectedLines]);

  const handleCommentSubmit = useCallback(async () => {
    if (!selectedFile || !selectedLines || !commentText.trim()) return;

    const file = parsedFiles.find((f) => f.path === selectedFile);
    if (!file) return;

    // Extract code snippet from side-by-side lines
    const selectedContent = file.sideBySideLines
      .filter((pair) => {
        const lineNum = pair.right?.lineNumber ?? pair.left?.lineNumber ?? 0;
        return lineNum >= selectedLines.start && lineNum <= selectedLines.end;
      })
      .map((pair) => (pair.right?.content ?? pair.left?.content ?? ''))
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

          {/* Side-by-Side Diff Content */}
          <div className="flex-1 overflow-auto bg-gray-900 font-mono text-sm">
            {selectedParsedFile ? (
              <SideBySideDiff
                file={selectedParsedFile}
                filePath={selectedFile!}
                selectedLines={selectedLines}
                showCommentInput={showCommentInput}
                commentText={commentText}
                submitting={submitting}
                existingComments={existingComments}
                onGutterPlusClick={handleGutterPlusClick}
                onCommentTextChange={setCommentText}
                onCommentSubmit={handleCommentSubmit}
                onCommentCancel={() => {
                  setShowCommentInput(false);
                  setCommentText('');
                  setSelectedLines(null);
                }}
              />
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

// --- Side-by-Side Diff Rendering ---

interface SideBySideDiffProps {
  file: ParsedFile;
  filePath: string;
  selectedLines: { start: number; end: number } | null;
  showCommentInput: boolean;
  commentText: string;
  submitting: boolean;
  existingComments: CommentData[];
  onGutterPlusClick: (lineNum: number, shiftKey: boolean) => void;
  onCommentTextChange: (text: string) => void;
  onCommentSubmit: () => void;
  onCommentCancel: () => void;
}

function SideBySideDiff({
  file,
  filePath,
  selectedLines,
  showCommentInput,
  commentText,
  submitting,
  existingComments,
  onGutterPlusClick,
  onCommentTextChange,
  onCommentSubmit,
  onCommentCancel,
}: SideBySideDiffProps) {
  const rows = file.sideBySideLines;

  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-gray-700 text-[10px] text-gray-500 uppercase tracking-wide">
        <div className="px-3 py-1 border-r border-gray-700">Old</div>
        <div className="px-3 py-1">New</div>
      </div>

      {/* Diff rows */}
      {rows.map((pair, rowIdx) => {
        const rightLineNum = pair.right?.lineNumber ?? null;
        const isSelected = selectedLines && rightLineNum !== null &&
          rightLineNum >= selectedLines.start && rightLineNum <= selectedLines.end;
        const isSelectedLeft = selectedLines && pair.left?.lineNumber != null && pair.right === null &&
          pair.left.lineNumber >= selectedLines.start && pair.left.lineNumber <= selectedLines.end;

        // Check if inline comment box or existing comments should appear after this row
        const showInputAfterRow = showCommentInput && selectedLines &&
          rightLineNum === selectedLines.end;
        const showInputAfterLeftRow = showCommentInput && selectedLines && pair.right === null &&
          pair.left?.lineNumber === selectedLines.end;

        // Existing comments anchored to this line
        const lineComments = existingComments.filter(
          (c) => c.filePath === filePath && c.startLine === (rightLineNum ?? pair.left?.lineNumber ?? 0)
        );

        return (
          <div key={rowIdx}>
            {/* The side-by-side row */}
            <div className="grid grid-cols-2">
              {/* Left column (old) */}
              <DiffCell
                line={pair.left}
                side="left"
                isSelected={!!(isSelectedLeft)}
                onPlusClick={null}
              />
              {/* Right column (new) */}
              <DiffCell
                line={pair.right}
                side="right"
                isSelected={!!isSelected}
                onPlusClick={onGutterPlusClick}
              />
            </div>

            {/* Existing comments — full width below the row */}
            {lineComments.length > 0 && (
              <div className="border-l-2 border-blue-500 bg-blue-500/5 px-3 py-1.5">
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

            {/* Inline comment input — full width below the selected line */}
            {(showInputAfterRow || showInputAfterLeftRow) && (
              <div className="border-l-2 border-blue-500 bg-gray-800 p-2">
                <div className="text-[10px] text-gray-500 mb-1">
                  Comment on {selectedLines!.start === selectedLines!.end
                    ? `line ${selectedLines!.start}`
                    : `lines ${selectedLines!.start}–${selectedLines!.end}`}
                </div>
                <textarea
                  value={commentText}
                  onChange={(e) => onCommentTextChange(e.target.value)}
                  placeholder="Enter your feedback..."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={onCommentSubmit}
                    disabled={submitting || !commentText.trim()}
                    className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    {submitting ? 'Sending...' : 'Submit'}
                  </button>
                  <button
                    onClick={onCommentCancel}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Single Diff Cell (left or right column) ---

interface DiffCellProps {
  line: SideBySideLine['left'];
  side: 'left' | 'right';
  isSelected: boolean;
  onPlusClick: ((lineNum: number, shiftKey: boolean) => void) | null;
}

function DiffCell({ line, side, isSelected, onPlusClick }: DiffCellProps) {
  if (!line) {
    // Empty placeholder
    return (
      <div className={`flex leading-5 bg-gray-800/30 ${side === 'left' ? 'border-r border-gray-700' : ''}`}>
        <div className="w-8 flex-shrink-0" />
        <div className="flex-1 px-2">&nbsp;</div>
      </div>
    );
  }

  const bgClass = isSelected
    ? 'bg-blue-500/20'
    : line.type === 'add'
      ? 'bg-green-500/10'
      : line.type === 'del'
        ? 'bg-red-500/10'
        : '';

  const textClass = line.type === 'add'
    ? 'text-green-400'
    : line.type === 'del'
      ? 'text-red-400'
      : 'text-gray-400';

  return (
    <div className={`group flex leading-5 ${bgClass} ${side === 'left' ? 'border-r border-gray-700' : ''}`}>
      {/* Line number + gutter "+" */}
      <div className="w-10 flex-shrink-0 flex items-center justify-end pr-1 text-gray-600 select-none text-xs relative">
        <span>{line.lineNumber}</span>
        {onPlusClick && (
          <span
            className="absolute left-0.5 opacity-0 group-hover:opacity-100 text-blue-400 cursor-pointer text-xs font-bold"
            onClick={(e) => {
              e.stopPropagation();
              onPlusClick(line.lineNumber, e.shiftKey);
            }}
            title="Add comment"
          >
            +
          </span>
        )}
      </div>
      {/* Content */}
      <div className={`flex-1 px-2 whitespace-pre overflow-hidden ${textClass}`}>
        {line.content}
      </div>
    </div>
  );
}
