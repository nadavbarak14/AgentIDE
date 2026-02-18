import { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { files as filesApi } from '../services/api';

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentRef = useRef<string>('');
  const editorContentRef = useRef<string>('');

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
    if (!isModified) return;
    setSaveStatus('saving');
    try {
      await filesApi.save(sessionId, filePath, editorContentRef.current);
      prevContentRef.current = editorContentRef.current;
      setIsModified(false);
      setSaveStatus('saved');
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  }, [sessionId, filePath, isModified]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      editorContentRef.current = value;
      setIsModified(value !== prevContentRef.current);
    }
  }, []);

  const handleEditorMount: OnMount = useCallback((editor) => {
    // Bind Ctrl+S / Cmd+S to save
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
      2048 | 49, // CtrlCmd = 2048, KeyS = 49
      () => { handleSave(); },
    );
  }, [handleSave]);

  const isTruncated = fileSize > ONE_MB;

  return (
    <div className={`flex flex-col h-full transition-all duration-500 ${flash ? 'ring-2 ring-yellow-400/50' : ''}`}>
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
                {isActive && isModified && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title="Unsaved changes" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose?.(tab);
                  }}
                  className="ml-1 text-gray-500 hover:text-white"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Save Status */}
      {saveStatus !== 'idle' && (
        <div className={`px-3 py-0.5 text-xs border-b border-gray-700 ${
          saveStatus === 'saving' ? 'text-gray-400' : 'text-green-400'
        }`}>
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </div>
      )}

      {/* Truncation Banner */}
      {isTruncated && !loading && !error && (
        <div className="px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30 text-xs text-yellow-400">
          File truncated — showing first 1 MB
        </div>
      )}

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden bg-gray-900">
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
            }}
          />
        )}
      </div>
    </div>
  );
}
