import { useState, useCallback } from 'react';

export type MobilePanelName = 'none' | 'hamburger' | 'sessions' | 'preview' | 'files' | 'git' | 'shell' | 'settings' | 'issues' | 'widgets' | 'extensions' | 'extension';

export interface UseMobilePanelReturn {
  activePanel: MobilePanelName;
  open: (panel: MobilePanelName) => void;
  close: () => void;
  toggle: (panel: MobilePanelName) => void;
  isOpen: (panel: MobilePanelName) => boolean;
}

export function useMobilePanel(): UseMobilePanelReturn {
  const [activePanel, setActivePanel] = useState<MobilePanelName>('none');

  const open = useCallback((panel: MobilePanelName) => {
    setActivePanel(panel);
  }, []);

  const close = useCallback(() => {
    setActivePanel('none');
  }, []);

  const toggle = useCallback((panel: MobilePanelName) => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  }, []);

  const isOpen = useCallback((panel: MobilePanelName) => {
    return activePanel === panel;
  }, [activePanel]);

  return { activePanel, open, close, toggle, isOpen };
}
