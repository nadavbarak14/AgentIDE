import React, { useState, useEffect, useRef } from 'react';

export interface StartAgentOptions {
  title: string;
  worktree: boolean;
  resume: boolean;
  continueLatest: boolean;
  flags: string;
}

interface StartAgentModalProps {
  defaultName: string;
  projectName: string;
  onConfirm: (options: StartAgentOptions) => void;
  onClose: () => void;
}

// Flag options for reference (used in the UI below)
// const FLAG_OPTIONS = [
//   { id: 'skip-permissions', label: 'Skip Permissions', flag: '--dangerously-skip-permissions', warn: true },
//   { id: 'worktree', label: 'Worktree', description: 'Isolated git branch' },
//   { id: 'resume', label: 'Resume', description: 'Resume last conversation' },
//   { id: 'continue', label: 'Continue', description: 'Continue latest session' },
// ];

export function StartAgentModal({ defaultName, projectName, onConfirm, onClose }: StartAgentModalProps) {
  const [title, setTitle] = useState(defaultName);
  const [worktree, setWorktree] = useState(false);
  const [resume, setResume] = useState(false);
  const [continueLatest, setContinueLatest] = useState(false);
  const [skipPermissions, setSkipPermissions] = useState(true);
  const [extraFlags, setExtraFlags] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const flags = [
      skipPermissions ? '--dangerously-skip-permissions' : '',
      extraFlags.trim(),
    ].filter(Boolean).join(' ');
    onConfirm({ title: title.trim() || defaultName, worktree, resume, continueLatest, flags });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-800 rounded-lg p-5 max-w-md w-full mx-4 mt-20 shadow-xl border border-gray-700">
        <h2 className="text-base font-semibold text-white mb-0.5">Start New Agent</h2>
        <p className="text-xs text-gray-500 mb-4">{projectName}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Session Name</label>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultName}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Options</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setWorktree(!worktree)}
                className={`px-2.5 py-1 text-xs rounded border transition ${
                  worktree ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                Worktree
              </button>
              <button
                type="button"
                onClick={() => { setResume(!resume); if (!resume) setContinueLatest(false); }}
                className={`px-2.5 py-1 text-xs rounded border transition ${
                  resume ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => { setContinueLatest(!continueLatest); if (!continueLatest) setResume(false); }}
                className={`px-2.5 py-1 text-xs rounded border transition ${
                  continueLatest ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setSkipPermissions(!skipPermissions)}
                className={`px-2.5 py-1 text-xs rounded border transition ${
                  skipPermissions ? 'bg-amber-600/20 border-amber-500/40 text-amber-300' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                Skip Permissions
              </button>
            </div>
          </div>

          {/* Extra flags */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Extra CLI Flags</label>
            <input
              type="text"
              value={extraFlags}
              onChange={(e) => setExtraFlags(e.target.value)}
              placeholder="--flag1 --flag2"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition">
              Start
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
