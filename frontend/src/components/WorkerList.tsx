import { useState, useEffect } from 'react';
import { workers as workersApi, type Worker } from '../services/api';

const INPUT_CLS = 'w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white placeholder-gray-500';
const STATUS_COLORS: Record<string, string> = { connected: 'bg-green-500', disconnected: 'bg-gray-500', error: 'bg-red-500' };

const EMPTY_FORM = { name: '', sshHost: '', sshUser: '', sshKeyPath: '', sshPort: '22', remoteAgentPort: '' };

export function WorkerList() {
  const [workerList, setWorkerList] = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<typeof EMPTY_FORM>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workersApi.list().then(setWorkerList).catch(() => {});
  }, []);

  const refresh = () => workersApi.list().then(setWorkerList).catch(() => {});

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const worker = await workersApi.create({
        name: form.name,
        sshHost: form.sshHost,
        sshUser: form.sshUser,
        sshKeyPath: form.sshKeyPath,
        sshPort: parseInt(form.sshPort) || 22,
        remoteAgentPort: form.remoteAgentPort ? parseInt(form.remoteAgentPort) : null,
      });
      setWorkerList((prev) => [...prev, worker]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add worker');
    }
  };

  const handleEdit = (worker: Worker) => {
    setEditingId(worker.id);
    setEditForm({
      name: worker.name,
      sshHost: worker.sshHost ?? '',
      sshUser: worker.sshUser ?? '',
      sshKeyPath: worker.sshKeyPath ?? '',
      sshPort: String(worker.sshPort ?? 22),
      remoteAgentPort: worker.remoteAgentPort != null ? String(worker.remoteAgentPort) : '',
    });
  };

  const handleSaveEdit = async (id: string) => {
    setError(null);
    try {
      const updated = await workersApi.update(id, {
        name: editForm.name,
        sshHost: editForm.sshHost,
        sshUser: editForm.sshUser,
        sshKeyPath: editForm.sshKeyPath,
        sshPort: editForm.sshPort ? parseInt(editForm.sshPort) : undefined,
        remoteAgentPort: editForm.remoteAgentPort ? parseInt(editForm.remoteAgentPort) : null,
      });
      setWorkerList((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult((prev) => ({ ...prev, [id]: '' }));
    try {
      const result = await workersApi.test(id);
      if (result.ok && result.claudeAvailable) {
        setTestResult((prev) => ({ ...prev, [id]: `✓ SSH + Claude OK (${result.latency_ms}ms)` }));
      } else if (result.ok === false && result.claudeAvailable === false) {
        setTestResult((prev) => ({ ...prev, [id]: '⚠ SSH OK, Claude CLI missing!' }));
      } else {
        setTestResult((prev) => ({ ...prev, [id]: `OK (${result.latency_ms}ms)` }));
      }
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setTestResult((prev) => ({ ...prev, [id]: `✗ ${message}` }));
      refresh();
    } finally {
      setTesting(null);
    }
  };

  const handleConnect = async (id: string) => {
    setConnecting(id);
    try {
      await workersApi.connect(id);
      await refresh();
      setTestResult((prev) => ({ ...prev, [id]: 'Connected' }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: 'Connection failed' }));
    } finally {
      setConnecting(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workersApi.delete(id);
      setWorkerList((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Workers</h3>
        <button onClick={() => { setShowForm(!showForm); setError(null); }} className="px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-700">
          {showForm ? 'Cancel' : 'Add Worker'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 px-1">{error}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLS} required />
          <input placeholder="SSH Host" value={form.sshHost} onChange={(e) => setForm({ ...form, sshHost: e.target.value })} className={INPUT_CLS} required />
          <input placeholder="SSH User" value={form.sshUser} onChange={(e) => setForm({ ...form, sshUser: e.target.value })} className={INPUT_CLS} required />
          <input placeholder="SSH Key Path (e.g. ~/.ssh/id_ed25519)" value={form.sshKeyPath} onChange={(e) => setForm({ ...form, sshKeyPath: e.target.value })} className={INPUT_CLS} required />
          <div className="flex gap-2">
            <input placeholder="SSH Port" value={form.sshPort} onChange={(e) => setForm({ ...form, sshPort: e.target.value })} className="w-24 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
            <input placeholder="Agent Port (optional)" value={form.remoteAgentPort} onChange={(e) => setForm({ ...form, remoteAgentPort: e.target.value })} className="flex-1 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
          </div>
          <p className="text-xs text-gray-500">Agent Port: port where the remote-agent is listening on the SSH server (enables file tree, git diff, search)</p>
          <button type="submit" className="w-full px-3 py-1.5 text-sm bg-green-600 rounded hover:bg-green-700">Save Worker</button>
        </form>
      )}

      {workerList.map((worker) => (
        <div key={worker.id} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
          {editingId === worker.id ? (
            <div className="space-y-2">
              <input value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className={INPUT_CLS} />
              <input value={editForm.sshHost ?? ''} onChange={(e) => setEditForm({ ...editForm, sshHost: e.target.value })} placeholder="SSH Host" className={INPUT_CLS} />
              <input value={editForm.sshUser ?? ''} onChange={(e) => setEditForm({ ...editForm, sshUser: e.target.value })} placeholder="SSH User" className={INPUT_CLS} />
              <input value={editForm.sshKeyPath ?? ''} onChange={(e) => setEditForm({ ...editForm, sshKeyPath: e.target.value })} placeholder="SSH Key Path" className={INPUT_CLS} />
              <div className="flex gap-2">
                <input value={editForm.sshPort ?? ''} onChange={(e) => setEditForm({ ...editForm, sshPort: e.target.value })} placeholder="SSH Port" className="w-24 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
                <input value={editForm.remoteAgentPort ?? ''} onChange={(e) => setEditForm({ ...editForm, remoteAgentPort: e.target.value })} placeholder="Agent Port" className="flex-1 px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-white" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleSaveEdit(worker.id)} className="flex-1 px-2 py-1 text-xs bg-green-600 rounded hover:bg-green-700">Save</button>
                <button onClick={() => setEditingId(null)} className="flex-1 px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[worker.status] || 'bg-gray-500'}`} />
                  <span className="font-medium">{worker.name}</span>
                  <span className="text-xs text-gray-400">{worker.type}</span>
                  {worker.remoteAgentPort && (
                    <span className="text-xs text-purple-400">agent:{worker.remoteAgentPort}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {worker.type === 'remote' && worker.status === 'disconnected' && (
                    <button onClick={() => handleConnect(worker.id)} disabled={connecting === worker.id} className="px-1.5 py-0.5 text-xs text-green-400 hover:bg-green-500/20 rounded">
                      {connecting === worker.id ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                  {worker.type === 'remote' && (
                    <button onClick={() => handleTest(worker.id)} disabled={testing === worker.id} className="px-1.5 py-0.5 text-xs text-blue-400 hover:bg-blue-500/20 rounded">
                      {testing === worker.id
                        ? (worker.status === 'connected' ? 'Testing...' : 'Connecting...')
                        : (worker.status === 'connected' ? 'Test' : 'Reconnect')}
                    </button>
                  )}
                  {worker.type === 'remote' && (
                    <button onClick={() => handleEdit(worker)} className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-500/20 rounded">Edit</button>
                  )}
                  {worker.type === 'remote' && (
                    <button onClick={() => handleDelete(worker.id)} className="px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/20 rounded">Delete</button>
                  )}
                </div>
              </div>
              {worker.sshHost && <p className="text-xs text-gray-500 mt-1">{worker.sshUser}@{worker.sshHost}:{worker.sshPort}</p>}
              {testResult[worker.id] && (
                <p className={`text-xs mt-1 ${testResult[worker.id].startsWith('✓') || testResult[worker.id].startsWith('OK') ? 'text-green-400' : testResult[worker.id].startsWith('⚠') ? 'text-yellow-400' : 'text-red-400'}`}>
                  {testResult[worker.id]}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
