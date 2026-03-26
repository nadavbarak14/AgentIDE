import React, { useEffect } from 'react';
import { useGithubData } from '../hooks/useGithubData';

interface IssueDetailProps {
  projectId: string;
  issueNumber: number;
  onBack: () => void;
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
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    bg: `#${hex}`,
    text: luminance > 0.5 ? '#000000' : '#ffffff',
  };
}

/** Render text with basic line breaks (preserves paragraphs). */
function renderBody(text: string) {
  if (!text) return <p className="text-gray-500 italic">No description provided.</p>;
  return text.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
}

export function IssueDetail({ projectId, issueNumber, onBack }: IssueDetailProps) {
  const { issueDetail, loading, error, fetchIssueDetail, clearDetail } = useGithubData(projectId);

  useEffect(() => {
    fetchIssueDetail(issueNumber);
    return () => {
      clearDetail();
    };
  }, [issueNumber, fetchIssueDetail, clearDetail]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        {issueDetail && (
          <span className="text-sm text-gray-300 truncate">
            <span className="text-gray-500">#{issueDetail.number}</span>{' '}
            {issueDetail.title}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && !issueDetail && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            Loading issue...
          </div>
        )}

        {error && (
          <div className="px-4 py-4 text-sm text-red-400">{error}</div>
        )}

        {issueDetail && (
          <div className="px-4 py-4 space-y-4">
            {/* Title */}
            <h2 className="text-lg font-semibold text-white">
              {issueDetail.title}{' '}
              <span className="text-gray-500 font-normal">#{issueDetail.number}</span>
            </h2>

            {/* Metadata row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* State badge */}
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  issueDetail.state === 'OPEN'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                }`}
              >
                {issueDetail.state === 'OPEN' ? 'Open' : 'Closed'}
              </span>

              {/* Author */}
              <span className="text-xs text-gray-400">
                by <span className="text-gray-300">{issueDetail.author.login}</span>
              </span>

              {/* Created time */}
              <span className="text-xs text-gray-500">{timeAgo(issueDetail.createdAt)}</span>

              {/* Assignees */}
              {issueDetail.assignees.length > 0 && (
                <span className="text-xs text-gray-400">
                  Assigned to:{' '}
                  {issueDetail.assignees.map((a) => a.login).join(', ')}
                </span>
              )}
            </div>

            {/* Labels */}
            {issueDetail.labels.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {issueDetail.labels.map((label) => {
                  const colors = labelColor(label.color);
                  return (
                    <span
                      key={label.name}
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {label.name}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Body */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
              <div className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                {renderBody(issueDetail.body)}
              </div>
            </div>

            {/* Comments */}
            {issueDetail.comments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">
                  Comments ({issueDetail.comments.length})
                </h3>
                {issueDetail.comments.map((comment, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-900/30 rounded-lg p-3 border border-gray-700/50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-300">
                        {comment.author.login}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {timeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
                      {renderBody(comment.body)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {issueDetail.comments.length === 0 && (
              <p className="text-xs text-gray-500">No comments.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
