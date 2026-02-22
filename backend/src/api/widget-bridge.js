/* eslint-env browser */
/* Widget Bridge SDK — lightweight helper for dynamic skill UI widgets */
(function () {
  'use strict';

  var C3 = {};
  C3._name = null;
  C3._sessionId = null;
  C3._requestHandler = null;

  /** Send a structured result back to the agent */
  C3.sendResult = function (data) {
    window.parent.postMessage({
      type: 'widget-result',
      name: C3._name,
      data: data || {},
    }, '*');
  };

  /** Register a handler for requests from the host */
  C3.onRequest = function (callback) {
    C3._requestHandler = callback;
  };

  /** Signal that the widget SDK is initialized and ready */
  C3.ready = function () {
    window.parent.postMessage({ type: 'widget-ready' }, '*');
  };

  // Listen for messages from the host
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    if (msg.type === 'widget-init') {
      C3._name = msg.name || null;
      C3._sessionId = msg.sessionId || null;
    } else if (msg.type === 'widget-request' && C3._requestHandler) {
      var result;
      try {
        result = C3._requestHandler(msg.data || {});
      } catch (err) {
        result = { error: err.message || 'Handler error' };
      }
      window.parent.postMessage({
        type: 'widget-response',
        requestId: msg.requestId,
        data: result,
      }, '*');
    }
  });

  // Auto-signal ready on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      C3.ready();
    });
  } else {
    C3.ready();
  }

  window.C3 = C3;
})();
