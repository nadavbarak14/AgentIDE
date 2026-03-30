import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { StreamPreview } from './StreamPreview';
import { useStreamPreview } from '../hooks/useStreamPreview';
import { getPresetById } from '../constants/devicePresets';

interface MobilePreviewSheetProps {
  sessionId: string;
  port?: number;
  localPort?: number;
  detectedPorts?: Array<{ port: number; localPort: number }>;
  isLocalSession?: boolean;
  onClose: () => void;
  /** When false, the preview is hidden (display:none) but stays mounted so the iframe stays alive */
  visible?: boolean;
}

export function MobilePreviewSheet({
  sessionId,
  detectedPorts,
  onClose,
  visible: visibleProp = true,
  // port, localPort, isLocalSession are no longer used — StreamPreview manages its own connection
}: MobilePreviewSheetProps) {
  const [slideIn, setSlideIn] = useState(false);
  const preview = useStreamPreview(sessionId, true);

  // Local viewport state for mobile preview sheet
  const [viewport, setViewport] = useState<'desktop' | 'mobile' | 'custom' | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Slide in on mount, and re-trigger when becoming visible
  useEffect(() => {
    if (visibleProp) {
      requestAnimationFrame(() => setSlideIn(true));
    }
  }, [visibleProp]);

  const handleClose = () => {
    setSlideIn(false);
    setTimeout(onClose, 300);
  };

  const handleViewportChange = useCallback((vp: 'desktop' | 'mobile' | 'custom' | null, deviceId?: string) => {
    setViewport(vp);
    if ((vp === 'mobile' || vp === 'desktop') && deviceId) {
      setSelectedDeviceId(deviceId);
      const preset = getPresetById(deviceId);
      if (preset) {
        const isMobile = preset.category === 'phone' || preset.category === 'tablet';
        preview.sendResize(preset.width, preset.height, isMobile);
      }
    } else if (vp === null) {
      setSelectedDeviceId(null);
      preview.sendResize(1280, 720);
    }
  }, [preview]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900" style={{ display: visibleProp ? 'flex' : 'none' }}>
      <div
        className="flex flex-col flex-1 transition-transform duration-300 ease-out overflow-hidden"
        style={{ transform: slideIn ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <StreamPreview
          sessionId={sessionId}
          status={preview.status}
          frame={preview.frame}
          currentUrl={preview.currentUrl}
          onNavigate={preview.navigate}
          onMouse={preview.sendMouse}
          onKey={preview.sendKey}
          onScroll={preview.sendScroll}
          onTouch={preview.sendTouch}
          onResize={preview.sendResize}
          onClose={handleClose}
          detectedPorts={detectedPorts}
          viewport={viewport}
          selectedDeviceId={selectedDeviceId}
          onViewportChange={handleViewportChange}
        />
      </div>
    </div>,
    document.body,
  );
}
