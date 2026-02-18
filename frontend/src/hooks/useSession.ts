import { useMemo } from 'react';
import type { Session } from '../services/api';

export function useSession(sessions: Session[]) {
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === 'active'),
    [sessions],
  );

  const queuedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'queued').sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [sessions],
  );

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions],
  );

  const failedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'failed'),
    [sessions],
  );

  // Priority order for display rebuilds: pinned sessions first, then needsInput.
  // Order: pinned+needsInput > needsInput > pinned > autonomous.
  // This is used by Dashboard to populate displayedIds on rebuild triggers only —
  // NOT on every poll (the display is frozen between triggers).
  const focusSessions = useMemo(() => {
    const pinnedNeedsInput = activeSessions.filter((s) => s.lock && s.needsInput);
    const needsInput = activeSessions.filter((s) => !s.lock && s.needsInput);
    const pinnedAutonomous = activeSessions.filter((s) => s.lock && !s.needsInput);
    const autonomous = activeSessions.filter((s) => !s.lock && !s.needsInput);
    return [...pinnedNeedsInput, ...needsInput, ...pinnedAutonomous, ...autonomous];
  }, [activeSessions]);

  return {
    activeSessions,
    queuedSessions,
    completedSessions,
    failedSessions,
    focusSessions,
    totalCount: sessions.length,
    activeCount: activeSessions.length,
    queuedCount: queuedSessions.length,
  };
}
