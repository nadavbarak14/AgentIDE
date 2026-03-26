import { useState, useCallback } from 'react';
import { projects as projectsApi, type GitHubIssue, type GitHubIssueDetail, type GitHubPR } from '../services/api';

export function useGithubData(projectId: string | null) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [issueDetail, setIssueDetail] = useState<GitHubIssueDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const fetchIssues = useCallback(async (filters?: { state?: string; label?: string; assignee?: string }, refresh?: boolean) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.issues(projectId, { ...filters, refresh });
      setIssues(data.issues);
      setFetchedAt(data.fetchedAt);
      setCached(data.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchPRs = useCallback(async (filters?: { state?: string; label?: string }, refresh?: boolean) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.prs(projectId, { ...filters, refresh });
      setPrs(data.prs);
      setFetchedAt(data.fetchedAt);
      setCached(data.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PRs');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchIssueDetail = useCallback(async (issueNumber: number) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.issueDetail(projectId, issueNumber);
      setIssueDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const clearDetail = useCallback(() => setIssueDetail(null), []);

  return {
    issues,
    prs,
    issueDetail,
    loading,
    error,
    fetchedAt,
    cached,
    fetchIssues,
    fetchPRs,
    fetchIssueDetail,
    clearDetail,
  };
}
