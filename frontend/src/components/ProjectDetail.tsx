import React, { useState, useEffect, useCallback } from 'react';
import { IssuePanel } from './IssuePanel';
import { IssueDetail } from './IssueDetail';
import { sessions as sessionsApi, projects as projectsApi, type Session, type ProjectTree } from '../services/api';

interface ProjectDetailProps {
  projectId: string;
  project: ProjectTree;
  onBack: () => void;
  onStartAgent?: (projectId: string, issueNumber?: number, issueTitle?: string) => void;
}

type Tab = 'sessions' | 'issues' | 'prs';

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500';
    case 'crashed':
      return 'bg-amber-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
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

export function ProjectDetail({
  projectId,
  project,
  onBack,
  onStartAgent,
}: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('sessions');
  const [projectSessions, setProjectSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);

  // Suggested sessions state (Phase 8)
  const [suggestedSessions, setSuggestedSessions] = useState<Session[]>([]);
  const [suggestedDismissed, setSuggestedDismissed] = useState(false);
  const [associating, setAssociating] = useState(false);

  // Fetch sessions for this project
  const fetchSessions = useCallback(async () => {
    try {
      const allSessions = await sessionsApi.list();
      setProjectSessions(allSessions.filter((s) => s.projectId === projectId));
    } catch {
      // Best-effort
    } finally {
      setSessionsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const doFetch = async () => {
      await fetchSessions();
    };
    if (!cancelled) doFetch();
    const interval = setInterval(fetchSessions, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchSessions]);

  // Auto-associate sessions that match this project's directory (no prompt needed)
  useEffect(() => {
    if (activeTab !== 'sessions' || suggestedDismissed) return;
    let cancelled = false;
    async function autoAssociate() {
      try {
        const data = await projectsApi.suggestedSessions(projectId);
        if (cancelled) return;
        const unassociated = data.sessions.filter(
          (s) => !projectSessions.some((ps) => ps.id === s.id),
        );
        if (unassociated.length > 0) {
          await projectsApi.associateSessions(projectId, unassociated.map(s => s.id));
          if (!cancelled) {
            setSuggestedSessions([]);
            fetchSessions();
          }
        }
      } catch {
        // Best-effort
      }
    }
    autoAssociate();
    return () => { cancelled = true; };
  }, [activeTab, projectId, suggestedDismissed, projectSessions, fetchSessions]);

  const handleSelectIssue = (issueNumber: number) => {
    setSelectedIssueNumber(issueNumber);
  };

  const handleStartAgent = async (issueNumber: number, issueTitle?: string) => {
    // Delegate to parent — it handles session creation
    onStartAgent?.(projectId, issueNumber, issueTitle);
  };

  const handleAssociateAll = async () => {
    setAssociating(true);
    try {
      const sessionIds = suggestedSessions.map((s) => s.id);
      await projectsApi.associateSessions(projectId, sessionIds);
      setSuggestedSessions([]);
      // Refresh sessions to pick up the newly associated ones
      await fetchSessions();
    } catch (err) {
      console.error('Failed to associate sessions:', err);
    } finally {
      setAssociating(false);
    }
  };

  const handleBackFromIssue = () => {
    setSelectedIssueNumber(null);
  };

  // If viewing a single issue detail
  if (selectedIssueNumber !== null) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <IssueDetail
          projectId={projectId}
          issueNumber={selectedIssueNumber}
          onBack={handleBackFromIssue}
        />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sessions', label: 'Sessions' },
    { key: 'issues', label: 'Issues' },
    { key: 'prs', label: 'PRs' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-shrink-0 bg-gray-800/30">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-semibold text-white truncate">{project.displayName}</h2>
        {project.githubRepo && (
          <a
            href={`https://github.com/${project.githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-blue-400 bg-gray-700 px-2 py-0.5 rounded flex-shrink-0 transition"
          >
            {project.githubRepo}
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-gray-700 flex-shrink-0 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'text-white border-blue-500'
                : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            {tab.label}
            {tab.key === 'sessions' && projectSessions.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-500">({projectSessions.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'sessions' && (
          <div className="h-full overflow-y-auto p-4">
            {/* Start new agent button — always visible */}
            {onStartAgent && (
              <button
                onClick={() => onStartAgent(projectId)}
                className="w-full mb-3 py-2 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition"
              >
                + Start New Agent
              </button>
            )}

            {/* Sessions are auto-associated silently — no banner needed */}

            {sessionsLoading && (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                Loading sessions...
              </div>
            )}

            {!sessionsLoading && projectSessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <p className="text-sm mb-3">No sessions for this project yet.</p>
                {onStartAgent && (
                  <button
                    onClick={() => onStartAgent(projectId)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition"
                  >
                    + Start a new agent
                  </button>
                )}
              </div>
            )}

            {!sessionsLoading && projectSessions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {projectSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-gray-800 rounded-lg border border-gray-700 p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(session.status)}`}
                      />
                      <span className="text-sm text-white truncate">
                        {session.title || 'Untitled'}
                      </span>
                      {session.needsInput && (
                        <span className="text-xs text-amber-400 animate-pulse">!</span>
                      )}
                      {session.lock && (
                        <span className="text-xs text-gray-500" title="Pinned">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 9H9V6a3 3 0 1 1 6 0v4z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-1">{session.workingDirectory}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        session.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : session.status === 'crashed'
                            ? 'bg-amber-500/20 text-amber-400'
                            : session.status === 'failed'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-600/30 text-gray-400'
                      }`}>
                        {session.status}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {timeAgo(session.updatedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <IssuePanel
            projectId={projectId}
            mode="issues"
            onSelectIssue={handleSelectIssue}
            onStartAgent={handleStartAgent}
          />
        )}

        {activeTab === 'prs' && (
          <IssuePanel
            projectId={projectId}
            mode="prs"
            onSelectIssue={handleSelectIssue}
            onStartAgent={handleStartAgent}
          />
        )}
      </div>
    </div>
  );
}
