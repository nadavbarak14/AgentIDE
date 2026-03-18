import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { StreamPreview } from './StreamPreview';
import { useStreamPreview } from '../hooks/useStreamPreview';

interface MobilePreviewSheetProps {
  sessionId: string;
  port?: number;
  localPort?: number;
  detectedPorts?: Array<{ port: number; localPort: number }>;
  isLocalSession?: boolean;
  onClose: () => void;
}

export function MobilePreviewSheet({
  sessionId,
  detectedPorts,
  onClose,
  // port, localPort, isLocalSession are no longer used — StreamPreview manages its own connection
}: MobilePreviewSheetProps) {
  const [visible, setVisible] = useState(false);
  const preview = useStreamPreview(sessionId, true);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div
        className="flex flex-col flex-1 transition-transform duration-300 ease-out overflow-hidden"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
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
        />
      </div>
    </div>,
    document.body,
  );
}
