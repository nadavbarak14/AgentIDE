/* eslint-env browser */
/* global html2canvas */
(function () {
  'use strict';

  console.log('[c3-inspect-bridge] v6 loaded');

  // --- State ---
  var overlay = null;
  var highlight = null;
  var mouseMoveHandler = null;
  var clickHandler = null;
  // Recording state
  var mediaRecorder = null;
  var recordingChunks = [];
  var recordingCanvas = null;
  var recordingCtx = null;
  var recordingInterval = null;
  var recordingMaxTimer = null;

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
      script.setAttribute('data-c3-bridge', '');
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Failed to load script: ' + url));
      };
      document.head.appendChild(script);
    });
  }

  /** Extract the real page URL from the proxy URL */
  function getRealPageUrl() {
    var href = window.location.href;
    var match = href.match(/\/api\/sessions\/[^/]+\/proxy\/(\d+)(\/[^?#]*)?(\?[^#]*)?(#.*)?/);
    if (match) {
      var port = match[1];
      var pagePath = match[2] || '/';
      var query = match[3] || '';
      var hash = match[4] || '';
      return window.location.protocol + '//' + window.location.hostname + ':' + port + pagePath + query + hash;
    }
    return href;
  }

  /** Build a unique CSS selector path for an element */
  function buildSelector(el) {
    if (el.id) return '#' + el.id;
    var parts = [];
    var current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      var tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift('#' + current.id);
        break;
      }
      var parentEl = current.parentElement;
      if (parentEl) {
        var siblings = Array.prototype.slice.call(parentEl.children).filter(function (c) {
          return c.tagName === current.tagName;
        });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
      }
      if (current.classList && current.classList.length > 0) {
        tag += '.' + Array.prototype.slice.call(current.classList).slice(0, 2).join('.');
      }
      parts.unshift(tag);
      current = parentEl;
    }
    return parts.join(' > ');
  }

  /** Collect rich element info for comments */
  function getElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var text = (el.textContent || '').trim().substring(0, 200);
    var outerHtml = (el.outerHTML || '').substring(0, 1500);
    var computed = {};
    try {
      var cs = window.getComputedStyle(el);
      var props = ['color', 'background-color', 'font-size', 'font-family', 'display',
        'position', 'width', 'height', 'padding', 'margin', 'border', 'opacity', 'visibility'];
      for (var i = 0; i < props.length; i++) {
        computed[props[i]] = cs.getPropertyValue(props[i]);
      }
    } catch (e) { /* ignore */ }

    var ancestors = [];
    var p = el.parentElement;
    var depth = 0;
    while (p && p !== document.body && depth < 4) {
      var atag = p.tagName.toLowerCase();
      if (p.id) atag += '#' + p.id;
      else if (p.classList && p.classList.length > 0) atag += '.' + p.classList[0];
      ancestors.push(atag);
      p = p.parentElement;
      depth++;
    }

    return {
      tag: el.tagName.toLowerCase(),
      classes: Array.prototype.slice.call(el.classList),
      selector: buildSelector(el),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      text: text,
      outerHtml: outerHtml,
      computedStyles: computed,
      ancestors: ancestors,
      pageUrl: getRealPageUrl(),
      pageTitle: document.title,
    };
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

      if (!el || el === overlay || el === highlight || el === document.body || el === document.documentElement) {
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

      if (!el || el === overlay || el === highlight || el === document.body || el === document.documentElement) {
        return;
      }

      var info = getElementInfo(el);
      postToParent(Object.assign({ type: 'c3:bridge:elementSelected' }, info));
    };

    overlay.addEventListener('mousemove', mouseMoveHandler);
    overlay.addEventListener('click', clickHandler);
    document.body.appendChild(overlay);
  }

  function exitInspectMode() {
    if (overlay) {
      overlay.removeEventListener('mousemove', mouseMoveHandler);
      overlay.removeEventListener('click', clickHandler);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
      mouseMoveHandler = null;
      clickHandler = null;
    }
    if (highlight) {
      if (highlight.parentNode) highlight.parentNode.removeChild(highlight);
      highlight = null;
    }
  }

  // --- Screenshot (html2canvas-pro) ---

  var HTML2CANVAS_PRO_URL =
    'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js';

  /** Common html2canvas options for high-fidelity capture */
  function getCaptureOptions(w, h) {
    return {
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      x: window.scrollX,
      y: window.scrollY,
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
      onclone: function (clonedDoc) {
        // Fix input/textarea rendering — html2canvas clips text vertically.
        // Replace inputs with styled divs that render text reliably.
        var inputs = clonedDoc.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea');
        for (var i = 0; i < inputs.length; i++) {
          var field = inputs[i];
          var text = field.value || field.getAttribute('placeholder') || '';
          var isPlaceholder = !field.value;
          var isPassword = field.type === 'password' && field.value;

          // Get computed style from the original page element
          var allOrig = document.querySelectorAll('input, textarea');
          var origEl = allOrig[i];
          if (!origEl) continue;

          var cs = window.getComputedStyle(origEl);
          var div = clonedDoc.createElement('div');

          // Copy all visual styles
          var stylesToCopy = [
            'box-sizing', 'width', 'height', 'min-height', 'max-height',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
            'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
            'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
            'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
            'background-color', 'background-image', 'background-size', 'background-position',
            'font-family', 'font-size', 'font-weight', 'font-style',
            'color', 'letter-spacing', 'text-transform',
          ];
          for (var s = 0; s < stylesToCopy.length; s++) {
            div.style.setProperty(stylesToCopy[s], cs.getPropertyValue(stylesToCopy[s]));
          }

          // Use flexbox to vertically center text — works on divs unlike inputs
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.overflow = 'hidden';
          div.style.whiteSpace = 'nowrap';
          div.style.textOverflow = 'ellipsis';
          div.style.lineHeight = 'normal';

          if (isPlaceholder) {
            div.style.opacity = '0.5';
          }
          div.textContent = isPassword ? '\u2022'.repeat(text.length) : text;

          field.parentNode.replaceChild(div, field);
        }
        // Hide bridge elements in clone
        var bridgeEls = clonedDoc.querySelectorAll('[data-c3-overlay],[data-c3-highlight]');
        for (var j = 0; j < bridgeEls.length; j++) {
          bridgeEls[j].style.display = 'none';
        }
      },
    };
  }

  function ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return Promise.resolve();
    return loadScript(HTML2CANVAS_PRO_URL);
  }

  function captureScreenshot(msgId) {
    ensureHtml2Canvas()
      .then(function () {
        return html2canvas(document.body, getCaptureOptions(window.innerWidth, window.innerHeight));
      })
      .then(function (canvas) {
        var dataUrl = canvas.toDataURL('image/png');
        postToParent({
          type: 'c3:bridge:screenshotCaptured',
          dataUrl: dataUrl,
          width: window.innerWidth,
          height: window.innerHeight,
          msgId: msgId || null,
        });
      })
      .catch(function (err) {
        console.warn('[c3-inspect-bridge] screenshot failed:', err.message);
        postToParent({
          type: 'c3:bridge:screenshotFailed',
          error: 'Screenshot capture failed: ' + (err.message || 'unknown error'),
          msgId: msgId || null,
        });
      });
  }

  function captureElement(selector) {
    var el = document.querySelector(selector);
    if (!el) return;

    ensureHtml2Canvas()
      .then(function () {
        var opts = getCaptureOptions(el.offsetWidth, el.offsetHeight);
        delete opts.x;
        delete opts.y;
        delete opts.windowWidth;
        delete opts.windowHeight;
        return html2canvas(el, opts);
      })
      .then(function (canvas) {
        postToParent({
          type: 'c3:bridge:elementScreenshot',
          selector: selector,
          dataUrl: canvas.toDataURL('image/png'),
          width: el.offsetWidth,
          height: el.offsetHeight,
        });
      })
      .catch(function (err) {
        console.warn('[c3-inspect-bridge] element capture failed:', err.message);
      });
  }

  // --- Video Recording (real WebM via MediaRecorder + canvas) ---

  var RECORDING_FPS = 3;
  var MAX_RECORDING_MS = 300000; // 5 minutes max (FR-022)

  function startRecording(msgId) {
    stopRecording();

    ensureHtml2Canvas()
      .then(function () {
        var w = window.innerWidth;
        var h = window.innerHeight;

        // Create offscreen canvas for frame drawing
        recordingCanvas = document.createElement('canvas');
        recordingCanvas.width = w;
        recordingCanvas.height = h;
        recordingCtx = recordingCanvas.getContext('2d');

        // Start MediaRecorder on canvas stream
        var stream = recordingCanvas.captureStream(RECORDING_FPS);
        recordingChunks = [];

        var mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';

        mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
        mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) {
            recordingChunks.push(e.data);
          }
        };
        mediaRecorder.onstop = function () {
          var blob = new Blob(recordingChunks, { type: mimeType });
          var reader = new FileReader();
          reader.onload = function () {
            postToParent({
              type: 'c3:bridge:recordingStopped',
              videoDataUrl: reader.result,
              durationMs: Date.now() - recordingStartTime,
              width: w,
              height: h,
              msgId: msgId || null,
            });
          };
          reader.readAsDataURL(blob);
          recordingChunks = [];
          recordingCanvas = null;
          recordingCtx = null;
        };

        var recordingStartTime = Date.now();
        mediaRecorder.start(1000); // collect data every second

        // Capture frames at FPS rate using html2canvas
        // For recording, skip scale/onclone for perf — use 1x and minimal options
        var frameOpts = {
          width: w, height: h, windowWidth: w, windowHeight: h,
          x: window.scrollX, y: window.scrollY,
          scale: 1, useCORS: true, allowTaint: true, logging: false,
        };
        function captureFrame() {
          if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
          html2canvas(document.body, frameOpts).then(function (frameCanvas) {
            if (recordingCtx && mediaRecorder && mediaRecorder.state === 'recording') {
              recordingCtx.clearRect(0, 0, w, h);
              recordingCtx.drawImage(frameCanvas, 0, 0, w, h);
            }
          }).catch(function () {
            // Skip failed frame
          });
        }

        // Draw initial black frame so the stream has content
        recordingCtx.fillStyle = '#000';
        recordingCtx.fillRect(0, 0, w, h);

        // Start frame capture loop
        captureFrame();
        recordingInterval = setInterval(captureFrame, 1000 / RECORDING_FPS);

        // Auto-stop after max duration
        recordingMaxTimer = setTimeout(function () {
          stopRecording();
        }, MAX_RECORDING_MS);

        postToParent({ type: 'c3:bridge:recordingStarted', msgId: msgId || null });
      })
      .catch(function (err) {
        console.error('[c3-inspect-bridge] recording start failed:', err);
        postToParent({
          type: 'c3:bridge:recordingFailed',
          error: err.message || 'Failed to start recording',
          msgId: msgId || null,
        });
      });
  }

  function stopRecording(_msgId) {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    if (recordingMaxTimer) {
      clearTimeout(recordingMaxTimer);
      recordingMaxTimer = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder = null;
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

  // --- Accessibility Tree & Element Targeting (US6) ---

  /** Map HTML elements to their implicit ARIA roles */
  function getImplicitRole(el) {
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute('type') || '').toLowerCase();
    var role = el.getAttribute('role');
    if (role) return role;

    switch (tag) {
      case 'a': return el.hasAttribute('href') ? 'link' : null;
      case 'button': return 'button';
      case 'input':
        switch (type) {
          case 'button': case 'submit': case 'reset': case 'image': return 'button';
          case 'checkbox': return 'checkbox';
          case 'radio': return 'radio';
          case 'range': return 'slider';
          case 'search': return 'searchbox';
          default: return 'textbox';
        }
      case 'select': return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
      case 'textarea': return 'textbox';
      case 'img': return 'img';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'header': return 'banner';
      case 'footer': return 'contentinfo';
      case 'aside': return 'complementary';
      case 'form': return 'form';
      case 'table': return 'table';
      case 'ul': case 'ol': return 'list';
      case 'li': return 'listitem';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
      case 'section': return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null;
      case 'dialog': return 'dialog';
      case 'progress': return 'progressbar';
      case 'details': return 'group';
      case 'summary': return 'button';
      default: return null;
    }
  }

  /** Get the accessible name for an element */
  function getAccessibleName(el) {
    // 1. aria-label
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var parts = labelledBy.split(/\s+/);
      var texts = [];
      for (var i = 0; i < parts.length; i++) {
        var ref = document.getElementById(parts[i]);
        if (ref) texts.push((ref.textContent || '').trim());
      }
      if (texts.length > 0) return texts.join(' ');
    }

    // 3. <label for="">
    if (el.id) {
      var labels = document.querySelectorAll('label[for="' + el.id + '"]');
      if (labels.length > 0) return (labels[0].textContent || '').trim();
    }
    // Also check wrapping label
    var parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel) {
      // Get label text excluding the input's own text
      var clone = parentLabel.cloneNode(true);
      var inputsInClone = clone.querySelectorAll('input, select, textarea');
      for (var k = 0; k < inputsInClone.length; k++) {
        inputsInClone[k].parentNode.removeChild(inputsInClone[k]);
      }
      var labelText = (clone.textContent || '').trim();
      if (labelText) return labelText;
    }

    // 4. Visible text content (for buttons, links, headings)
    var tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'summary' || /^h[1-6]$/.test(tag)) {
      var text = (el.textContent || '').trim();
      if (text) return text.substring(0, 100);
    }

    // 5. alt text for images
    if (tag === 'img') {
      var alt = el.getAttribute('alt');
      if (alt) return alt.trim();
    }

    // 6. title attribute
    var title = el.getAttribute('title');
    if (title) return title.trim();

    // 7. placeholder
    var placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    // 8. value for buttons
    if (tag === 'input' && (el.type === 'submit' || el.type === 'button' || el.type === 'reset')) {
      return (el.value || '').trim();
    }

    return '';
  }

  /** Check if element is hidden */
  function isElementHidden(el) {
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (el.hasAttribute('hidden')) return true;
    if (el.hasAttribute('data-c3-bridge') || el.hasAttribute('data-c3-overlay') || el.hasAttribute('data-c3-highlight')) return true;
    try {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Build compact accessibility tree as indented text */
  function buildAccessibilityTree(root) {
    var lines = [];

    function walk(node, depth) {
      if (node.nodeType !== 1) return; // Element nodes only
      if (isElementHidden(node)) return;

      var role = getImplicitRole(node);
      var name = getAccessibleName(node);
      var tag = node.tagName.toLowerCase();

      // Build line for this element if it has a role
      if (role) {
        var parts = [role];
        if (name) parts.push('"' + name.replace(/"/g, '\\"') + '"');

        // Add extra attributes based on role
        if (role === 'heading') {
          var level = tag.charAt(1);
          parts.push('level=' + level);
        }
        if (role === 'link' && node.getAttribute('href')) {
          var href = node.getAttribute('href');
          if (href.length <= 60) parts.push('href="' + href + '"');
        }
        if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
          var val = node.value !== undefined ? node.value : '';
          parts.push('value="' + val.substring(0, 50).replace(/"/g, '\\"') + '"');
          if (node.hasAttribute('required')) parts.push('required');
          if (node.readOnly) parts.push('readonly');
          if (node.disabled) parts.push('disabled');
        }
        if (role === 'checkbox' || role === 'radio') {
          parts.push(node.checked ? 'checked' : 'unchecked');
          if (node.disabled) parts.push('disabled');
        }
        if (role === 'button' && node.disabled) {
          parts.push('disabled');
        }
        if (node.getAttribute('aria-expanded')) {
          parts.push('expanded=' + node.getAttribute('aria-expanded'));
        }
        if (node.getAttribute('aria-selected') === 'true') {
          parts.push('selected');
        }
        if (role === 'img' && !name) {
          parts.push('(no alt text)');
        }

        var indent = '';
        for (var i = 0; i < depth; i++) indent += '  ';
        lines.push(indent + parts.join(' '));
      }

      // Walk children — increase depth only if we emitted a line
      var children = node.children;
      for (var c = 0; c < children.length; c++) {
        walk(children[c], role ? depth + 1 : depth);
      }
    }

    walk(root, 0);
    return lines.join('\n');
  }

  // --- Element Interaction (click, type, navigate) ---

  /** Find an element by ARIA role and accessible name */
  function findElementByRoleAndName(role, name) {
    var normalizedName = (name || '').trim().toLowerCase();
    var all = document.querySelectorAll('*');
    var candidates = []; // elements matching the role

    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (isElementHidden(el)) continue;
      var elRole = getImplicitRole(el);
      if (elRole !== role) continue;

      var elName = getAccessibleName(el);
      candidates.push({ el: el, name: elName });

      if (elName.trim().toLowerCase() === normalizedName) {
        return { found: true, element: el };
      }
    }

    // Not found — return available elements of that role
    var available = [];
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].name) available.push(candidates[j].name);
    }
    return { found: false, available: available };
  }

  function clickElement(role, name, msgId) {
    var result = findElementByRoleAndName(role, name);
    if (result.found) {
      var el = result.element;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      // Dispatch realistic click event sequence
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      postToParent({ type: 'c3:bridge:elementClicked', ok: true, msgId: msgId || null });
    } else {
      postToParent({
        type: 'c3:bridge:elementClicked',
        ok: false,
        error: 'Element not found: ' + role + ' "' + name + '"',
        available: result.available,
        msgId: msgId || null,
      });
    }
  }

  function typeElement(role, name, text, msgId) {
    var result = findElementByRoleAndName(role, name);
    if (!result.found) {
      postToParent({
        type: 'c3:bridge:elementTyped',
        ok: false,
        error: 'Element not found: ' + role + ' "' + name + '"',
        available: result.available,
        msgId: msgId || null,
      });
      return;
    }
    var el = result.element;
    var tag = el.tagName.toLowerCase();
    var isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
    var isContentEditable = el.isContentEditable;

    if (!isInput && !isContentEditable) {
      postToParent({
        type: 'c3:bridge:elementTyped',
        ok: false,
        error: 'Element is not an input. Role: ' + (getImplicitRole(el) || tag),
        msgId: msgId || null,
      });
      return;
    }

    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.focus();

    if (isContentEditable) {
      el.textContent = '';
      document.execCommand('insertText', false, text);
    } else {
      // Clear existing value first
      el.select();
      // Use execCommand('insertText') which goes through the browser's native
      // text input pipeline, firing beforeinput/input/change events naturally.
      // This works with React controlled inputs (all versions) because it
      // triggers the same event path as real keyboard input.
      var execCommandWorked = false;
      try {
        if (typeof document.execCommand === 'function') {
          execCommandWorked = document.execCommand('insertText', false, text);
        }
      } catch (ex) { /* execCommand not available (e.g. in JSDOM) */ }
      if (!execCommandWorked) {
        // Fallback: native setter + _valueTracker reset for older browsers
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        var nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        var setter = tag === 'textarea' ? nativeTextareaValueSetter : nativeInputValueSetter;
        if (setter && setter.set) {
          setter.set.call(el, text);
        } else {
          el.value = text;
        }
        var tracker = el._valueTracker;
        if (tracker) {
          tracker.setValue('');
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    postToParent({
      type: 'c3:bridge:elementTyped',
      ok: true,
      msgId: msgId || null,
    });
  }

  function navigateTo(url, msgId) {
    postToParent({
      type: 'c3:bridge:navigated',
      ok: true,
      url: url,
      msgId: msgId || null,
    });
    // Small delay to let postMessage send before navigation destroys the page
    setTimeout(function () {
      window.location.href = url;
    }, 50);
  }

  function readPage(msgId) {
    var tree = buildAccessibilityTree(document.body);
    postToParent({
      type: 'c3:bridge:pageRead',
      tree: tree,
      msgId: msgId || null,
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
        captureScreenshot(data.msgId);
        break;
      case 'c3:captureElement':
        if (data.selector) captureElement(data.selector);
        break;
      case 'c3:startRecording':
        startRecording(data.msgId);
        break;
      case 'c3:stopRecording':
        stopRecording(data.msgId);
        break;
      case 'c3:checkElements':
        if (data.selectors && Array.isArray(data.selectors)) checkElements(data.selectors);
        break;
      case 'c3:readPage':
        readPage(data.msgId);
        break;
      case 'c3:clickElement':
        if (data.role) clickElement(data.role, data.name || '', data.msgId);
        break;
      case 'c3:typeElement':
        if (data.role && data.text !== undefined) typeElement(data.role, data.name || '', data.text, data.msgId);
        break;
      case 'c3:navigateTo':
        if (data.url) navigateTo(data.url, data.msgId);
        break;
      default:
        break;
    }
  });

  // --- Notify parent that bridge is ready ---
  postToParent({ type: 'c3:bridge:ready' });
})();
