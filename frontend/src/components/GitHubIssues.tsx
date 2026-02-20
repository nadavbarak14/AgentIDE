import { useState, useEffect, useCallback } from 'react';
import {
  github,
  type GitHubStatus,
  type GitHubIssue,
  type GitHubIssueDetail,
} from '../services/api';

interface GitHubIssuesProps {
  sessionId: string;
  onSendToClaude?: (text: string) => void;
  onClose: () => void;
}

export function GitHubIssues({ sessionId, onSendToClaude, onClose: _onClose }: GitHubIssuesProps) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');

  // Issue detail
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Check gh status first
  useEffect(() => {
    github.status(sessionId).then(setStatus).catch(() => {
      setStatus({
        ghInstalled: false,
        ghAuthenticated: false,
        repoDetected: false,
        repoOwner: null,
        repoName: null,
        error: 'Failed to check GitHub CLI status',
      });
    });
  }, [sessionId]);

  // Load issues when status is ready and filters change
  const loadIssues = useCallback(() => {
    if (!status?.ghInstalled || !status?.ghAuthenticated || !status?.repoDetected) return;
    setLoading(true);
    setError(null);
    github
      .issues(sessionId, {
        assignee: assigneeFilter || undefined,
        state: stateFilter,
        search: searchQuery || undefined,
      })
      .then((result) => {
        setIssues(result.issues || []);
        if (result.error) setError(result.error);
      })
      .catch((err) => setError(err.message || 'Failed to load issues'))
      .finally(() => setLoading(false));
  }, [sessionId, status, assigneeFilter, stateFilter, searchQuery]);

  useEffect(() => {
    if (status?.repoDetected) loadIssues();
  }, [status?.repoDetected, loadIssues]);

  const handleViewDetail = useCallback(
    async (issueNumber: number) => {
      setDetailLoading(true);
      try {
        const detail = await github.issueDetail(sessionId, issueNumber);
        setSelectedIssue(detail);
      } catch {
        setError(`Failed to load issue #${issueNumber}`);
      } finally {
        setDetailLoading(false);
      }
    },
    [sessionId],
  );

  const handleSendToClaude = useCallback(
    (issue: GitHubIssue) => {
      const text = `Please work on GitHub issue #${issue.number}: ${issue.title}\n\nURL: ${issue.url}`;
      onSendToClaude?.(text);
    },
    [onSendToClaude],
  );

  // Status check screens
  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Checking GitHub CLI...
      </div>
    );
  }

  if (!status.ghInstalled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm p-4 gap-3">
        <p className="font-medium">GitHub CLI not found</p>
        <p className="text-xs text-gray-500 text-center">
          Install the GitHub CLI to view issues:
        </p>
        <code className="text-xs bg-gray-900 px-3 py-1.5 rounded text-green-400">
          brew install gh
        </code>
      </div>
    );
  }

  if (!status.ghAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm p-4 gap-3">
        <p className="font-medium">Not authenticated</p>
        <p className="text-xs text-gray-500 text-center">
          Authenticate with GitHub CLI:
        </p>
        <code className="text-xs bg-gray-900 px-3 py-1.5 rounded text-green-400">
          gh auth login
        </code>
      </div>
    );
  }

  if (!status.repoDetected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm p-4 gap-3">
        <p className="font-medium">No repository detected</p>
        <p className="text-xs text-gray-500 text-center">
          This session's working directory is not inside a GitHub repository.
        </p>
      </div>
    );
  }

  // Issue detail view
  if (selectedIssue) {
    return (
      <div className="flex flex-col h-full text-sm">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 flex-shrink-0">
          <button
            onClick={() => setSelectedIssue(null)}
            className="text-gray-400 hover:text-white text-xs"
          >
            &larr; Back
          </button>
          <span className="text-gray-500">#{selectedIssue.number}</span>
          <span className="truncate font-medium">{selectedIssue.title}</span>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                selectedIssue.state === 'OPEN'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-purple-500/20 text-purple-400'
              }`}
            >
              {selectedIssue.state}
            </span>
            {selectedIssue.labels.map((l) => (
              <span
                key={l.name}
                className="px-1.5 py-0.5 rounded text-xs"
                style={{ backgroundColor: `#${l.color}33`, color: `#${l.color}` }}
              >
                {l.name}
              </span>
            ))}
          </div>
          {selectedIssue.body && (
            <div className="bg-gray-900 rounded p-3 text-xs text-gray-300 whitespace-pre-wrap break-words">
              {selectedIssue.body}
            </div>
          )}
          {selectedIssue.comments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-gray-400 font-medium">
                Comments ({selectedIssue.comments.length})
              </h4>
              {selectedIssue.comments.map((c, i) => (
                <div key={i} className="bg-gray-900 rounded p-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-400">{c.author.login}</span>
                    <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap break-words">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => handleSendToClaude(selectedIssue)}
            className="w-full px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
          >
            Send to Claude
          </button>
        </div>
      </div>
    );
  }

  // Issue list view
  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-700 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {status.repoOwner}/{status.repoName}
          </span>
          <button
            onClick={loadIssues}
            className="text-xs text-gray-500 hover:text-gray-300"
            title="Refresh"
          >
            ↻
          </button>
        </div>
        {/* Filters */}
        <div className="flex gap-1.5">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as 'open' | 'closed' | 'all')}
            className="bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          <input
            type="text"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            placeholder="Assignee (@me)"
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadIssues();
            }}
          />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search issues..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadIssues();
          }}
        />
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            Loading issues...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-xs p-4 text-center">
            {error}
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No issues found
          </div>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.number}
              className="px-3 py-2 border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer group"
              onClick={() => handleViewDetail(issue.number)}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${
                    issue.state === 'OPEN' ? 'bg-green-500' : 'bg-purple-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">#{issue.number}</span>
                    <span className="text-xs font-medium truncate">{issue.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {issue.labels.map((l) => (
                      <span
                        key={l.name}
                        className="px-1 py-0 rounded text-[10px]"
                        style={{
                          backgroundColor: `#${l.color}33`,
                          color: `#${l.color}`,
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                    {issue.assignees.length > 0 && (
                      <span className="text-[10px] text-gray-500">
                        {issue.assignees.map((a) => a.login).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendToClaude(issue);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 px-1.5 py-0.5 rounded hover:bg-blue-500/20"
                  title="Send to Claude"
                >
                  Send
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {detailLoading && (
        <div className="absolute inset-0 bg-gray-800/50 flex items-center justify-center text-xs text-gray-400">
          Loading...
        </div>
      )}
    </div>
  );
}
