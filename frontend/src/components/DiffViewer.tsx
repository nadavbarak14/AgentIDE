import { useState, useEffect, useCallback } from 'react';
import { files as filesApi, comments as commentsApi, type DiffResult, type CommentData } from '../services/api';
import { parseDiff, type ParsedFile, type SideBySideLine } from '../utils/diff-parser';

interface DiffViewerProps {
  sessionId: string;
  onClose: () => void;
  refreshKey?: number;
}

interface DraftComment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  commentText: string;
}

export function DiffViewer({ sessionId, onClose, refreshKey = 0 }: DiffViewerProps) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<{ start: number; end: number } | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [existingComments, setExistingComments] = useState<CommentData[]>([]);

  // Draft comments — local state for batch submission
  const [draftComments, setDraftComments] = useState<DraftComment[]>([]);
  const [submittingAll, setSubmittingAll] = useState(false);

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

  // "Add Comment" — saves to local draft state (not to backend)
  const handleAddComment = useCallback(() => {
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

    const draft: DraftComment = {
      id: crypto.randomUUID(),
      filePath: selectedFile,
      startLine: selectedLines.start,
      endLine: selectedLines.end,
      codeSnippet: selectedContent || '(selected code)',
      commentText: commentText.trim(),
    };

    setDraftComments((prev) => [...prev, draft]);
    setCommentText('');
    setShowCommentInput(false);
    setSelectedLines(null);
  }, [selectedFile, selectedLines, commentText, parsedFiles]);

  // Remove a draft comment
  const handleRemoveDraft = useCallback((draftId: string) => {
    setDraftComments((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  // "Submit All" — sends all drafts to backend
  const handleSubmitAll = useCallback(async () => {
    if (draftComments.length === 0) return;
    setSubmittingAll(true);
    const remaining: DraftComment[] = [];
    for (const draft of draftComments) {
      try {
        const created = await commentsApi.create(sessionId, {
          filePath: draft.filePath,
          startLine: draft.startLine,
          endLine: draft.endLine,
          codeSnippet: draft.codeSnippet,
          commentText: draft.commentText,
        });
        setExistingComments((prev) => [...prev, created]);
      } catch {
        remaining.push(draft);
      }
    }
    setDraftComments(remaining);
    setSubmittingAll(false);
  }, [sessionId, draftComments]);

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
        <div className="flex-1 flex overflow-hidden">
          {/* File Sidebar — vertical list */}
          <div className="w-[180px] min-w-[140px] flex-shrink-0 border-r border-gray-700 overflow-y-auto bg-gray-800/30">
            <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wide border-b border-gray-700">
              Files
            </div>
            {parsedFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => {
                  setSelectedFile(file.path);
                  setSelectedLines(null);
                  setShowCommentInput(false);
                }}
                className={`w-full text-left px-2 py-1.5 text-xs border-b border-gray-700/50 ${
                  selectedFile === file.path
                    ? 'bg-gray-900 text-white border-l-2 border-l-blue-400'
                    : 'text-gray-400 hover:bg-gray-700/50 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono text-[10px] px-1 rounded flex-shrink-0 ${
                    file.changeType === 'A' ? 'bg-green-500/20 text-green-400' :
                    file.changeType === 'D' ? 'bg-red-500/20 text-red-400' :
                    file.changeType === 'R' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {file.changeType}
                  </span>
                  <span className="truncate">{file.path.split('/').pop()}</span>
                </div>
                <div className="text-[10px] mt-0.5 pl-6">
                  <span className="text-green-400">+{file.additions}</span>{' '}
                  <span className="text-red-400">-{file.deletions}</span>
                  <span className="text-gray-600 ml-1 truncate">{file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Side-by-Side Diff Content */}
          <div className="flex-1 overflow-auto bg-gray-900 font-mono text-sm min-w-0">
            {selectedParsedFile ? (
              <SideBySideDiff
                file={selectedParsedFile}
                filePath={selectedFile!}
                selectedLines={selectedLines}
                showCommentInput={showCommentInput}
                commentText={commentText}
                existingComments={existingComments}
                draftComments={draftComments.filter((d) => d.filePath === selectedFile)}
                onGutterPlusClick={handleGutterPlusClick}
                onCommentTextChange={setCommentText}
                onCommentSubmit={handleAddComment}
                onCommentCancel={() => {
                  setShowCommentInput(false);
                  setCommentText('');
                  setSelectedLines(null);
                }}
                onRemoveDraft={handleRemoveDraft}
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
  existingComments: CommentData[];
  draftComments: DraftComment[];
  onGutterPlusClick: (lineNum: number, shiftKey: boolean) => void;
  onCommentTextChange: (text: string) => void;
  onCommentSubmit: () => void;
  onCommentCancel: () => void;
  onRemoveDraft: (draftId: string) => void;
}

function SideBySideDiff({
  file,
  filePath,
  selectedLines,
  showCommentInput,
  commentText,
  existingComments,
  draftComments,
  onGutterPlusClick,
  onCommentTextChange,
  onCommentSubmit,
  onCommentCancel,
  onRemoveDraft,
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
        const lineNum = rightLineNum ?? pair.left?.lineNumber ?? 0;
        const isSelected = selectedLines && rightLineNum !== null &&
          rightLineNum >= selectedLines.start && rightLineNum <= selectedLines.end;
        const isSelectedLeft = selectedLines && pair.left?.lineNumber != null && pair.right === null &&
          pair.left.lineNumber >= selectedLines.start && pair.left.lineNumber <= selectedLines.end;

        // Check if inline comment box should appear after this row
        const showInputAfterRow = showCommentInput && selectedLines &&
          rightLineNum === selectedLines.end;
        const showInputAfterLeftRow = showCommentInput && selectedLines && pair.right === null &&
          pair.left?.lineNumber === selectedLines.end;

        // Existing comments anchored to this line
        const lineComments = existingComments.filter(
          (c) => c.filePath === filePath && c.startLine === lineNum
        );

        // Draft comments anchored to this line
        const lineDrafts = draftComments.filter(
          (d) => d.startLine === lineNum
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

            {/* Draft comments — yellow "Draft" badge with remove button */}
            {lineDrafts.length > 0 && (
              <div className="border-l-2 border-yellow-500 bg-yellow-500/5 px-3 py-1.5">
                {lineDrafts.map((d) => (
                  <div key={d.id} className="text-xs mb-1 flex items-start justify-between">
                    <div>
                      <span className="inline-block px-1.5 py-0.5 rounded mr-2 text-[10px] bg-yellow-500/20 text-yellow-400">
                        Draft
                      </span>
                      <span className="text-gray-300">{d.commentText}</span>
                    </div>
                    <button
                      onClick={() => onRemoveDraft(d.id)}
                      className="text-gray-500 hover:text-red-400 text-xs ml-2 flex-shrink-0"
                      title="Remove draft"
                    >
                      ×
                    </button>
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
                    disabled={!commentText.trim()}
                    className="px-2 py-1 text-xs bg-yellow-500 text-black rounded hover:bg-yellow-400 disabled:opacity-50"
                  >
                    Add Comment
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
