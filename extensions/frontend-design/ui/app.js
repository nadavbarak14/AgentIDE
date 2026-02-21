/**
 * Frontend Design Extension — app.js
 * Manages screens, inspect mode, commenting, pins, and text selection.
 */

// ── State ───────────────────────────────────────────────────────────────
const state = {
  screens: [],          // { name, html, updatedAt }
  activeScreen: null,   // screen name or null
  inspectMode: false,
  textSelectMode: false,
  comments: [],         // { id, screen, element, elementSelector, rect, text, stale }
  nextCommentId: 1,
};

// ── DOM refs ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const tabBar = () => $('#tab-bar');
const viewport = () => $('#viewport');
const inspectOverlay = () => $('#inspect-overlay');
const inspectBtn = () => $('#btn-inspect');
const textSelectBtn = () => $('#btn-text-select');

// ── postMessage bridge ──────────────────────────────────────────────────
function sendToHost(msg) {
  window.parent.postMessage(msg, '*');
}

window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object' || !e.data.type) return;
  const { type, command, params } = e.data;

  if (type === 'init') {
    // Host acknowledged us
    return;
  }

  if (type === 'board-command') {
    handleBoardCommand(command, params || {});
  }
});

// Signal ready
sendToHost({ type: 'ready' });

// ── Board command handlers ──────────────────────────────────────────────
function handleBoardCommand(command, params) {
  switch (command) {
    case 'design.add_screen':
      addScreen(params.name, params.html);
      break;
    case 'design.update_screen':
      updateScreen(params.name, params.html);
      break;
    case 'design.remove_screen':
      removeScreen(params.name);
      break;
    case 'enable-inspect':
      if (params.screen) switchToScreen(params.screen);
      setInspectMode(true);
      break;
    case 'enable-text-select':
      if (params.screen) switchToScreen(params.screen);
      setTextSelectMode(true);
      break;
    default:
      break;
  }
}

// ── Screen management ───────────────────────────────────────────────────
function addScreen(name, html) {
  if (!name || !html) return;
  const existing = state.screens.find((s) => s.name === name);
  if (existing) {
    // Overwrite existing screen
    existing.html = html;
    existing.updatedAt = Date.now();
    checkStaleComments(name, html);
  } else {
    state.screens.push({ name, html, updatedAt: Date.now() });
  }
  if (!state.activeScreen || state.screens.length === 1) {
    state.activeScreen = name;
  }
  render();
}

function updateScreen(name, html) {
  const screen = state.screens.find((s) => s.name === name);
  if (!screen) return;
  screen.html = html;
  screen.updatedAt = Date.now();
  checkStaleComments(name, html);
  render();
}

function removeScreen(name) {
  const idx = state.screens.findIndex((s) => s.name === name);
  if (idx === -1) return;
  state.screens.splice(idx, 1);
  // Remove comments for this screen
  state.comments = state.comments.filter((c) => c.screen !== name);
  // Select next screen
  if (state.activeScreen === name) {
    state.activeScreen = state.screens.length > 0
      ? state.screens[Math.min(idx, state.screens.length - 1)].name
      : null;
  }
  render();
}

function switchToScreen(name) {
  if (state.screens.find((s) => s.name === name)) {
    state.activeScreen = name;
    render();
  }
}

// ── Inspect mode ────────────────────────────────────────────────────────
function setInspectMode(on) {
  state.inspectMode = on;
  if (on) state.textSelectMode = false;
  const overlay = inspectOverlay();
  if (overlay) overlay.classList.toggle('active', on);
  const btn = inspectBtn();
  if (btn) btn.classList.toggle('active', on);
  const tsBtn = textSelectBtn();
  if (tsBtn) tsBtn.classList.toggle('active', false);
  if (!on) clearHighlight();
}

function setTextSelectMode(on) {
  state.textSelectMode = on;
  if (on) state.inspectMode = false;
  const overlay = inspectOverlay();
  if (overlay) overlay.classList.toggle('active', false); // text select doesn't use overlay
  const btn = textSelectBtn();
  if (btn) btn.classList.toggle('active', on);
  const iBtn = inspectBtn();
  if (iBtn) iBtn.classList.toggle('active', false);
  if (!on) clearHighlight();
}

// ── Highlight ───────────────────────────────────────────────────────────
let highlightBox = null;
let hoveredElement = null;

function clearHighlight() {
  if (highlightBox) {
    highlightBox.remove();
    highlightBox = null;
  }
  hoveredElement = null;
}

function showHighlight(rect) {
  if (!highlightBox) {
    highlightBox = document.createElement('div');
    highlightBox.className = 'highlight-box';
    inspectOverlay().appendChild(highlightBox);
  }
  highlightBox.style.left = rect.left + 'px';
  highlightBox.style.top = rect.top + 'px';
  highlightBox.style.width = rect.width + 'px';
  highlightBox.style.height = rect.height + 'px';
}

// ── Element targeting via overlay → iframe coordinates ──────────────────
function getIframeElementAt(clientX, clientY) {
  const frame = viewport()?.querySelector('.screen-frame');
  if (!frame || !frame.contentDocument) return null;

  const frameRect = frame.getBoundingClientRect();
  const x = clientX - frameRect.left;
  const y = clientY - frameRect.top;

  try {
    const el = frame.contentDocument.elementFromPoint(x, y);
    if (el && el !== frame.contentDocument.documentElement && el !== frame.contentDocument.body) {
      return { element: el, frameRect };
    }
    return null;
  } catch {
    return null;
  }
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').trim().slice(0, 50);
  const role = el.getAttribute('role') || '';
  let desc = `[${tag}]`;
  if (text) desc += ` "${text}"`;
  if (role) desc += ` (role: ${role})`;
  return desc;
}

function getElementSelector(el) {
  // Simple CSS-like selector for re-querying
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).join('.')
    : '';
  const nthChild = Array.from(el.parentElement?.children || []).indexOf(el);
  return `${tag}${id}${cls}:nth-child(${nthChild + 1})`;
}

function getElementRect(el, frameRect) {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + frameRect.left,
    top: r.top + frameRect.top,
    width: r.width,
    height: r.height,
  };
}

// ── Overlay event handlers ──────────────────────────────────────────────
function handleOverlayMouseMove(e) {
  if (!state.inspectMode) return;
  const result = getIframeElementAt(e.clientX, e.clientY);
  if (result) {
    hoveredElement = result.element;
    const rect = getElementRect(result.element, result.frameRect);
    // Adjust rect relative to overlay (which is positioned over viewport)
    const overlayRect = inspectOverlay().getBoundingClientRect();
    showHighlight({
      left: rect.left - overlayRect.left,
      top: rect.top - overlayRect.top,
      width: rect.width,
      height: rect.height,
    });
  } else {
    clearHighlight();
  }
}

function handleOverlayClick(e) {
  if (!state.inspectMode || !hoveredElement) return;
  e.preventDefault();
  e.stopPropagation();

  const frame = viewport()?.querySelector('.screen-frame');
  if (!frame) return;
  const frameRect = frame.getBoundingClientRect();
  const rect = getElementRect(hoveredElement, frameRect);
  const overlayRect = inspectOverlay().getBoundingClientRect();

  showCommentPopover(
    hoveredElement,
    {
      left: rect.left - overlayRect.left,
      top: rect.top - overlayRect.top + rect.height + 4,
      width: rect.width,
      height: rect.height,
    },
    frameRect
  );
}

// ── Comment popover ─────────────────────────────────────────────────────
let activePopover = null;

function showCommentPopover(element, position, frameRect) {
  closeCommentPopover();

  const overlay = inspectOverlay();
  const desc = describeElement(element);
  const selector = getElementSelector(element);

  const popover = document.createElement('div');
  popover.className = 'comment-popover';
  popover.style.left = Math.max(4, Math.min(position.left, overlay.offsetWidth - 270)) + 'px';
  popover.style.top = position.top + 'px';

  popover.innerHTML = `
    <div class="comment-element-label">${escapeHtml(desc)}</div>
    <textarea placeholder="Add your comment..." autofocus></textarea>
    <div class="comment-popover-actions">
      <button class="comment-popover-btn cancel">Cancel</button>
      <button class="comment-popover-btn primary send">Send</button>
    </div>
  `;

  popover.querySelector('.cancel').addEventListener('click', closeCommentPopover);
  popover.querySelector('.send').addEventListener('click', () => {
    const text = popover.querySelector('textarea').value.trim();
    if (!text) return;

    // Save comment locally
    const rect = getElementRect(element, frameRect);
    const overlayRect = overlay.getBoundingClientRect();
    const comment = {
      id: state.nextCommentId++,
      screen: state.activeScreen,
      element: desc,
      elementSelector: selector,
      rect: {
        left: rect.left - overlayRect.left,
        top: rect.top - overlayRect.top,
        width: rect.width,
        height: rect.height,
      },
      text,
      stale: false,
    };
    state.comments.push(comment);

    // Send to host
    sendToHost({
      type: 'send-comment',
      text: `[Design Review — Screen: "${state.activeScreen}"] Element: ${desc}\nComment: ${text}`,
      context: {
        source: 'frontend-design',
        screen: state.activeScreen,
        element: desc,
      },
    });

    closeCommentPopover();
    renderPins();
  });

  // Focus textarea next tick
  setTimeout(() => popover.querySelector('textarea')?.focus(), 0);

  overlay.appendChild(popover);
  activePopover = popover;
}

function closeCommentPopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

// ── Comment pins ────────────────────────────────────────────────────────
let pinTooltip = null;

function renderPins() {
  // Remove existing pins
  document.querySelectorAll('.comment-pin').forEach((p) => p.remove());
  if (pinTooltip) { pinTooltip.remove(); pinTooltip = null; }

  const overlay = inspectOverlay();
  if (!overlay) return;

  const screenComments = state.comments.filter((c) => c.screen === state.activeScreen);
  screenComments.forEach((comment, i) => {
    const pin = document.createElement('div');
    pin.className = 'comment-pin' + (comment.stale ? ' stale' : '');
    pin.textContent = String(i + 1);
    pin.style.left = (comment.rect.left + comment.rect.width / 2 - 10) + 'px';
    pin.style.top = (comment.rect.top - 10) + 'px';
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      showPinTooltip(comment, pin);
    });
    overlay.appendChild(pin);
  });
}

function showPinTooltip(comment, pinEl) {
  if (pinTooltip) { pinTooltip.remove(); pinTooltip = null; }

  const tooltip = document.createElement('div');
  tooltip.className = 'pin-tooltip';
  tooltip.style.left = (parseInt(pinEl.style.left) + 24) + 'px';
  tooltip.style.top = pinEl.style.top;

  tooltip.innerHTML = `
    <div class="pin-element">${escapeHtml(comment.element)}</div>
    <div class="pin-text">${escapeHtml(comment.text)}</div>
    ${comment.stale ? '<div class="pin-stale-notice">Element may have changed</div>' : ''}
  `;

  tooltip.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { tooltip.remove(); pinTooltip = null; }, { once: true });

  inspectOverlay().appendChild(tooltip);
  pinTooltip = tooltip;
}

// ── Stale comment detection ─────────────────────────────────────────────
function checkStaleComments(screenName, newHtml) {
  const screenComments = state.comments.filter((c) => c.screen === screenName);
  if (screenComments.length === 0) return;

  // Create temp iframe to query elements in new HTML
  const temp = document.createElement('iframe');
  temp.style.display = 'none';
  document.body.appendChild(temp);
  try {
    temp.contentDocument.open();
    temp.contentDocument.write(newHtml);
    temp.contentDocument.close();

    for (const comment of screenComments) {
      try {
        const found = temp.contentDocument.querySelector(comment.elementSelector);
        comment.stale = !found;
      } catch {
        comment.stale = true;
      }
    }
  } finally {
    temp.remove();
  }
}

// ── Text selection feedback ─────────────────────────────────────────────
let selectionBtn = null;

function setupTextSelection(frame) {
  if (!frame || !frame.contentDocument) return;

  frame.contentDocument.addEventListener('mouseup', () => {
    if (!state.textSelectMode) return;
    const sel = frame.contentWindow.getSelection();
    const text = sel?.toString().trim();

    removeSelectionBtn();

    if (text && text.length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const overlayRect = inspectOverlay().getBoundingClientRect();

      selectionBtn = document.createElement('button');
      selectionBtn.className = 'selection-btn';
      selectionBtn.textContent = 'Send Selection';
      selectionBtn.style.left = (rect.left + frameRect.left - overlayRect.left) + 'px';
      selectionBtn.style.top = (rect.bottom + frameRect.top - overlayRect.top + 4) + 'px';

      selectionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendToHost({
          type: 'send-comment',
          text: `[Design Review — Screen: "${state.activeScreen}"] Selected text: "${text}"`,
          context: {
            source: 'frontend-design',
            screen: state.activeScreen,
            selectedText: text,
          },
        });
        removeSelectionBtn();
      });

      inspectOverlay().appendChild(selectionBtn);
    }
  });
}

function removeSelectionBtn() {
  if (selectionBtn) { selectionBtn.remove(); selectionBtn = null; }
}

// ── Render ──────────────────────────────────────────────────────────────
function render() {
  renderTabBar();
  renderViewport();
  renderPins();
}

function renderTabBar() {
  const bar = tabBar();
  if (!bar) return;
  bar.innerHTML = '';

  for (const screen of state.screens) {
    const tab = document.createElement('button');
    tab.className = 'tab' + (screen.name === state.activeScreen ? ' active' : '');

    const label = document.createElement('span');
    label.textContent = screen.name;
    tab.appendChild(label);

    tab.addEventListener('click', () => switchToScreen(screen.name));
    bar.appendChild(tab);
  }
}

function renderViewport() {
  const vp = viewport();
  if (!vp) return;

  // Remove existing frame
  const oldFrame = vp.querySelector('.screen-frame');
  if (oldFrame) oldFrame.remove();

  // Remove placeholder
  const oldPlaceholder = vp.querySelector('.placeholder');
  if (oldPlaceholder) oldPlaceholder.remove();

  const screen = state.screens.find((s) => s.name === state.activeScreen);

  if (!screen) {
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.innerHTML = `
      <div class="placeholder-icon">&#x1f3a8;</div>
      <div class="placeholder-text">Waiting for designs...</div>
      <div class="placeholder-hint">Use /design-add-screen to add a screen</div>
    `;
    vp.appendChild(ph);
    return;
  }

  const frame = document.createElement('iframe');
  frame.className = 'screen-frame';
  frame.sandbox = 'allow-scripts';
  frame.srcdoc = screen.html;

  frame.addEventListener('load', () => {
    // Setup text selection listener on the iframe's document
    setupTextSelection(frame);
  });

  vp.appendChild(frame);
}

// ── Utilities ───────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Toolbar button handlers
  inspectBtn()?.addEventListener('click', () => setInspectMode(!state.inspectMode));
  textSelectBtn()?.addEventListener('click', () => setTextSelectMode(!state.textSelectMode));

  // Overlay handlers
  const overlay = inspectOverlay();
  if (overlay) {
    overlay.addEventListener('mousemove', handleOverlayMouseMove);
    overlay.addEventListener('click', handleOverlayClick);
  }

  // Initial render
  render();
});
