import { useState, useRef, useEffect, useCallback } from 'react';
import type { Settings, Worker } from '../services/api';
import { settings as settingsApi, workers as workersApi } from '../services/api';
import { FilePicker } from './FilePicker';

interface SettingsPanelProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  workers: Worker[];
  onWorkersChange: (workers: Worker[]) => void;
  /** Incrementing counter — each bump opens the panel with the Add Machine form shown. */
  autoOpenAddForm?: number;
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 disabled:hover:bg-gray-600 text-gray-200 text-sm font-medium"
        >
          -
        </button>
        <span className="w-6 text-center text-sm font-medium text-white">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 flex items-center justify-center rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30 disabled:hover:bg-gray-600 text-gray-200 text-sm font-medium"
        >
          +
        </button>
      </div>
    </div>
  );
}

interface WorkerFormData {
  name: string;
  sshHost: string;
  sshUser: string;
  sshKeyPath: string;
  sshPort: number;
  maxSessions: number;
  remoteAgentPort: string;
}

const emptyForm: WorkerFormData = {
  name: '',
  sshHost: '',
  sshUser: '',
  sshKeyPath: '',
  sshPort: 22,
  maxSessions: 2,
  remoteAgentPort: '',
};

export function SettingsPanel({ settings, onSettingsChange, workers, onWorkersChange, autoOpenAddForm }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Machine management state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkerFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; latency_ms: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          setShowForm(false);
          setEditingId(null);
          setFormError(null);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, showForm]);

  // Auto-open to Add Machine form when triggered from WorkerSelector
  useEffect(() => {
    if (autoOpenAddForm && autoOpenAddForm > 0) {
      setOpen(true);
      setForm(emptyForm);
      setEditingId(null);
      setFormError(null);
      setShowForm(true);
    }
  }, [autoOpenAddForm]);

  const updateSetting = useCallback(
    (key: keyof Settings, value: number) => {
      const updated = { ...settings, [key]: value };
      onSettingsChange(updated);
      settingsApi.update({ [key]: value }).catch(() => {});
    },
    [settings, onSettingsChange],
  );

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (w: Worker) => {
    setForm({
      name: w.name,
      sshHost: w.sshHost || '',
      sshUser: w.sshUser || '',
      sshKeyPath: w.sshKeyPath || '',
      sshPort: w.sshPort || 22,
      maxSessions: w.maxSessions,
      remoteAgentPort: w.remoteAgentPort != null ? String(w.remoteAgentPort) : '',
    });
    setEditingId(w.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.sshHost.trim() || !form.sshUser.trim() || !form.sshKeyPath.trim()) {
      setFormError('All fields are required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const agentPort = form.remoteAgentPort ? parseInt(form.remoteAgentPort) : null;
      const updated = await workersApi.update(editingId, {
          name: form.name.trim(),
          sshHost: form.sshHost.trim(),
          sshUser: form.sshUser.trim(),
          sshKeyPath: form.sshKeyPath.trim(),
          sshPort: form.sshPort,
          maxSessions: form.maxSessions,
          remoteAgentPort: agentPort,
        });
        onWorkersChange(workers.map((w) => (w.id === editingId ? updated : w)));
      } else {
        const agentPort = form.remoteAgentPort ? parseInt(form.remoteAgentPort) : null;
        const created = await workersApi.create({
          name: form.name.trim(),
          sshHost: form.sshHost.trim(),
          sshUser: form.sshUser.trim(),
          sshKeyPath: form.sshKeyPath.trim(),
          sshPort: form.sshPort,
          maxSessions: form.maxSessions,
          remoteAgentPort: agentPort,
        });
        onWorkersChange([...workers, created]);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (workerId: string) => {
    setTesting(workerId);
    setTestResult(null);
    try {
      const result = await workersApi.test(workerId);
      setTestResult({ id: workerId, ...result });
    } catch {
      setTestResult({ id: workerId, ok: false, latency_ms: 0 });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (workerId: string) => {
    try {
      await workersApi.delete(workerId);
      onWorkersChange(workers.filter((w) => w.id !== workerId));
      setConfirmDelete(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to remove');
      setConfirmDelete(null);
    }
  };

  const statusDot = (status: Worker['status']) => {
    const colors: Record<string, string> = {
      connected: 'bg-green-500',
      disconnected: 'bg-gray-500',
      error: 'bg-red-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          open
            ? 'bg-gray-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
        title="Settings"
      >
        <svg
          className="w-4.5 h-4.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* ─── General Settings ─── */}
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Settings
          </h3>
          <NumberStepper
            label="Visible grid"
            value={settings.maxVisibleSessions}
            min={1}
            max={8}
            onChange={(v) => updateSetting('maxVisibleSessions', v)}
          />

          {/* ─── Machines Section ─── */}
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Machines
            </h3>

            {/* Error message */}
            {formError && !showForm && (
              <div className="text-xs text-red-400 mb-2">{formError}</div>
            )}

            {/* Worker list */}
            <div className="space-y-1">
              {workers.map((w) => (
                <div key={w.id} className="group">
                  {confirmDelete === w.id ? (
                    <div className="p-2 bg-red-900/20 border border-red-800/30 rounded text-xs">
                      <p className="text-gray-300 mb-1.5">
                        Remove <span className="font-medium text-white">{w.name}</span>?
                        {(w.activeSessionCount ?? 0) > 0 && (
                          <span className="text-amber-400"> ({w.activeSessionCount} active sessions)</span>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-0.5 text-gray-400 hover:text-gray-200 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(w.status)}`} />
                      <span className="text-sm text-gray-200 truncate flex-1">{w.name}</span>
                      <span className="text-[10px] text-gray-500">
                        {w.type === 'remote' ? w.sshHost : 'localhost'}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {w.activeSessionCount ?? 0}/{w.maxSessions}
                      </span>

                      {/* Test result indicator */}
                      {testing === w.id && (
                        <span className="w-3 h-3 border border-gray-500 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                      )}
                      {testResult?.id === w.id && testing !== w.id && (
                        <span className={`text-[10px] flex-shrink-0 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                          {testResult.ok ? `${testResult.latency_ms}ms` : 'fail'}
                        </span>
                      )}

                      {/* Action buttons (remote only) */}
                      {w.type === 'remote' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => handleTest(w.id)}
                            disabled={testing === w.id}
                            className="px-1 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/20 rounded"
                            title="Test connection"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => openEditForm(w)}
                            className="px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-600 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setConfirmDelete(w.id)}
                            className="px-1 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20 rounded"
                          >
                            Del
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add/Edit Machine Form */}
            {showForm ? (
              <div className="mt-2 p-2 bg-gray-900 border border-gray-600 rounded space-y-2">
                <h4 className="text-xs font-medium text-gray-300">
                  {editingId ? 'Edit Machine' : 'Add Machine'}
                </h4>
                <input
                  type="text"
                  placeholder="Name (e.g., gpu-server)"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="SSH Host (e.g., 192.168.1.100)"
                  value={form.sshHost}
                  onChange={(e) => setForm((f) => ({ ...f, sshHost: e.target.value }))}
                  className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="SSH User"
                    value={form.sshUser}
                    onChange={(e) => setForm((f) => ({ ...f, sshUser: e.target.value }))}
                    className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Port"
                    value={form.sshPort}
                    onChange={(e) => setForm((f) => ({ ...f, sshPort: parseInt(e.target.value) || 22 }))}
                    className="w-16 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <FilePicker
                  value={form.sshKeyPath}
                  onChange={(v) => setForm((f) => ({ ...f, sshKeyPath: v }))}
                  placeholder="SSH Key Path (e.g., ~/.ssh/id_rsa)"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Max sessions:</span>
                  <input
                    type="number"
                    value={form.maxSessions}
                    min={1}
                    max={20}
                    onChange={(e) => setForm((f) => ({ ...f, maxSessions: parseInt(e.target.value) || 2 }))}
                    className="w-14 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Agent port:</span>
                  <input
                    type="number"
                    placeholder="e.g. 4100"
                    value={form.remoteAgentPort}
                    onChange={(e) => setForm((f) => ({ ...f, remoteAgentPort: e.target.value }))}
                    className="w-20 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500">enables file tree &amp; git</span>
                </div>
                {formError && (
                  <div className="text-xs text-red-400">{formError}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                  >
                    {saving ? 'Saving...' : editingId ? 'Save' : 'Add Machine'}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setEditingId(null); setFormError(null); }}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={openAddForm}
                className="mt-2 w-full text-xs text-gray-400 hover:text-gray-300 py-1.5 text-center border border-dashed border-gray-600 rounded hover:border-gray-500"
              >
                + Add Machine
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
