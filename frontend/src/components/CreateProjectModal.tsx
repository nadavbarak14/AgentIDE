import React, { useState, useEffect } from 'react';
import { projects as projectsApi, github as githubApi } from '../services/api';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  workerId: string;
  parentId?: string;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
  workerId,
  parentId,
}: CreateProjectModalProps) {
  const [githubRepo, setGithubRepo] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [directoryPath, setDirectoryPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const [ghChecking, setGhChecking] = useState(false);

  // Check GitHub CLI availability on mount
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setGhChecking(true);
    githubApi
      .check()
      .then((res) => {
        if (!cancelled) setGhAvailable(res.available);
      })
      .catch(() => {
        if (!cancelled) setGhAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setGhChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setGithubRepo('');
      setDisplayName('');
      setDirectoryPath('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const repoPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedRepo = githubRepo.trim();
    if (trimmedRepo && !repoPattern.test(trimmedRepo)) {
      setError('Invalid repo format. Use "owner/repo" (e.g. "acme/my-project").');
      return;
    }

    if (!trimmedRepo && !displayName.trim() && !directoryPath.trim()) {
      setError('Please provide at least a GitHub repo, display name, or directory path.');
      return;
    }

    setSubmitting(true);
    try {
      await projectsApi.create({
        workerId,
        githubRepo: trimmedRepo || undefined,
        displayName: displayName.trim() || undefined,
        directoryPath: directoryPath.trim() || undefined,
        parentId,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 mt-20 shadow-xl border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">
          {parentId ? 'Create Subproject' : 'Create Project'}
        </h2>

        {/* GitHub CLI status */}
        {ghChecking && (
          <p className="text-xs text-gray-500 mb-3">Checking GitHub CLI...</p>
        )}
        {ghAvailable === false && (
          <p className="text-xs text-yellow-400 mb-3">
            GitHub CLI not available. You can still create a project without GitHub integration.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* GitHub Repo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              GitHub Repo
            </label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional. Links this project to a GitHub repository for issues and PRs.
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={githubRepo ? githubRepo.split('/').pop() || 'Project name' : 'Project name'}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional. Auto-derived from the repo name if left blank.
            </p>
          </div>

          {/* Directory Path */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Directory Path
            </label>
            <input
              type="text"
              value={directoryPath}
              onChange={(e) => setDirectoryPath(e.target.value)}
              placeholder="/path/to/project"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional. The local directory for this project.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 rounded transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
