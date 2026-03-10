import React from 'react';

interface WaitingSessionAlertProps {
  waitingSessions: Array<{ id: string; title: string }>;
  onSwitch: (id: string) => void;
  bottomOffset?: number;
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
      ? `${waitingSessions[0].title} needs input`
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
