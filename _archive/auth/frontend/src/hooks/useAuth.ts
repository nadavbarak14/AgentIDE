import { useState, useEffect, useCallback } from 'react';

interface AuthState {
  loading: boolean;
  authRequired: boolean;
  authenticated: boolean;
  email: string | null;
  plan: string | null;
  licenseExpiresAt: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authRequired: false,
    authenticated: false,
    email: null,
    plan: null,
    licenseExpiresAt: null,
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
      if (!res.ok) {
        setState((prev) => ({ ...prev, loading: false, authenticated: false }));
        return;
      }
      const data = await res.json();
      setState({
        loading: false,
        authRequired: data.authRequired,
        authenticated: data.authenticated,
        email: data.email,
        plan: data.plan,
        licenseExpiresAt: data.licenseExpiresAt,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    checkAuth();

    // Listen for auth:unauthorized events from API interceptor
    const handleUnauthorized = () => {
      setState((prev) => ({ ...prev, authenticated: false }));
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [checkAuth]);

  return { ...state, recheckAuth: checkAuth };
}
