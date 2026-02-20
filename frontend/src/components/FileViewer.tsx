import { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { files as filesApi, comments as commentsApi, type CommentData } from '../services/api';

interface FileViewerProps {
  sessionId: string;
  filePath: string;
  fileTabs?: string[];
  activeTabIndex?: number;
  onTabSelect?: (index: number) => void;
  onTabClose?: (path: string) => void;
  onClose: () => void;
  refreshKey?: number;
}

// Map file extensions to Monaco language IDs
const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', less: 'less',
  html: 'html', xml: 'xml', svg: 'xml',
  py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gitignore: 'plaintext', env: 'plaintext',
};

function getMonacoLanguage(filePath: string, backendLanguage?: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const basename = filePath.split('/').pop()?.toLowerCase() || '';

  // Check basename for special files
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';

  return LANGUAGE_MAP[ext] || backendLanguage || 'plaintext';
}

const ONE_MB = 1024 * 1024;

export function FileViewer({
  sessionId,
  filePath,
  fileTabs,
  activeTabIndex,
  onTabSelect,
  onTabClose,
  onClose: _onClose,
  refreshKey = 0,
}: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentRef = useRef<string>('');
  const editorContentRef = useRef<string>('');
  const saveRef = useRef<() => void>(() => {});

  // Comment system state
  const [selectedLines, setSelectedLines] = useState<{ start: number; end: number } | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [existingComments, setExistingComments] = useState<CommentData[]>([]);
  const [savingComment, setSavingComment] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [floatingBtnPos, setFloatingBtnPos] = useState<{ top: number; left: number } | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const zoneIdsRef = useRef<string[]>([]);

  useEffect(() => {
    setLoading(prevContentRef.current === ''); // Only show loading on first load
    setError(null);
    filesApi.content(sessionId, filePath)
      .then((result) => {
        // Flash if content changed on refresh
        if (prevContentRef.current && result.content !== prevContentRef.current) {
          triggerFlash();
        }
        prevContentRef.current = result.content;
        editorContentRef.current = result.content;
        setContent(result.content);
        setIsModified(false);
        setLanguage(getMonacoLanguage(filePath, result.language));
        setFileSize(result.size);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load file'))
      .finally(() => setLoading(false));
  }, [sessionId, filePath, refreshKey]);

  // Load existing comments for the current file
  useEffect(() => {
    commentsApi.list(sessionId)
      .then((result) => {
        setExistingComments(result.comments.filter((c) => c.filePath === filePath));
      })
      .catch(() => setExistingComments([]));
  }, [sessionId, filePath, refreshKey]);

  // Dismiss comment input on file tab switch (T016)
  useEffect(() => {
    setShowCommentInput(false);
    setCommentText('');
    setSelectedLines(null);
    setFloatingBtnPos(null);
  }, [filePath]);

  // Flash effect for content updates
  const triggerFlash = () => {
    setFlash(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlash(false), 500);
  };

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (editorContentRef.current === prevContentRef.current) return;
    setSaveStatus('saving');
    try {
      await filesApi.save(sessionId, filePath, editorContentRef.current);
      prevContentRef.current = editorContentRef.current;
      setIsModified(false);
      setSaveStatus('saved');
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('error');
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [sessionId, filePath]);

  // Keep ref in sync so Monaco's onMount closure always calls the latest version
  saveRef.current = handleSave;

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      editorContentRef.current = value;
      setIsModified(value !== prevContentRef.current);
    }
  }, []);

  // Store refs for selection handler to avoid stale closures
  const selectedLinesRef = useRef(selectedLines);
  selectedLinesRef.current = selectedLines;
  const showCommentInputRef = useRef(showCommentInput);
  showCommentInputRef.current = showCommentInput;

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    // Bind Ctrl+S / Cmd+S to save — uses ref to avoid stale closure
    editor.addCommand(
      2048 | 49, // CtrlCmd = 2048, KeyS = 49
      () => { saveRef.current(); },
    );

    // Listen for selection changes to show floating Comment button
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        setFloatingBtnPos(null);
        setSelectedLines(null);
        return;
      }

      // Don't reset selection if comment input is open
      if (showCommentInputRef.current) return;

      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      setSelectedLines({ start: startLine, end: endLine });

      // Position floating button near the end of selection
      const endPos = editor.getScrolledVisiblePosition({
        lineNumber: endLine,
        column: selection.endColumn,
      });
      if (endPos && containerRef.current) {
        setFloatingBtnPos({
          top: endPos.top + endPos.height + 4,
          left: Math.min(endPos.left + 20, containerRef.current.clientWidth - 100),
        });
      }
    });
  }, []);

  // Create comment and optionally send immediately
  const createComment = useCallback(async (sendImmediately: boolean) => {
    if (!selectedLines || !commentText.trim()) return;

    // Extract code snippet from editor
    const model = editorRef.current?.getModel();
    const codeSnippet = model
      ? model.getValueInRange({
          startLineNumber: selectedLines.start,
          startColumn: 1,
          endLineNumber: selectedLines.end,
          endColumn: model.getLineMaxColumn(selectedLines.end),
        })
      : '(selected code)';

    setSavingComment(true);
    try {
      const created = await commentsApi.create(sessionId, {
        filePath,
        startLine: selectedLines.start,
        endLine: selectedLines.end,
        codeSnippet,
        commentText: commentText.trim(),
      });

      if (sendImmediately) {
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
      setFloatingBtnPos(null);
    } catch {
      // Keep input open for retry
    } finally {
      setSavingComment(false);
    }
  }, [sessionId, filePath, selectedLines, commentText]);

  const handleAddComment = useCallback(() => createComment(false), [createComment]);
  const handleSendComment = useCallback(() => createComment(true), [createComment]);

  // Send All pending comments (T012)
  const handleSendAll = useCallback(async () => {
    const pending = existingComments.filter((c) => c.status === 'pending');
    if (pending.length === 0) return;
    setSendingAll(true);
    try {
      const result = await commentsApi.deliver(sessionId);
      const deliveredSet = new Set(result.delivered);
      setExistingComments((prev) => prev.filter((c) => !deliveredSet.has(c.id)));
    } catch {
      // Stay as pending
    } finally {
      setSendingAll(false);
    }
  }, [sessionId, existingComments]);

  // Apply Monaco decorations for commented lines
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const pendingComments = existingComments.filter((c) => c.status === 'pending');
    const newDecorations = pendingComments.map((c) => ({
      range: {
        startLineNumber: c.startLine,
        startColumn: 1,
        endLineNumber: c.endLine,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'comment-line-decoration',
        overviewRuler: {
          color: '#eab308',
          position: 1,
        },
      },
    }));

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      newDecorations,
    );
  }, [existingComments]);

  // Zone widgets for inline comment display with edit/delete (T011)
  const editingCommentIdRef = useRef(editingCommentId);
  editingCommentIdRef.current = editingCommentId;
  const editCommentTextRef = useRef(editCommentText);
  editCommentTextRef.current = editCommentText;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const pendingComments = existingComments.filter((c) => c.status === 'pending');

    // Group comments by endLine
    const commentsByLine = new Map<number, CommentData[]>();
    for (const c of pendingComments) {
      const line = c.endLine;
      if (!commentsByLine.has(line)) commentsByLine.set(line, []);
      commentsByLine.get(line)!.push(c);
    }

    editor.changeViewZones((accessor: { addZone: (zone: unknown) => string; removeZone: (id: string) => void }) => {
      // Remove old zones
      for (const id of zoneIdsRef.current) {
        accessor.removeZone(id);
      }
      zoneIdsRef.current = [];

      for (const [line, lineComments] of commentsByLine) {
        const domNode = document.createElement('div');
        domNode.style.zIndex = '10';

        const renderZoneContent = () => {
          domNode.innerHTML = '';
          for (const c of lineComments) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; padding: 4px 12px; font-size: 12px; border-left: 2px solid #3b82f6; background: rgba(59,130,246,0.05);';

            if (editingCommentIdRef.current === c.id) {
              // Edit mode
              row.style.flexDirection = 'column';
              row.style.gap = '4px';

              const label = document.createElement('div');
              label.style.cssText = 'font-size: 10px; color: #6b7280;';
              label.textContent = `Edit comment on line ${c.startLine}`;
              row.appendChild(label);

              const textarea = document.createElement('textarea');
              textarea.value = editCommentTextRef.current;
              textarea.rows = 3;
              textarea.style.cssText = 'width: 100%; background: #111827; border: 1px solid #374151; border-radius: 4px; padding: 4px 8px; font-size: 12px; color: #d1d5db; resize: none; outline: none; font-family: inherit;';
              textarea.addEventListener('input', (e) => {
                const val = (e.target as HTMLTextAreaElement).value;
                editCommentTextRef.current = val;
                setEditCommentText(val);
              });
              textarea.addEventListener('focus', () => {
                textarea.style.borderColor = '#3b82f6';
              });
              textarea.addEventListener('blur', () => {
                textarea.style.borderColor = '#374151';
              });
              textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                  setEditingCommentId(null);
                  setEditCommentText('');
                }
              });
              row.appendChild(textarea);

              const btnRow = document.createElement('div');
              btnRow.style.cssText = 'display: flex; gap: 8px;';

              const saveBtn = document.createElement('button');
              saveBtn.textContent = 'Save';
              saveBtn.style.cssText = 'padding: 2px 8px; font-size: 12px; background: #eab308; color: black; border-radius: 4px; border: none; cursor: pointer;';
              saveBtn.addEventListener('click', async () => {
                const text = editCommentTextRef.current.trim();
                if (!text) return;
                try {
                  const updated = await commentsApi.update(sessionId, c.id, text);
                  setExistingComments((prev) => prev.map((x) => x.id === c.id ? updated : x));
                } catch { /* keep open */ return; }
                setEditingCommentId(null);
                setEditCommentText('');
              });
              btnRow.appendChild(saveBtn);

              const cancelBtn = document.createElement('button');
              cancelBtn.textContent = 'Cancel';
              cancelBtn.style.cssText = 'padding: 2px 8px; font-size: 12px; color: #9ca3af; border: none; cursor: pointer; background: none;';
              cancelBtn.addEventListener('click', () => {
                setEditingCommentId(null);
                setEditCommentText('');
              });
              btnRow.appendChild(cancelBtn);

              row.appendChild(btnRow);

              // Auto-focus textarea
              requestAnimationFrame(() => textarea.focus());
            } else {
              // Display mode
              const badge = document.createElement('span');
              badge.textContent = 'Pending';
              badge.style.cssText = 'display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; background: rgba(234,179,8,0.2); color: #eab308; flex-shrink: 0;';
              row.appendChild(badge);

              const text = document.createElement('span');
              text.textContent = c.commentText;
              text.style.cssText = 'color: #d1d5db; flex: 1;';
              row.appendChild(text);

              const sendBtn = document.createElement('button');
              sendBtn.textContent = 'send';
              sendBtn.style.cssText = 'font-size: 10px; color: #22c55e; border: none; cursor: pointer; background: none;';
              sendBtn.addEventListener('mouseover', () => { sendBtn.style.color = '#4ade80'; });
              sendBtn.addEventListener('mouseout', () => { sendBtn.style.color = '#22c55e'; });
              sendBtn.addEventListener('click', async () => {
                try {
                  const result = await commentsApi.deliverOne(sessionId, c.id);
                  const deliveredSet = new Set(result.delivered);
                  setExistingComments((prev) => prev.filter((x) => !deliveredSet.has(x.id)));
                } catch { /* keep as pending */ }
              });
              row.appendChild(sendBtn);

              const editBtn = document.createElement('button');
              editBtn.textContent = 'edit';
              editBtn.style.cssText = 'font-size: 10px; color: #6b7280; border: none; cursor: pointer; background: none;';
              editBtn.addEventListener('mouseover', () => { editBtn.style.color = '#60a5fa'; });
              editBtn.addEventListener('mouseout', () => { editBtn.style.color = '#6b7280'; });
              editBtn.addEventListener('click', () => {
                setEditingCommentId(c.id);
                setEditCommentText(c.commentText);
              });
              row.appendChild(editBtn);

              const delBtn = document.createElement('button');
              delBtn.textContent = '×';
              delBtn.style.cssText = 'font-size: 10px; color: #6b7280; border: none; cursor: pointer; background: none;';
              delBtn.addEventListener('mouseover', () => { delBtn.style.color = '#f87171'; });
              delBtn.addEventListener('mouseout', () => { delBtn.style.color = '#6b7280'; });
              delBtn.addEventListener('click', async () => {
                try {
                  await commentsApi.delete(sessionId, c.id);
                  setExistingComments((prev) => prev.filter((x) => x.id !== c.id));
                } catch { /* ignore */ }
              });
              row.appendChild(delBtn);
            }

            domNode.appendChild(row);
          }
        };

        renderZoneContent();

        const isEditing = lineComments.some((c) => editingCommentIdRef.current === c.id);
        const heightPerComment = isEditing ? 100 : 28;
        const totalHeight = lineComments.length * heightPerComment + 4;

        const zoneId = accessor.addZone({
          afterLineNumber: line,
          heightInPx: totalHeight,
          domNode,
          suppressMouseDown: false,
        });
        zoneIdsRef.current.push(zoneId as string);
      }
    });
  }, [existingComments, editingCommentId, editCommentText, sessionId]);

  const pendingCount = existingComments.filter((c) => c.status === 'pending').length;
  const isTruncated = fileSize > ONE_MB;

  return (
    <div
      className={`flex flex-col h-full transition-all duration-500 ${flash ? 'ring-2 ring-yellow-400/50' : ''}`}
      onKeyDown={(e) => {
        // Defensive Ctrl+Z prevention — stop browser back-nav if event reaches here
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
        }
      }}
    >
      {/* Tab Bar */}
      {fileTabs && fileTabs.length > 0 && (
        <div className="flex items-center border-b border-gray-700 bg-gray-800/50 overflow-x-auto flex-shrink-0">
          {fileTabs.map((tab, index) => {
            const fileName = tab.split('/').pop() || tab;
            const isActive = index === (activeTabIndex ?? 0);
            return (
              <div
                key={tab}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-gray-700 flex-shrink-0 ${
                  isActive
                    ? 'bg-gray-900 text-white border-b-2 border-b-blue-400'
                    : 'text-gray-400 hover:bg-gray-700/50'
                }`}
                onClick={() => onTabSelect?.(index)}
              >
                <span className="truncate max-w-[120px]" title={tab}>{fileName}</span>
                {isActive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(tab).catch(() => {});
                    }}
                    className="text-gray-600 hover:text-gray-300 transition-colors"
                    title="Copy file path"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                )}
                {isActive && isModified && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title="Unsaved changes" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isActive && isModified) {
                      setPendingCloseTab(tab);
                    } else {
                      onTabClose?.(tab);
                    }
                  }}
                  className="ml-1 text-gray-500 hover:text-white"
                >
                  ×
                </button>
              </div>
            );
          })}
          {/* Save Button */}
          {isModified && (
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className="ml-auto px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded mx-1.5 my-0.5 flex-shrink-0 transition-colors"
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
          )}
          {/* Send All Button (T014) */}
          {pendingCount > 0 && (
            <button
              onClick={handleSendAll}
              disabled={sendingAll}
              className={`${isModified ? '' : 'ml-auto '}px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 mx-1.5 my-0.5 flex-shrink-0`}
            >
              {sendingAll ? 'Sending...' : `Send All (${pendingCount})`}
            </button>
          )}
        </div>
      )}

      {/* Unsaved close confirmation */}
      {pendingCloseTab && (
        <div className="px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30 text-xs flex items-center gap-2 flex-shrink-0">
          <span className="text-yellow-400">Unsaved changes</span>
          <button
            onClick={() => {
              onTabClose?.(pendingCloseTab);
              setPendingCloseTab(null);
            }}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs"
          >
            Discard
          </button>
          <button
            onClick={() => setPendingCloseTab(null)}
            className="px-2 py-0.5 text-gray-400 hover:text-white text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Save Status */}
      {saveStatus !== 'idle' && (
        <div className={`px-3 py-0.5 text-xs border-b border-gray-700 ${
          saveStatus === 'saving' ? 'text-gray-400' : saveStatus === 'error' ? 'text-red-400' : 'text-green-400'
        }`}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </div>
      )}

      {/* Truncation Banner */}
      {isTruncated && !loading && !error && (
        <div className="px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30 text-xs text-yellow-400">
          File truncated — showing first 1 MB
        </div>
      )}

      {/* Editor Area (T013) */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-900 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 px-4">
            {error}
          </div>
        ) : (
          <Editor
            value={content}
            language={language}
            theme="vs-dark"
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              fontSize: 13,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              folding: true,
              automaticLayout: true,
              glyphMargin: true,
            }}
          />
        )}

        {/* Floating "Comment" button */}
        {floatingBtnPos && !showCommentInput && (
          <button
            className="absolute z-20 px-2 py-1 text-xs bg-blue-500 text-white rounded shadow-lg hover:bg-blue-600"
            style={{ top: floatingBtnPos.top, left: floatingBtnPos.left }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setShowCommentInput(true);
              setFloatingBtnPos(null);
            }}
          >
            Comment
          </button>
        )}
      </div>

      {/* Inline comment input (T013) */}
      {showCommentInput && selectedLines && (
        <div className="border-l-2 border-blue-500 bg-gray-800 p-2 flex-shrink-0">
          <div className="text-[10px] text-gray-500 mb-1">
            Comment on {selectedLines.start === selectedLines.end
              ? `line ${selectedLines.start}`
              : `lines ${selectedLines.start}–${selectedLines.end}`}
          </div>
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
              onClick={handleSendComment}
              disabled={!commentText.trim() || savingComment}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
            >
              {savingComment ? 'Sending...' : 'Send Comment'}
            </button>
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim() || savingComment}
              className="px-2 py-1 text-xs bg-yellow-500 text-black rounded hover:bg-yellow-400 disabled:opacity-50"
            >
              Add to Review
            </button>
            <button
              onClick={() => {
                setShowCommentInput(false);
                setCommentText('');
                setSelectedLines(null);
              }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
