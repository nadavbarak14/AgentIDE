import { useState } from 'react';

interface LicenseGateProps {
  onAuthenticated: () => void;
}

export function LicenseGate({ onAuthenticated }: LicenseGateProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Activation failed' }));
        if (res.status === 429) {
          setError(data.error || 'Too many attempts. Please try again later.');
        } else {
          setError(data.error || 'Invalid license key');
        }
        setLoading(false);
        return;
      }

      // Success — cookie is set by the server
      onAuthenticated();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-zinc-100 mb-2">AgentIDE</h1>
            <p className="text-sm text-zinc-400">
              Enter your license key to continue
            </p>
          </div>

          <form onSubmit={handleActivate}>
            <div className="mb-4">
              <label
                htmlFor="license-key"
                className="block text-sm font-medium text-zinc-300 mb-2"
              >
                License Key
              </label>
              <textarea
                id="license-key"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="eyJlbWFpbCI6..."
                rows={3}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-md text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !licenseKey.trim()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
            >
              {loading ? 'Activating...' : 'Activate License'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
