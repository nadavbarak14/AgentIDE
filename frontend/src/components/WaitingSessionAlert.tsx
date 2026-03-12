import React from 'react';

interface WaitingSessionAlertProps {
  waitingSessions: Array<{ id: string; title: string; waitReason?: string | null }>;
  onSwitch: (id: string) => void;
  bottomOffset?: number;
}

function getWaitLabel(session: { title: string; waitReason?: string | null }): string {
  if (session.waitReason === 'permission') return `${session.title} needs permission`;
  if (session.waitReason === 'question') return `${session.title} has a question`;
  return `${session.title} needs input`;
}

export function WaitingSessionAlert({
  waitingSessions,
  onSwitch,
  bottomOffset,
}: WaitingSessionAlertProps) {
  if (waitingSessions.length === 0) return null;

  const bottom = (bottomOffset ?? 52) + 8;

  const label =
    waitingSessions.length === 1
      ? getWaitLabel(waitingSessions[0])
      : `${waitingSessions.length} sessions waiting`;

  return (
    <button
      type="button"
      onClick={() => onSwitch(waitingSessions[0].id)}
      className="fixed left-1/2 -translate-x-1/2 z-40 max-w-[280px] truncate rounded-full px-4 py-2 bg-amber-500/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm animate-pulse"
      style={{ bottom }}
    >
      {label}
    </button>
  );
}
