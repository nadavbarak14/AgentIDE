import { useState, useEffect } from 'react';
import { WorkerList } from '../components/WorkerList';
import { settings as settingsApi, type Settings } from '../services/api';

export function Settings() {
  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.get().then(setAppSettings).catch(() => {});
  }, []);

  const handleChange = async (key: keyof Settings, value: unknown) => {
    if (!appSettings) return;
    setSaving(true);
    try {
      const updated = await settingsApi.update({ [key]: value });
      setAppSettings(updated);
    } catch {} finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <a href="/" className="text-sm text-blue-400 hover:underline">Back to Dashboard</a>
        </div>

        {appSettings && (
          <div className="space-y-4 mb-8">
            <h2 className="text-lg font-semibold">Dashboard</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-400">Max Concurrent Sessions</span>
                <input type="number" min="1" max="20" value={appSettings.maxConcurrentSessions}
                  onChange={(e) => handleChange('maxConcurrentSessions', parseInt(e.target.value))}
                  className="mt-1 w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-400">Max Visible Sessions (Focus)</span>
                <input type="number" min="1" max="6" value={appSettings.maxVisibleSessions}
                  onChange={(e) => handleChange('maxVisibleSessions', parseInt(e.target.value))}
                  className="mt-1 w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-400">Theme</span>
                <select value={appSettings.theme} onChange={(e) => handleChange('theme', e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" checked={appSettings.autoApprove}
                  onChange={(e) => handleChange('autoApprove', e.target.checked)}
                  className="rounded" />
                <span className="text-sm text-gray-400">Auto-Approve Prompts</span>
              </label>
            </div>
            {saving && <p className="text-xs text-gray-500">Saving...</p>}
          </div>
        )}

        <WorkerList />
      </div>
    </div>
  );
}
