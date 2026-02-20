import { useState, useEffect, useCallback } from 'react';
import { sessions as sessionsApi, type Session } from '../services/api';

export function useSessionQueue(pollInterval = 2000) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await sessionsApi.list();
      setSessions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, pollInterval);
    return () => clearInterval(interval);
  }, [fetchSessions, pollInterval]);

  const createSession = useCallback(
    async (workingDirectory: string, title: string, targetWorker?: string | null, startFresh?: boolean, worktree?: boolean) => {
      const session = await sessionsApi.create({ workingDirectory, title, targetWorker, startFresh, worktree });
      // If continued an existing session, update it in place; otherwise append
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === session.id);
        if (exists) return prev.map((s) => (s.id === session.id ? session : s));
        return [...prev, session];
      });
      return session;
    },
    [],
  );

  const deleteSession = useCallback(async (id: string) => {
    await sessionsApi.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reorderSession = useCallback(async (id: string, position: number) => {
    const updated = await sessionsApi.update(id, { position });
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const continueSession = useCallback(async (id: string) => {
    const result = await sessionsApi.continue(id);
    // Refresh session list to pick up status change
    await fetchSessions();
    return result;
  }, [fetchSessions]);

  const killSession = useCallback(async (id: string) => {
    return sessionsApi.kill(id);
  }, []);

  const toggleLock = useCallback(async (id: string, lock: boolean) => {
    const updated = await sessionsApi.update(id, { lock });
    setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  return {
    sessions,
    loading,
    error,
    createSession,
    deleteSession,
    reorderSession,
    continueSession,
    killSession,
    toggleLock,
    refresh: fetchSessions,
  };
}
