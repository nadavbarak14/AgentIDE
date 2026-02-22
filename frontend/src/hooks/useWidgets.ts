import { useState, useCallback, useMemo } from 'react';

export interface WidgetData {
  name: string;
  html: string;
  createdAt: number;
}

export function useWidgets() {
  const [widgetMap, setWidgetMap] = useState<Map<string, WidgetData>>(new Map());
  const [activeWidgetName, setActiveWidgetName] = useState<string | null>(null);

  const addWidget = useCallback((name: string, html: string) => {
    setWidgetMap(prev => {
      const next = new Map(prev);
      next.set(name, { name, html, createdAt: Date.now() });
      return next;
    });
    // Auto-activate newly added/replaced widget
    setActiveWidgetName(name);
  }, []);

  const removeWidget = useCallback((name: string) => {
    setWidgetMap(prev => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
    setActiveWidgetName(prev => {
      if (prev !== name) return prev;
      // Switching away from dismissed widget — pick the most recently created remaining
      // We need to read the map after removal, so use a setter callback
      return null; // Will be resolved in the effect below
    });
  }, []);

  // Resolve null active widget to the most recent remaining widget
  const widgets = useMemo(() => Array.from(widgetMap.values()), [widgetMap]);

  const activeWidget = useMemo(() => {
    if (activeWidgetName && widgetMap.has(activeWidgetName)) {
      return widgetMap.get(activeWidgetName) ?? null;
    }
    // If active is null or stale, pick the most recently created
    if (widgets.length > 0) {
      const sorted = [...widgets].sort((a, b) => b.createdAt - a.createdAt);
      return sorted[0];
    }
    return null;
  }, [activeWidgetName, widgetMap, widgets]);

  const setActiveWidget = useCallback((name: string) => {
    if (widgetMap.has(name)) {
      setActiveWidgetName(name);
    }
  }, [widgetMap]);

  return {
    widgets,
    activeWidget,
    addWidget,
    removeWidget,
    setActiveWidget,
    widgetCount: widgets.length,
  };
}
