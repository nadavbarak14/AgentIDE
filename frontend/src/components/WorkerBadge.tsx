import type { Worker } from '../services/api';

interface WorkerBadgeProps {
  workerId: string | null;
  workers: Worker[];
}

export function WorkerBadge({ workerId, workers }: WorkerBadgeProps) {
  // Always show badge (FR-026) — fall back to single worker if no workerId
  const worker = workerId
    ? workers.find((w) => w.id === workerId)
    : workers.length === 1 ? workers[0] : null;
  if (!worker) return null;

  const isLocal = worker.type === 'local';

  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
        isLocal
          ? 'bg-gray-700/50 text-gray-500'
          : 'bg-gray-700 text-gray-300'
      }`}
      title={`Running on ${worker.name} (${worker.type})`}
    >
      {worker.name}
    </span>
  );
}
