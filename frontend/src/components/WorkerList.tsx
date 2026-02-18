import { useState, useEffect } from 'react';
import { workers as workersApi, type Worker } from '../services/api';

export function WorkerList() {
  const [workerList, setWorkerList] = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sshHost: '', sshUser: '', sshKeyPath: '', sshPort: '22', maxSessions: '2' });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  useEffect(() => {
    workersApi.list().then(setWorkerList).catch(() => {});
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const worker = await workersApi.create({
        name: form.name, sshHost: form.sshHost, sshUser: form.sshUser,
        sshKeyPath: form.sshKeyPath, sshPort: parseInt(form.sshPort),
        maxSessions: parseInt(form.maxSessions),
      });
      setWorkerList((prev) => [...prev, worker]);
      setShowForm(false);
      setForm({ name: '', sshHost: '', sshUser: '', sshKeyPath: '', sshPort: '22', maxSessions: '2' });
    } catch { /* ignore */ }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await workersApi.test(id);
      setTestResult((prev) => ({ ...prev, [id]: `OK (${result.latency_ms}ms)` }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: 'Failed' }));
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workersApi.delete(id);
      setWorkerList((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ }
  };

  const STATUS_COLORS: Record<string, string> = { connected: 'bg-green-500', disconnected: 'bg-gray-500', error: 'bg-red-500' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Workers</h3>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : 'Add Worker'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          <input placeholder="SSH Host" value={form.sshHost} onChange={(e) => setForm({ ...form, sshHost: e.target.value })} className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          <input placeholder="SSH User" value={form.sshUser} onChange={(e) => setForm({ ...form, sshUser: e.target.value })} className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          <input placeholder="SSH Key Path" value={form.sshKeyPath} onChange={(e) => setForm({ ...form, sshKeyPath: e.target.value })} className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          <div className="flex gap-2">
            <input placeholder="Port" value={form.sshPort} onChange={(e) => setForm({ ...form, sshPort: e.target.value })} className="w-20 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
            <input placeholder="Max Sessions" value={form.maxSessions} onChange={(e) => setForm({ ...form, maxSessions: e.target.value })} className="w-24 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          </div>
          <button type="submit" className="w-full px-3 py-1.5 text-sm bg-green-600 rounded hover:bg-green-700">Save Worker</button>
        </form>
      )}

      {workerList.map((worker) => (
        <div key={worker.id} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[worker.status] || 'bg-gray-500'}`} />
              <span className="font-medium">{worker.name}</span>
              <span className="text-xs text-gray-400">{worker.type}</span>
            </div>
            <div className="flex items-center gap-1">
              {worker.type === 'remote' && (
                <button onClick={() => handleTest(worker.id)} disabled={testing === worker.id} className="px-1.5 py-0.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded">
                  {testing === worker.id ? 'Testing...' : 'Test'}
                </button>
              )}
              {worker.type === 'remote' && (
                <button onClick={() => handleDelete(worker.id)} className="px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/20 rounded">Delete</button>
              )}
            </div>
          </div>
          {worker.sshHost && <p className="text-xs text-gray-500 mt-1">{worker.sshUser}@{worker.sshHost}:{worker.sshPort}</p>}
          <p className="text-xs text-gray-500">Sessions: {worker.activeSessionCount ?? 0}/{worker.maxSessions}</p>
          {testResult[worker.id] && <p className="text-xs text-gray-400 mt-1">Test: {testResult[worker.id]}</p>}
        </div>
      ))}
    </div>
  );
}
