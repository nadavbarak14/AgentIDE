import { useState, useEffect, useCallback, useMemo } from 'react';
import type { LoadedExtension } from '../services/extension-types';
import { loadExtensions } from '../services/extension-loader';

export function useExtensions() {
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadExtensions().then((exts) => {
      if (!cancelled) {
        setExtensions(exts);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
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

  return { extensions, extensionsWithPanel, getExtension, loading, refresh };
}
