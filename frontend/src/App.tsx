import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { LicenseGate } from './pages/LicenseGate';
import { useAuth } from './hooks/useAuth';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, authRequired, authenticated, recheckAuth } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (authRequired && !authenticated) {
    return <LicenseGate onAuthenticated={recheckAuth} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
