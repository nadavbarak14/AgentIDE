/* eslint-env browser */
/* global html2canvas, rrweb */
(function () {
  'use strict';

  console.log('[c3-inspect-bridge] loaded');

  // --- State ---
  var overlay = null;
  var highlight = null;
  var mouseMoveHandler = null;
  var clickHandler = null;
  var recordingStopFn = null;
  var recordingTimer = null;

  // --- Helpers ---

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Failed to load script: ' + url));
      };
      document.head.appendChild(script);
    });
  }

  function buildSelector(el) {
    var selector = el.tagName.toLowerCase();
    if (el.id) {
      selector += '#' + el.id;
    }
    if (el.classList && el.classList.length > 0) {
      selector += '.' + el.classList[0];
    }
    return selector;
  }

  function postToParent(data) {
    parent.postMessage(data, '*');
  }

  // --- Inspect Mode ---

  function enterInspectMode() {
    exitInspectMode();

    overlay = document.createElement('div');
    overlay.setAttribute('data-c3-overlay', 'true');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;cursor:crosshair;';

    highlight = document.createElement('div');
    highlight.setAttribute('data-c3-highlight', 'true');
    highlight.style.cssText =
      'position:absolute;pointer-events:none;border:2px solid rgba(59,130,246,0.8);background:rgba(59,130,246,0.15);z-index:2147483647;display:none;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;';
    document.body.appendChild(highlight);

    mouseMoveHandler = function (e) {
      overlay.style.pointerEvents = 'none';
      var el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';

      if (
        !el ||
        el === overlay ||
        el === highlight ||
        el === document.body ||
        el === document.documentElement
      ) {
        highlight.style.display = 'none';
        return;
      }

      var rect = el.getBoundingClientRect();
      highlight.style.display = 'block';
      highlight.style.top = rect.top + 'px';
      highlight.style.left = rect.left + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
    };

    clickHandler = function (e) {
      e.preventDefault();
      e.stopPropagation();

      overlay.style.pointerEvents = 'none';
      var el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';

      if (
        !el ||
        el === overlay ||
        el === highlight ||
        el === document.body ||
        el === document.documentElement
      ) {
        return;
      }

      var rect = el.getBoundingClientRect();
      var text = (el.textContent || '').trim().substring(0, 100);

      postToParent({
        type: 'c3:bridge:elementSelected',
        tag: el.tagName.toLowerCase(),
        classes: Array.prototype.slice.call(el.classList),
        selector: buildSelector(el),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        text: text,
      });
    };

    overlay.addEventListener('mousemove', mouseMoveHandler);
    overlay.addEventListener('click', clickHandler);
    document.body.appendChild(overlay);
  }

  function exitInspectMode() {
    if (overlay) {
      overlay.removeEventListener('mousemove', mouseMoveHandler);
      overlay.removeEventListener('click', clickHandler);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      overlay = null;
      mouseMoveHandler = null;
      clickHandler = null;
    }
    if (highlight) {
      if (highlight.parentNode) {
        highlight.parentNode.removeChild(highlight);
      }
      highlight = null;
    }
  }

  // --- Screenshot ---

  var HTML2CANVAS_URL =
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

  function captureScreenshot() {
    var loadPromise =
      typeof html2canvas !== 'undefined'
        ? Promise.resolve()
        : loadScript(HTML2CANVAS_URL);

    loadPromise
      .then(function () {
        return html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
        });
      })
      .then(function (canvas) {
        var dataUrl = canvas.toDataURL('image/png');
        postToParent({
          type: 'c3:bridge:screenshotCaptured',
          dataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
        });
      })
      .catch(function (err) {
        console.error('[c3-inspect-bridge] screenshot failed:', err);
      });
  }

  function captureElement(selector) {
    var el = document.querySelector(selector);
    if (!el) {
      console.warn(
        '[c3-inspect-bridge] element not found for selector:',
        selector
      );
      return;
    }

    var loadPromise =
      typeof html2canvas !== 'undefined'
        ? Promise.resolve()
        : loadScript(HTML2CANVAS_URL);

    loadPromise
      .then(function () {
        return html2canvas(el);
      })
      .then(function (canvas) {
        var dataUrl = canvas.toDataURL('image/png');
        postToParent({
          type: 'c3:bridge:elementScreenshot',
          selector: selector,
          dataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
        });
      })
      .catch(function (err) {
        console.error('[c3-inspect-bridge] element capture failed:', err);
      });
  }

  // --- Recording ---

  var RRWEB_URL =
    'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.17/dist/rrweb-all.min.js';

  function startRecording() {
    stopRecording();

    var loadPromise =
      typeof rrweb !== 'undefined'
        ? Promise.resolve()
        : loadScript(RRWEB_URL);

    loadPromise
      .then(function () {
        recordingStopFn = rrweb.record({
          emit: function (event) {
            postToParent({
              type: 'c3:bridge:recordingEvent',
              event: event,
            });
          },
        });

        recordingTimer = setTimeout(function () {
          stopRecording();
        }, 300000);

        postToParent({ type: 'c3:bridge:recordingStarted' });
      })
      .catch(function (err) {
        console.error('[c3-inspect-bridge] recording start failed:', err);
      });
  }

  function stopRecording() {
    if (recordingTimer) {
      clearTimeout(recordingTimer);
      recordingTimer = null;
    }
    if (recordingStopFn) {
      recordingStopFn();
      recordingStopFn = null;
      postToParent({ type: 'c3:bridge:recordingStopped' });
    }
  }

  // --- Element Check ---

  function checkElements(selectors) {
    var results = {};
    for (var i = 0; i < selectors.length; i++) {
      results[selectors[i]] = !!document.querySelector(selectors[i]);
    }
    postToParent({
      type: 'c3:bridge:elementsChecked',
      results: results,
    });
  }

  // --- Message Listener ---

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('c3:')) {
      return;
    }

    switch (data.type) {
      case 'c3:enterInspectMode':
        enterInspectMode();
        break;
      case 'c3:exitInspectMode':
        exitInspectMode();
        break;
      case 'c3:captureScreenshot':
        captureScreenshot();
        break;
      case 'c3:captureElement':
        if (data.selector) {
          captureElement(data.selector);
        }
        break;
      case 'c3:startRecording':
        startRecording();
        break;
      case 'c3:stopRecording':
        stopRecording();
        break;
      case 'c3:checkElements':
        if (data.selectors && Array.isArray(data.selectors)) {
          checkElements(data.selectors);
        }
        break;
      default:
        break;
    }
  });

  // --- Notify parent that bridge is ready ---

  postToParent({ type: 'c3:bridge:ready' });
})();
