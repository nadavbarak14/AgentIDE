import { useState, useEffect, useRef } from 'react';
import { workers as workersApi, type Worker } from '../services/api';

interface WorkerHealthProps {
  workers: Worker[];
}

export function WorkerHealth({ workers }: WorkerHealthProps) {
  const [workerList, setWorkerList] = useState<Worker[]>(workers);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Update from parent prop
  useEffect(() => {
    setWorkerList(workers);
  }, [workers]);

  // Poll workers every 10 seconds
  useEffect(() => {
    pollRef.current = setInterval(() => {
      workersApi.list()
        .then(setWorkerList)
        .catch(() => { /* ignore */ });
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Hidden when only one local worker
  if (workerList.length <= 1 && workerList[0]?.type === 'local') {
    return null;
  }

  const statusColor = (status: Worker['status']) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'disconnected': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {workerList.map((w) => (
        <button
          key={w.id}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors relative"
          onClick={() => setTooltip(tooltip === w.id ? null : w.id)}
          title={`${w.name}: ${w.status}`}
        >
          <span className={`w-2 h-2 rounded-full ${statusColor(w.status)} ${w.status === 'error' ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{w.name}</span>

          {/* Tooltip popover */}
          {tooltip === w.id && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded shadow-lg p-2 min-w-[160px] text-left">
              <p className="text-gray-200 font-medium">{w.name}</p>
              <p className="text-gray-400 text-[10px]">{w.type === 'remote' ? w.sshHost : 'localhost'}</p>
              <div className="mt-1 pt-1 border-t border-gray-700 space-y-0.5">
                <p className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className={w.status === 'connected' ? 'text-green-400' : w.status === 'error' ? 'text-red-400' : 'text-gray-400'}>
                    {w.status}
                  </span>
                </p>
                {w.lastHeartbeat && (
                  <p className="flex justify-between">
                    <span className="text-gray-500">Last seen</span>
                    <span className="text-gray-400">{new Date(w.lastHeartbeat).toLocaleTimeString()}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
