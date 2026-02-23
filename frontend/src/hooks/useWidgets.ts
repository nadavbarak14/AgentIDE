import { useState, useCallback } from 'react';

export interface WidgetData {
  name: string;
  html: string;
  createdAt: number;
}

/**
 * Manages a single canvas — Claude's UI surface.
 * There is only ever one canvas at a time.
 */
export function useWidgets() {
  const [canvas, setCanvas] = useState<WidgetData | null>(null);

  const addWidget = useCallback((_name: string, html: string) => {
    // Name is ignored — there's only one canvas. We store it for API compat.
    setCanvas({ name: _name, html, createdAt: Date.now() });
  }, []);

  const removeWidget = useCallback((_name: string) => {
    setCanvas(null);
  }, []);

  return {
    widgets: canvas ? [canvas] : [],
    activeWidget: canvas,
    addWidget,
    removeWidget,
    setActiveWidget: () => {},
    widgetCount: canvas ? 1 : 0,
  };
}
