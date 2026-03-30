import React, { useState, useEffect, useCallback } from 'react';
import { useGithubData } from '../hooks/useGithubData';

interface IssuePanelProps {
  projectId: string;
  mode: 'issues' | 'prs';
  onSelectIssue?: (issueNumber: number) => void;
  onStartAgent?: (issueNumber: number, issueTitle?: string) => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function labelColor(hex: string): { bg: string; text: string } {
  // Convert hex to RGB and determine if it's a light or dark color
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    bg: `#${hex}`,
    text: luminance > 0.5 ? '#000000' : '#ffffff',
  };
}

export function IssuePanel({ projectId, mode, onSelectIssue, onStartAgent }: IssuePanelProps) {
  const {
    issues,
    prs,
    loading,
    error,
    fetchedAt,
    fetchIssues,
    fetchPRs,
  } = useGithubData(projectId);

  const [stateFilter, setStateFilter] = useState<string>('open');
  const [labelFilter, setLabelFilter] = useState('');

  const doFetch = useCallback(
    (refresh?: boolean) => {
      const filters: { state?: string; label?: string } = {};
      if (stateFilter !== 'all') filters.state = stateFilter;
      if (labelFilter.trim()) filters.label = labelFilter.trim();

      if (mode === 'issues') {
        fetchIssues(filters, refresh);
      } else {
        fetchPRs(filters, refresh);
      }
    },
    [mode, stateFilter, labelFilter, fetchIssues, fetchPRs],
  );

  // Fetch on mount and when filters change
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const items = mode === 'issues' ? issues : [];
  const prItems = mode === 'prs' ? prs : [];

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 flex-shrink-0">
        {/* State filter */}
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="open">Open</option>
          <option value="closed">{mode === 'prs' ? 'Closed/Merged' : 'Closed'}</option>
          <option value="all">All</option>
        </select>

        {/* Label filter */}
        <input
          type="text"
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.target.value)}
          placeholder="Filter by label..."
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {/* Refresh */}
        <button
          onClick={() => doFetch(true)}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-white transition disabled:opacity-50"
          title="Refresh"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {/* Last synced */}
      {fetchedAt && (
        <div className="px-3 py-1 text-[10px] text-gray-500 border-b border-gray-700/50 flex-shrink-0">
          Last synced: {timeAgo(fetchedAt)}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 && prItems.length === 0 && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            Loading {mode === 'issues' ? 'issues' : 'pull requests'}...
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && prItems.length === 0 && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            No {mode === 'issues' ? 'issues' : 'pull requests'} found.
          </div>
        )}

        {/* Issues list */}
        {mode === 'issues' &&
          items.map((issue) => (
            <div
              key={issue.number}
              className="flex items-start gap-3 px-3 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition group"
              onClick={() => onSelectIssue?.(issue.number)}
            >
              {/* Issue icon */}
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={issue.state === 'OPEN' ? 'text-green-500' : 'text-purple-400'}
                >
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                  <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">#{issue.number}</span>
                  <span className="text-sm text-white truncate">{issue.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {issue.labels.map((label) => {
                    const colors = labelColor(label.color);
                    return (
                      <span
                        key={label.name}
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {label.name}
                      </span>
                    );
                  })}
                  <span className="text-[10px] text-gray-500">
                    {issue.author.login} opened {timeAgo(issue.createdAt)}
                  </span>
                </div>
              </div>

              {/* Start Agent button */}
              {onStartAgent && (
                <button
                  className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded hover:bg-blue-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartAgent(issue.number, issue.title);
                  }}
                >
                  Start Agent
                </button>
              )}
            </div>
          ))}

        {/* PRs list */}
        {mode === 'prs' &&
          prItems.map((pr) => (
            <div
              key={pr.number}
              className="flex items-start gap-3 px-3 py-2.5 border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition group"
              onClick={() => onSelectIssue?.(pr.number)}
            >
              {/* PR icon */}
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={
                    pr.state === 'MERGED'
                      ? 'text-purple-400'
                      : pr.state === 'OPEN'
                        ? 'text-green-500'
                        : 'text-red-400'
                  }
                >
                  <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">#{pr.number}</span>
                  <span className="text-sm text-white truncate">{pr.title}</span>
                  {pr.isDraft && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-300">Draft</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {pr.labels.map((label) => {
                    const colors = labelColor(label.color);
                    return (
                      <span
                        key={label.name}
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {label.name}
                      </span>
                    );
                  })}
                  <span className="text-[10px] text-gray-500">
                    {pr.author.login} {'\u2022'} {pr.headRefName} {'→'} {pr.baseRefName}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {timeAgo(pr.createdAt)}
                  </span>
                  {pr.reviewDecision && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        pr.reviewDecision === 'APPROVED'
                          ? 'bg-green-500/20 text-green-400'
                          : pr.reviewDecision === 'CHANGES_REQUESTED'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      {pr.reviewDecision === 'APPROVED'
                        ? 'Approved'
                        : pr.reviewDecision === 'CHANGES_REQUESTED'
                          ? 'Changes requested'
                          : pr.reviewDecision}
                    </span>
                  )}
                </div>
              </div>

              {/* Start Agent button */}
              {onStartAgent && (
                <button
                  className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded hover:bg-blue-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartAgent(pr.number);
                  }}
                >
                  Start Agent
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
