import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LivePreview } from './LivePreview';

type ViewportMode = 'desktop' | 'mobile' | 'custom';

interface MobilePreviewSheetProps {
  sessionId: string;
  port: number;
  localPort: number;
  detectedPorts?: Array<{ port: number; localPort: number }>;
  isLocalSession?: boolean;
  onClose: () => void;
}

export function MobilePreviewSheet({
  sessionId,
  port,
  localPort,
  detectedPorts,
  isLocalSession,
  onClose,
}: MobilePreviewSheetProps) {
  const [visible, setVisible] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [customW, setCustomW] = useState(1024);
  const [customH, setCustomH] = useState(768);
  const [selectedDeviceId, setSelectedDeviceId] = useState('iphone-15-pro');
  const [selectedDesktopId, setSelectedDesktopId] = useState('desktop-1080p');

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleCustomViewport = useCallback((w: number, h: number) => {
    setCustomW(w);
    setCustomH(h);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div
        className="flex flex-col flex-1 transition-transform duration-300 ease-out overflow-hidden"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <LivePreview
          sessionId={sessionId}
          port={port}
          localPort={localPort}
          detectedPorts={detectedPorts}
          onClose={handleClose}
          isMobile={false}
          isLocalSession={isLocalSession}
          viewportMode={viewportMode}
          onViewportChange={setViewportMode}
          customViewportWidth={customW}
          customViewportHeight={customH}
          onCustomViewport={handleCustomViewport}
          selectedDeviceId={selectedDeviceId}
          onDevicePresetSelect={setSelectedDeviceId}
          selectedDesktopId={selectedDesktopId}
          onDesktopPresetSelect={setSelectedDesktopId}
        />
      </div>
    </div>,
    document.body,
  );
}
