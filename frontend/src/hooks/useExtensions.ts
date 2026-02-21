import { useState, useEffect, useCallback, useMemo } from 'react';
import type { LoadedExtension } from '../services/extension-types';
import { loadExtensions } from '../services/extension-loader';

export function useExtensions() {
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    console.log('[useExtensions] Loading extensions...');
    loadExtensions().then((exts) => {
      console.log('[useExtensions] Loaded', exts.length, 'extensions:', exts.map(e => e.name));
      if (!cancelled) {
        setExtensions(exts);
        setLoading(false);
      }
    }).catch((err) => {
      console.warn('[useExtensions] Load failed:', err);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const getExtension = useCallback(
    (name: string): LoadedExtension | undefined =>
      extensions.find((e) => e.name === name),
    [extensions],
  );

  const extensionsWithPanel = useMemo(
    () => extensions.filter((e) => e.panelUrl !== null),
    [extensions],
  );

  return { extensions, extensionsWithPanel, getExtension, loading };
}
