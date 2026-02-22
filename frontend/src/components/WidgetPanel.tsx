import { useRef, useCallback, useEffect, useMemo } from 'react';
import type { WidgetData } from '../hooks/useWidgets';

// Bridge SDK inlined so it works inside sandbox="allow-scripts" (no external fetches allowed)
const BRIDGE_SDK = `<script>(function(){'use strict';var C3={};C3._name=null;C3._sessionId=null;C3._requestHandler=null;C3.sendResult=function(data){window.parent.postMessage({type:'widget-result',name:C3._name,data:data||{}},'*')};C3.onRequest=function(cb){C3._requestHandler=cb};C3.ready=function(){window.parent.postMessage({type:'widget-ready'},'*')};window.addEventListener('message',function(e){var m=e.data;if(!m||typeof m!=='object'||typeof m.type!=='string')return;if(m.type==='widget-init'){C3._name=m.name||null;C3._sessionId=m.sessionId||null}else if(m.type==='widget-request'&&C3._requestHandler){var r;try{r=C3._requestHandler(m.data||{})}catch(err){r={error:err.message||'Handler error'}}window.parent.postMessage({type:'widget-response',requestId:m.requestId,data:r},'*')}});if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){C3.ready()})}else{C3.ready()}window.C3=C3})()</script>`;

interface WidgetPanelProps {
  widgets: WidgetData[];
  activeWidget: WidgetData | null;
  sessionId: string;
  onClose: () => void;
  onSetActiveWidget: (name: string) => void;
  onDismissWidget: (name: string) => void;
}

export function WidgetPanel({ widgets, activeWidget, sessionId, onClose, onSetActiveWidget, onDismissWidget }: WidgetPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle postMessage from widget iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate source is our iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;

      const msg = event.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      if (msg.type === 'widget-result') {
        // Forward result to backend
        const widgetName = msg.name || activeWidget?.name;
        if (!widgetName) return;

        fetch(`/api/sessions/${sessionId}/widget/${encodeURIComponent(widgetName)}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: msg.data ?? {} }),
        }).catch(() => {
          // Silently ignore — widget result delivery is best-effort from frontend perspective
        });
      } else if (msg.type === 'widget-ready') {
        // Widget SDK initialized — send init message
        if (iframeRef.current?.contentWindow && activeWidget) {
          iframeRef.current.contentWindow.postMessage({
            type: 'widget-init',
            name: activeWidget.name,
            sessionId,
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sessionId, activeWidget]);

  // Send init message when iframe loads (for widgets not using the SDK)
  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !activeWidget) return;
    // Small delay to let iframe scripts initialize (same pattern as ExtensionPanel)
    setTimeout(() => {
      if (iframeRef.current?.contentWindow && activeWidget) {
        iframeRef.current.contentWindow.postMessage({
          type: 'widget-init',
          name: activeWidget.name,
          sessionId,
        }, '*');
      }
    }, 100);
  }, [activeWidget, sessionId]);

  // Prepare srcDoc: inject inline bridge SDK (sandbox blocks external script loads)
  const widgetSrcDoc = useMemo(() => {
    if (!activeWidget) return '';
    // Strip any <script src="/api/widget-bridge.js"> tags — they can't load in sandbox
    const cleaned = activeWidget.html.replace(/<script[^>]*src=["'][^"']*widget-bridge\.js["'][^>]*><\/script>/gi, '');
    // Inject bridge SDK at the start of <head> or <body>, or prepend to the whole doc
    if (cleaned.includes('<head>')) {
      return cleaned.replace('<head>', '<head>' + BRIDGE_SDK);
    }
    if (cleaned.includes('<body>')) {
      return cleaned.replace('<body>', '<body>' + BRIDGE_SDK);
    }
    return BRIDGE_SDK + cleaned;
  }, [activeWidget]);

  // Empty state
  if (widgets.length === 0 || !activeWidget) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400" style={{ flexShrink: 0 }}>
          <span>Widgets</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 px-1"
            title="Close panel"
          >
            &times;
          </button>
        </div>
        <div className="flex items-center justify-center text-gray-500 text-sm p-4 text-center" style={{ flex: 1 }}>
          No widgets — the agent can create interactive widgets here
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Widget selector (only when multiple) */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-2 min-w-0">
          {widgets.length > 1 ? (
            <select
              value={activeWidget.name}
              onChange={(e) => onSetActiveWidget(e.target.value)}
              className="bg-gray-700 text-gray-300 text-xs rounded px-1 py-0.5 border border-gray-600 max-w-[150px]"
            >
              {widgets.map(w => (
                <option key={w.name} value={w.name}>{w.name}</option>
              ))}
            </select>
          ) : (
            <span className="truncate">{activeWidget.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => {
              const name = activeWidget.name;
              fetch(`/api/sessions/${sessionId}/widget/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
              onDismissWidget(name);
            }}
            className="text-gray-500 hover:text-red-400 px-1"
            title={`Dismiss "${activeWidget.name}"`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h8M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M9 3v6.5a1 1 0 01-1 1H4a1 1 0 01-1-1V3"/></svg>
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 px-1"
            title="Close panel"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Widget iframe — absolute position to guarantee it fills the space */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          key={`${activeWidget.name}-${activeWidget.createdAt}`}
          srcDoc={widgetSrcDoc}
          title={`Widget: ${activeWidget.name}`}
          onLoad={handleIframeLoad}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'white',
          }}
        />
      </div>
    </div>
  );
}
