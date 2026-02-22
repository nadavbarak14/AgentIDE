import type { Worker } from '../services/api';

interface WorkerSelectorProps {
  workers: Worker[];
  selectedWorkerId: string | null;
  onChange: (workerId: string | null) => void;
  onRequestAddMachine?: () => void;
}

export function WorkerSelector({ workers, selectedWorkerId, onChange, onRequestAddMachine }: WorkerSelectorProps) {
  if (workers.length === 0) return null;

  return (
    <div className="space-y-1">
      {/* Single worker — read-only label + add link */}
      {workers.length === 1 && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-gray-400">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${workers[0].status === 'connected' ? 'bg-green-500' : workers[0].status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
          <span className="truncate">{workers[0].name}</span>
          <span className="text-gray-500 text-xs">({workers[0].type === 'remote' ? workers[0].sshHost : 'localhost'})</span>
          {onRequestAddMachine && (
            <button
              type="button"
              onClick={onRequestAddMachine}
              className="ml-auto text-[10px] text-blue-400 hover:text-blue-300 flex-shrink-0"
            >
              + Add
            </button>
          )}
        </div>
      )}

      {/* Multiple workers — dropdown + add link */}
      {workers.length > 1 && (
        <div className="flex items-center gap-1">
          <select
            value={selectedWorkerId || ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="flex-1 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select machine...</option>
            {workers.map((w) => (
              <option
                key={w.id}
                value={w.id}
                disabled={w.status !== 'connected'}
              >
                {w.status === 'connected' ? '\u25CF' : '\u25CB'}{' '}
                {w.name} ({w.type})
              </option>
            ))}
          </select>
          {onRequestAddMachine && (
            <button
              type="button"
              onClick={onRequestAddMachine}
              className="px-1.5 py-1.5 text-[10px] text-blue-400 hover:text-blue-300 flex-shrink-0"
              title="Add machine (opens Settings)"
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline status indicator for use outside <select> */
export function WorkerStatusDot({ status }: { status: Worker['status'] }) {
  const colors: Record<string, string> = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-gray-500'}`} />
  );
}
