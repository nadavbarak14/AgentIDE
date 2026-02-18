import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [existingComments, setExistingComments] = useState<CommentData[]>([]);
  const [savingComment, setSavingComment] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [commentSide, setCommentSide] = useState<'old' | 'new'>('new');

  // Track previous refreshKey to distinguish initial load from background refresh
  const prevRefreshKeyRef = useRef(refreshKey);

  // Load diff — initial load shows spinner, subsequent refreshKey changes fetch silently
  useEffect(() => {
    const isBackgroundRefresh = diff !== null && prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;

    if (!isBackgroundRefresh) {
      setLoading(true);
    }

    filesApi.diff(sessionId)
      .then((result) => {
        setDiff(result);
        setParsedFiles(parseDiff(result.diff));
      })
      .catch(() => {
        if (!isBackgroundRefresh) setDiff(null);
      })
      .finally(() => {
        if (!isBackgroundRefresh) setLoading(false);
      });
  }, [sessionId, refreshKey]);

  // Load existing comments
  useEffect(() => {
    commentsApi.list(sessionId)
      .then((result) => setExistingComments(result.comments))
      .catch(() => setExistingComments([]));
  }, [sessionId, refreshKey]);

  // Gutter "+" click — immediately opens comment input
  const handleGutterPlusClick = useCallback((lineNum: number, shiftKey: boolean, side: 'old' | 'new' = 'new') => {
    if (shiftKey && selectedLines) {
      setSelectedLines({
        start: Math.min(selectedLines.start, lineNum),
        end: Math.max(selectedLines.end, lineNum),
      });
    } else {
      setSelectedLines({ start: lineNum, end: lineNum });
    }
    setCommentSide(side);
    setShowCommentInput(true);
    setCommentText('');
  }, [selectedLines]);

  // Ref to capture exact selected text from text selection (T008)
  const selectionTextRef = useRef<string>('');

  // Create comment and optionally send immediately
  const createComment = useCallback(async (sendImmediately: boolean) => {
    if (!selectedFile || !selectedLines || !commentText.trim()) return;

    const file = parsedFiles.find((f) => f.path === selectedFile);
    if (!file) return;

    // Use exact selected text if available (from text selection), otherwise extract from correct column
    let codeSnippet = selectionTextRef.current;
    if (!codeSnippet) {
      codeSnippet = file.sideBySideLines
        .filter((pair) => {
          const lineNum = commentSide === 'old'
            ? (pair.left?.lineNumber ?? 0)
            : (pair.right?.lineNumber ?? pair.left?.lineNumber ?? 0);
          return lineNum >= selectedLines.start && lineNum <= selectedLines.end;
        })
        .map((pair) => {
          if (commentSide === 'old') return pair.left?.content ?? '';
          return pair.right?.content ?? '';
        })
        .join('\n');
    }

    setSavingComment(true);
    try {
      const created = await commentsApi.create(sessionId, {
        filePath: selectedFile,
        startLine: selectedLines.start,
        endLine: selectedLines.end,
        codeSnippet: codeSnippet || '(selected code)',
        commentText: commentText.trim(),
        side: commentSide,
      });

      if (sendImmediately) {
        // Send right away — deliver and remove
        try {
          await commentsApi.deliverOne(sessionId, created.id);
        } catch {
          // If deliver fails, keep as pending
          setExistingComments((prev) => [...prev, created]);
        }
      } else {
        setExistingComments((prev) => [...prev, created]);
      }

      setCommentText('');
      setShowCommentInput(false);
      setSelectedLines(null);
      selectionTextRef.current = '';
    } catch {
      // Keep input open so user can retry
    } finally {
      setSavingComment(false);
    }
  }, [sessionId, selectedFile, selectedLines, commentText, parsedFiles, commentSide]);

  // "Add to Review" — saves as pending
  const handleAddComment = useCallback(() => createComment(false), [createComment]);

  // "Send Comment" — saves and delivers immediately
  const handleSendComment = useCallback(() => createComment(true), [createComment]);

  // "Send All" — delivers all pending comments to the session at once
  const handleSendAll = useCallback(async () => {
    const pending = existingComments.filter((c) => c.status === 'pending');
    if (pending.length === 0) return;
    setSendingAll(true);
    try {
      const result = await commentsApi.deliver(sessionId);
      // Remove delivered comments from view (ephemeral — already deleted from DB)
      const deliveredSet = new Set(result.delivered);
      setExistingComments((prev) => prev.filter((c) => !deliveredSet.has(c.id)));
    } catch {
      // Stay as pending
    } finally {
      setSendingAll(false);
    }
  }, [sessionId, existingComments]);

  // Handler for gutter drag / text selection — sets selected lines without opening comment input
  const handleSelectLines = useCallback((start: number, end: number) => {
    setSelectedLines({ start, end });
  }, []);

  // Edit/delete handlers for inline comments
  const handleEditStart = useCallback((id: string, text: string) => {
    setEditingCommentId(id);
    setEditCommentText(text);
  }, []);

  const handleEditSave = useCallback(async (id: string) => {
    if (!editCommentText.trim()) return;
    try {
      const updated = await commentsApi.update(sessionId, id, editCommentText.trim());
      setExistingComments((prev) => prev.map((x) => x.id === id ? updated : x));
    } catch {
      // Keep edit mode open for retry
      return;
    }
    setEditingCommentId(null);
    setEditCommentText('');
  }, [sessionId, editCommentText]);

  const handleEditCancel = useCallback(() => {
    setEditingCommentId(null);
    setEditCommentText('');
  }, []);

  const handleDeleteComment = useCallback(async (id: string) => {
    try {
      await commentsApi.delete(sessionId, id);
      setExistingComments((prev) => prev.filter((x) => x.id !== id));
    } catch {
      // Ignore — comment stays
    }
  }, [sessionId]);

  const handleSendNow = useCallback(async (id: string) => {
    try {
      const result = await commentsApi.deliverOne(sessionId, id);
      const deliveredSet = new Set(result.delivered);
      setExistingComments((prev) => prev.filter((c) => !deliveredSet.has(c.id)));
    } catch {
      // Keep comment as pending
    }
  }, [sessionId]);

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
          {existingComments.filter((c) => c.status === 'pending').length > 0 && (
            <button
              onClick={handleSendAll}
              disabled={sendingAll}
              className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {sendingAll ? 'Sending...' : `Send All (${existingComments.filter((c) => c.status === 'pending').length})`}
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
                savingComment={savingComment}
                editingCommentId={editingCommentId}
                editCommentText={editCommentText}
                commentSide={commentSide}
                selectionTextRef={selectionTextRef}
                onGutterPlusClick={handleGutterPlusClick}
                onSelectLines={handleSelectLines}
                onSetCommentSide={setCommentSide}
                onCommentTextChange={setCommentText}
                onCommentSubmit={handleAddComment}
                onSendComment={handleSendComment}
                onCommentCancel={() => {
                  setShowCommentInput(false);
                  setCommentText('');
                  setSelectedLines(null);
                  selectionTextRef.current = '';
                }}
                onEditStart={handleEditStart}
                onEditTextChange={setEditCommentText}
                onEditSave={handleEditSave}
                onEditCancel={handleEditCancel}
                onDelete={handleDeleteComment}
                onSendNow={handleSendNow}
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
  savingComment: boolean;
  editingCommentId: string | null;
  editCommentText: string;
  commentSide: 'old' | 'new';
  selectionTextRef: React.MutableRefObject<string>;
  onGutterPlusClick: (lineNum: number, shiftKey: boolean, side?: 'old' | 'new') => void;
  onSelectLines: (start: number, end: number) => void;
  onSetCommentSide: (side: 'old' | 'new') => void;
  onCommentTextChange: (text: string) => void;
  onCommentSubmit: () => void;
  onSendComment: () => void;
  onCommentCancel: () => void;
  onEditStart: (id: string, text: string) => void;
  onEditTextChange: (text: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => void;
}

function SideBySideDiff({
  file,
  filePath,
  selectedLines,
  showCommentInput,
  commentText,
  existingComments,
  savingComment,
  editingCommentId,
  editCommentText,
  commentSide,
  selectionTextRef,
  onGutterPlusClick,
  onSelectLines,
  onSetCommentSide,
  onCommentTextChange,
  onCommentSubmit,
  onSendComment,
  onCommentCancel,
  onEditStart,
  onEditTextChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onSendNow,
}: SideBySideDiffProps) {
  const rows = file.sideBySideLines;
  const isNewFile = file.changeType === 'A';
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Gutter drag state ---
  const [isDragging, setIsDragging] = useState(false);
  const dragStartLineRef = useRef<number | null>(null);

  const handleGutterMouseDown = useCallback((lineNum: number) => {
    setIsDragging(true);
    dragStartLineRef.current = lineNum;
    // Highlight just this line immediately
    onSelectLines(lineNum, lineNum);
  }, [onSelectLines]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the closest gutter element under cursor
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const gutterEl = el?.closest('[data-line-number]');
      if (gutterEl && dragStartLineRef.current !== null) {
        const lineNum = parseInt(gutterEl.getAttribute('data-line-number')!, 10);
        const start = Math.min(dragStartLineRef.current, lineNum);
        const end = Math.max(dragStartLineRef.current, lineNum);
        onSelectLines(start, end);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartLineRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onSelectLines]);

  // --- Text selection → floating "Comment" button ---
  const [floatingBtn, setFloatingBtn] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      // Small delay to let browser finalize selection
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          setFloatingBtn(null);
          return;
        }

        // Check selection is within this container
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) {
          setFloatingBtn(null);
          return;
        }

        // Walk up from start and end to find data-line-number attributes
        const findLineNumber = (node: Node): number | null => {
          let el: Element | null = node instanceof Element ? node : node.parentElement;
          while (el && el !== container) {
            if (el.hasAttribute('data-line-number')) {
              return parseInt(el.getAttribute('data-line-number')!, 10);
            }
            // Check siblings and parent for line number context
            const parent = el.closest('[data-line-number]');
            if (parent) return parseInt(parent.getAttribute('data-line-number')!, 10);
            el = el.parentElement;
          }
          return null;
        };

        const startLine = findLineNumber(range.startContainer);
        const endLine = findLineNumber(range.endContainer);

        if (startLine !== null && endLine !== null && (startLine !== endLine || sel.toString().trim().length > 0)) {
          const rect = range.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          setFloatingBtn({
            top: rect.bottom - containerRect.top + 4,
            left: rect.left - containerRect.left + rect.width / 2,
          });
          onSelectLines(Math.min(startLine, endLine), Math.max(startLine, endLine));

          // Detect which column the selection is in (old=left, new=right)
          const selAnchor = sel.anchorNode;
          if (selAnchor) {
            const el = selAnchor instanceof Element ? selAnchor : selAnchor.parentElement;
            const gridRow = el?.closest('.grid.grid-cols-2');
            if (gridRow) {
              // If the selection is in the first child (left column), it's 'old'
              const leftCol = gridRow.children[0];
              if (leftCol && leftCol.contains(selAnchor as Node)) {
                onSetCommentSide('old');
              } else {
                onSetCommentSide('new');
              }
            } else {
              // New file mode (no grid), always 'new'
              onSetCommentSide('new');
            }
          }
        } else {
          setFloatingBtn(null);
        }
      });
    };

    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [onSelectLines, onSetCommentSide]);

  const handleFloatingCommentClick = useCallback(() => {
    if (selectedLines) {
      // Capture exact selected text before clearing selection
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        selectionTextRef.current = sel.toString();
      }
      onGutterPlusClick(selectedLines.start, false, commentSide);
      // Re-set the range since onGutterPlusClick resets to single line
      onSelectLines(selectedLines.start, selectedLines.end);
    }
    setFloatingBtn(null);
    window.getSelection()?.removeAllRanges();
  }, [selectedLines, onGutterPlusClick, onSelectLines, commentSide, selectionTextRef]);

  // Dismiss floating button on outside click
  useEffect(() => {
    if (!floatingBtn) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.floating-comment-btn')) {
        setFloatingBtn(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [floatingBtn]);

  return (
    <div ref={containerRef} className="relative" style={{ cursor: isDragging ? 'row-resize' : undefined }}>
      {/* Column headers */}
      {isNewFile ? (
        <div className="border-b border-gray-700 text-[10px] text-gray-500 uppercase tracking-wide">
          <div className="px-3 py-1">New File</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 border-b border-gray-700 text-[10px] text-gray-500 uppercase tracking-wide">
          <div className="px-3 py-1 border-r border-gray-700">Old</div>
          <div className="px-3 py-1">New</div>
        </div>
      )}

      {/* Diff rows */}
      {rows.map((pair, rowIdx) => {
        const rightLineNum = pair.right?.lineNumber ?? null;
        const isSelected = selectedLines && rightLineNum !== null &&
          rightLineNum >= selectedLines.start && rightLineNum <= selectedLines.end;
        const isSelectedLeft = selectedLines && pair.left?.lineNumber != null && pair.right === null &&
          pair.left.lineNumber >= selectedLines.start && pair.left.lineNumber <= selectedLines.end;

        // Check if inline comment box should appear after this row
        const showInputAfterRow = showCommentInput && selectedLines &&
          rightLineNum === selectedLines.end;
        const showInputAfterLeftRow = showCommentInput && selectedLines && pair.right === null &&
          pair.left?.lineNumber === selectedLines.end;

        // Existing comments anchored to this line — side-aware matching
        const lineComments = existingComments.filter(
          (c) => c.filePath === filePath && (
            (c.side === 'old' && pair.left !== null && c.startLine === pair.left.lineNumber) ||
            (c.side === 'new' && c.startLine === (pair.right?.lineNumber ?? 0))
          )
        );

        return (
          <div key={rowIdx}>
            {/* The side-by-side row (or full-width for new files) */}
            {isNewFile ? (
              <DiffCell
                line={pair.right}
                side="right"
                isSelected={!!isSelected}
                onPlusClick={onGutterPlusClick}
                onGutterDragStart={handleGutterMouseDown}
              />
            ) : (
              <div className="grid grid-cols-2">
                {/* Left column (old) */}
                <DiffCell
                  line={pair.left}
                  side="left"
                  isSelected={!!(isSelectedLeft)}
                  onPlusClick={(lineNum, shiftKey) => onGutterPlusClick(lineNum, shiftKey, 'old')}
                  onGutterDragStart={handleGutterMouseDown}
                />
                {/* Right column (new) */}
                <DiffCell
                  line={pair.right}
                  side="right"
                  isSelected={!!isSelected}
                  onPlusClick={(lineNum, shiftKey) => onGutterPlusClick(lineNum, shiftKey, 'new')}
                  onGutterDragStart={handleGutterMouseDown}
                />
              </div>
            )}

            {/* Existing comments — inline with edit/delete controls */}
            {lineComments.length > 0 && (
              <div className="border-l-2 border-blue-500 bg-blue-500/5 px-3 py-1.5">
                {lineComments.map((c) => (
                  <div key={c.id} className="text-xs mb-1">
                    {editingCommentId === c.id ? (
                      <div className="mt-1">
                        <div className="text-[10px] text-gray-500 mb-1">
                          Edit comment on line {c.startLine}
                        </div>
                        <textarea
                          value={editCommentText}
                          onChange={(e) => onEditTextChange(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500 resize-none"
                          rows={3}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              onEditCancel();
                            }
                          }}
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => onEditSave(c.id)}
                            disabled={!editCommentText.trim()}
                            className="px-2 py-1 text-xs bg-yellow-500 text-black rounded hover:bg-yellow-400 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={onEditCancel}
                            className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400 flex-shrink-0">
                          Pending
                        </span>
                        <span className="text-gray-300 flex-1">{c.commentText}</span>
                        <button
                          onClick={() => onSendNow(c.id)}
                          className="text-[10px] text-green-500 hover:text-green-400"
                        >
                          send
                        </button>
                        <button
                          onClick={() => onEditStart(c.id, c.commentText)}
                          className="text-[10px] text-gray-500 hover:text-blue-400"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => onDelete(c.id)}
                          className="text-[10px] text-gray-500 hover:text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    )}
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
                    onClick={onSendComment}
                    disabled={!commentText.trim() || savingComment}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
                  >
                    {savingComment ? 'Sending...' : 'Send Comment'}
                  </button>
                  <button
                    onClick={onCommentSubmit}
                    disabled={!commentText.trim() || savingComment}
                    className="px-2 py-1 text-xs bg-yellow-500 text-black rounded hover:bg-yellow-400 disabled:opacity-50"
                  >
                    Add to Review
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

      {/* Floating "Comment" button for text selection */}
      {floatingBtn && !showCommentInput && (
        <button
          className="floating-comment-btn absolute z-20 px-2 py-1 text-xs bg-blue-500 text-white rounded shadow-lg hover:bg-blue-600 -translate-x-1/2"
          style={{ top: floatingBtn.top, left: floatingBtn.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleFloatingCommentClick}
        >
          Comment
        </button>
      )}
    </div>
  );
}

// --- Single Diff Cell (left or right column) ---

interface DiffCellProps {
  line: SideBySideLine['left'];
  side: 'left' | 'right';
  isSelected: boolean;
  onPlusClick: ((lineNum: number, shiftKey: boolean) => void) | null;
  onGutterDragStart?: ((lineNum: number) => void) | null;
}

function DiffCell({ line, side, isSelected, onPlusClick, onGutterDragStart }: DiffCellProps) {
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
    <div className={`group flex leading-5 ${bgClass} ${side === 'left' ? 'border-r border-gray-700' : ''}`} data-line-number={line.lineNumber}>
      {/* Line number + gutter "+" */}
      <div
        className="w-10 flex-shrink-0 flex items-center justify-end pr-1 text-gray-600 select-none text-xs relative cursor-pointer"
        data-line-number={line.lineNumber}
        onMouseDown={(e) => {
          if (onGutterDragStart && e.button === 0) {
            e.preventDefault();
            onGutterDragStart(line.lineNumber);
          }
        }}
      >
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
      <div className={`flex-1 px-2 whitespace-pre-wrap [overflow-wrap:anywhere] ${textClass}`} data-line-number={line.lineNumber}>
        {line.content}
      </div>
    </div>
  );
}
