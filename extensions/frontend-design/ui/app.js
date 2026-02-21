/**
 * Frontend Design Extension — app.js
 * Gallery view of agent-generated screens with inspect & comment.
 */

// ── State ───────────────────────────────────────────────────────────────
const state = {
  screens: [],          // { name, html, updatedAt }
  openScreen: null,     // name of currently opened screen (full view) or null (gallery)
  inspectMode: false,
  comments: [],         // { id, screen, element, elementDesc, rect, text, stale }
  nextCommentId: 1,
};

// ── DOM refs ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

// ── postMessage bridge ──────────────────────────────────────────────────
let initialized = false;

function sendToHost(msg) {
  window.parent.postMessage(msg, '*');
}

window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object' || !e.data.type) return;
  const { type, command, params } = e.data;

  if (type === 'init') { initialized = true; return; }
  if (type === 'ping') { sendToHost({ type: 'ready' }); return; }
  if (type === 'board-command') handleBoardCommand(command, params || {});
});

// Signal ready (retry until host responds with init)
function sendReady() { if (!initialized) sendToHost({ type: 'ready' }); }
sendReady();
const readyInterval = setInterval(() => {
  if (initialized) { clearInterval(readyInterval); return; }
  sendReady();
}, 500);

// ── Board command handlers ──────────────────────────────────────────────
function handleBoardCommand(command, params) {
  switch (command) {
    case 'design.add_screen': addScreen(params.name, params.html); break;
    case 'design.update_screen': updateScreen(params.name, params.html); break;
    case 'design.remove_screen': removeScreen(params.name); break;
    case 'enable-inspect':
      if (params.screen) openScreen(params.screen);
      setInspectMode(true);
      break;
    case 'enable-text-select':
      if (params.screen) openScreen(params.screen);
      break;
  }
}

// ── Screen management ───────────────────────────────────────────────────
function addScreen(name, html) {
  if (!name || !html) return;
  const existing = state.screens.find((s) => s.name === name);
  if (existing) {
    existing.html = html;
    existing.updatedAt = Date.now();
    markStaleComments(name);
  } else {
    state.screens.push({ name, html, updatedAt: Date.now() });
  }
  render();
}

function updateScreen(name, html) {
  const screen = state.screens.find((s) => s.name === name);
  if (!screen) return;
  screen.html = html;
  screen.updatedAt = Date.now();
  markStaleComments(name);
  render();
}

function removeScreen(name) {
  const idx = state.screens.findIndex((s) => s.name === name);
  if (idx === -1) return;
  state.screens.splice(idx, 1);
  state.comments = state.comments.filter((c) => c.screen !== name);
  if (state.openScreen === name) state.openScreen = null;
  render();
}

function openScreen(name) {
  if (state.screens.find((s) => s.name === name)) {
    state.openScreen = name;
    state.inspectMode = false;
    render();
  }
}

function backToGallery() {
  state.openScreen = null;
  state.inspectMode = false;
  clearInspectState();
  render();
}

// ── Inspect mode ────────────────────────────────────────────────────────
let highlightEl = null;
let hoveredEl = null;
let popoverEl = null;

function setInspectMode(on) {
  state.inspectMode = on;
  if (!on) clearInspectState();
  render();
}

function clearInspectState() {
  if (highlightEl) { highlightEl.remove(); highlightEl = null; }
  if (popoverEl) { popoverEl.remove(); popoverEl = null; }
  hoveredEl = null;
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').trim().slice(0, 40);
  const role = el.getAttribute('role') || '';
  let desc = `<${tag}>`;
  if (el.id) desc += `#${el.id}`;
  if (el.className && typeof el.className === 'string') desc += `.${el.className.trim().split(/\s+/).join('.')}`;
  if (text) desc += ` "${text}"`;
  if (role) desc += ` (role: ${role})`;
  return desc;
}

function setupInspectHandlers(container) {
  if (!container) return;

  container.addEventListener('mousemove', (e) => {
    if (!state.inspectMode) return;
    const target = e.target;
    if (!target || target === container || target.classList?.contains('comment-pin')) return;
    hoveredEl = target;

    // Draw highlight
    if (!highlightEl) {
      highlightEl = document.createElement('div');
      highlightEl.className = 'highlight-box';
      container.style.position = 'relative';
      container.appendChild(highlightEl);
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = target.getBoundingClientRect();
    highlightEl.style.left = (elRect.left - containerRect.left) + 'px';
    highlightEl.style.top = (elRect.top - containerRect.top) + 'px';
    highlightEl.style.width = elRect.width + 'px';
    highlightEl.style.height = elRect.height + 'px';
    highlightEl.style.display = 'block';
  });

  container.addEventListener('mouseleave', () => {
    if (highlightEl) highlightEl.style.display = 'none';
    hoveredEl = null;
  });

  container.addEventListener('click', (e) => {
    if (!state.inspectMode || !hoveredEl) return;
    if (e.target.closest('.comment-popover') || e.target.closest('.comment-pin')) return;
    e.preventDefault();
    e.stopPropagation();
    showCommentPopover(hoveredEl, container);
  });

  // Text selection → send
  container.addEventListener('mouseup', () => {
    if (state.inspectMode) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    // Remove old selection button
    container.querySelectorAll('.selection-btn').forEach(b => b.remove());
    if (text && text.length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const btn = document.createElement('button');
      btn.className = 'selection-btn';
      btn.textContent = 'Send Selection';
      btn.style.left = (rect.left - containerRect.left) + 'px';
      btn.style.top = (rect.bottom - containerRect.top + 4) + 'px';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        sendToHost({
          type: 'send-comment',
          text: `[Design Review — Screen: "${state.openScreen}"] Selected text: "${text}"`,
          context: { source: 'frontend-design', screen: state.openScreen, selectedText: text },
        });
        btn.remove();
      });
      container.appendChild(btn);
    }
  });
}

function showCommentPopover(element, container) {
  if (popoverEl) popoverEl.remove();
  const desc = describeElement(element);
  const containerRect = container.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();

  popoverEl = document.createElement('div');
  popoverEl.className = 'comment-popover';
  const left = Math.max(4, Math.min(elRect.left - containerRect.left, container.offsetWidth - 270));
  popoverEl.style.left = left + 'px';
  popoverEl.style.top = (elRect.bottom - containerRect.top + 4) + 'px';
  popoverEl.innerHTML = `
    <div class="comment-element-label">${esc(desc)}</div>
    <textarea placeholder="Add your comment..." autofocus></textarea>
    <div class="comment-popover-actions">
      <button class="comment-popover-btn cancel">Cancel</button>
      <button class="comment-popover-btn primary send">Send</button>
    </div>
  `;
  popoverEl.querySelector('.cancel').onclick = () => { popoverEl.remove(); popoverEl = null; };
  popoverEl.querySelector('.send').onclick = () => {
    const text = popoverEl.querySelector('textarea').value.trim();
    if (!text) return;

    const rect = element.getBoundingClientRect();
    state.comments.push({
      id: state.nextCommentId++,
      screen: state.openScreen,
      element: element,
      elementDesc: desc,
      rect: { left: rect.left - containerRect.left, top: rect.top - containerRect.top, width: rect.width, height: rect.height },
      text,
      stale: false,
    });

    sendToHost({
      type: 'send-comment',
      text: `[Design Review — Screen: "${state.openScreen}"] Element: ${desc}\nComment: ${text}`,
      context: { source: 'frontend-design', screen: state.openScreen, element: desc },
    });
    popoverEl.remove();
    popoverEl = null;
    renderPins(container);
  };
  setTimeout(() => popoverEl?.querySelector('textarea')?.focus(), 0);
  container.appendChild(popoverEl);
}

// ── Comment pins ────────────────────────────────────────────────────────
function renderPins(container) {
  if (!container) return;
  container.querySelectorAll('.comment-pin, .pin-tooltip').forEach(p => p.remove());
  const screenComments = state.comments.filter(c => c.screen === state.openScreen);
  const containerRect = container.getBoundingClientRect();

  screenComments.forEach((comment, i) => {
    // Try to re-query the element position
    let rect = comment.rect;
    if (comment.element && document.contains(comment.element)) {
      const r = comment.element.getBoundingClientRect();
      rect = { left: r.left - containerRect.left, top: r.top - containerRect.top, width: r.width, height: r.height };
    }

    const pin = document.createElement('div');
    pin.className = 'comment-pin' + (comment.stale ? ' stale' : '');
    pin.textContent = String(i + 1);
    pin.style.left = (rect.left + rect.width / 2 - 10) + 'px';
    pin.style.top = (rect.top - 10) + 'px';
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle tooltip
      const existing = container.querySelector('.pin-tooltip');
      if (existing) existing.remove();
      const tip = document.createElement('div');
      tip.className = 'pin-tooltip';
      tip.style.left = (parseInt(pin.style.left) + 24) + 'px';
      tip.style.top = pin.style.top;
      tip.innerHTML = `
        <div class="pin-element">${esc(comment.elementDesc)}</div>
        <div class="pin-text">${esc(comment.text)}</div>
        ${comment.stale ? '<div class="pin-stale-notice">Element may have changed</div>' : ''}
      `;
      container.appendChild(tip);
      setTimeout(() => document.addEventListener('click', () => tip.remove(), { once: true }), 0);
    });
    container.appendChild(pin);
  });
}

function markStaleComments(screenName) {
  state.comments.filter(c => c.screen === screenName).forEach(c => {
    if (c.element && !document.contains(c.element)) c.stale = true;
  });
}

// ── Render ──────────────────────────────────────────────────────────────
function render() {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '';

  if (state.openScreen) {
    renderFullView(app);
  } else {
    renderGallery(app);
  }
}

function renderGallery(app) {
  // Header
  const header = el('div', 'gallery-header');
  header.innerHTML = `<span class="gallery-title">Screens</span><span class="gallery-count">${state.screens.length}</span>`;
  app.appendChild(header);

  if (state.screens.length === 0) {
    const ph = el('div', 'placeholder');
    ph.innerHTML = `
      <div class="placeholder-icon">&#x1f3a8;</div>
      <div class="placeholder-text">Waiting for designs...</div>
      <div class="placeholder-hint">Use /design-add-screen to add screens</div>
    `;
    app.appendChild(ph);
    return;
  }

  const grid = el('div', 'gallery-grid');
  for (const screen of state.screens) {
    const card = el('div', 'gallery-card');
    const commentCount = state.comments.filter(c => c.screen === screen.name).length;

    // Preview thumbnail (info bar is overlaid inside preview)
    const preview = el('div', 'card-preview');
    const frame = document.createElement('iframe');
    frame.srcdoc = screen.html;
    frame.sandbox = 'allow-scripts';
    frame.className = 'card-frame';
    frame.setAttribute('scrolling', 'no');
    preview.appendChild(frame);
    // Name/badge overlay at bottom of preview
    const info = el('div', 'card-info');
    info.innerHTML = `
      <span class="card-name">${esc(screen.name)}</span>
      ${commentCount > 0 ? `<span class="card-badge">${commentCount} comment${commentCount > 1 ? 's' : ''}</span>` : ''}
    `;
    preview.appendChild(info);
    // Click overlay
    const overlay = el('div', 'card-overlay');
    overlay.innerHTML = '<span>Click to open</span>';
    overlay.addEventListener('click', () => openScreen(screen.name));
    preview.appendChild(overlay);
    card.appendChild(preview);

    grid.appendChild(card);
  }
  app.appendChild(grid);
}

function renderFullView(app) {
  const screen = state.screens.find(s => s.name === state.openScreen);
  if (!screen) { backToGallery(); return; }

  // Toolbar
  const toolbar = el('div', 'toolbar');
  toolbar.innerHTML = `
    <button class="toolbar-btn back-btn" id="btn-back">&#x2190; Back</button>
    <span class="toolbar-label">${esc(screen.name)}</span>
    <div class="toolbar-spacer"></div>
    <button id="btn-inspect" class="toolbar-btn ${state.inspectMode ? 'active' : ''}">&#x1f50d; Inspect</button>
  `;
  app.appendChild(toolbar);

  toolbar.querySelector('#btn-back').addEventListener('click', backToGallery);
  toolbar.querySelector('#btn-inspect').addEventListener('click', () => setInspectMode(!state.inspectMode));

  // Content container — render HTML directly for inspect access
  const content = el('div', 'full-view');
  if (state.inspectMode) content.classList.add('inspect-active');
  content.style.position = 'relative';

  // Render screen HTML into shadow DOM for style isolation
  const wrapper = el('div', 'screen-content');
  const shadow = wrapper.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>:host { display: block; width: 100%; min-height: 100%; background: white; color: black; }</style>${screen.html}`;
  content.appendChild(wrapper);
  app.appendChild(content);

  // Setup inspect handlers on shadow root content
  if (state.inspectMode) {
    // We need to intercept events on the shadow content
    // Shadow DOM events retarget, so we listen on the wrapper
    setupShadowInspect(shadow, content, wrapper);
  }

  // Render comment pins
  setTimeout(() => renderShadowPins(shadow, content), 50);
}

function setupShadowInspect(shadow, container, wrapper) {
  let localHighlight = null;
  let localHovered = null;

  shadow.addEventListener('mousemove', (e) => {
    if (!state.inspectMode) return;
    const target = e.composedPath()[0];
    if (!target || target === shadow || target.nodeType !== 1) return;
    localHovered = target;

    if (!localHighlight) {
      localHighlight = document.createElement('div');
      localHighlight.className = 'highlight-box';
      container.appendChild(localHighlight);
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = target.getBoundingClientRect();
    localHighlight.style.left = (elRect.left - containerRect.left) + 'px';
    localHighlight.style.top = (elRect.top - containerRect.top) + 'px';
    localHighlight.style.width = elRect.width + 'px';
    localHighlight.style.height = elRect.height + 'px';
    localHighlight.style.display = 'block';
  });

  wrapper.addEventListener('mouseleave', () => {
    if (localHighlight) localHighlight.style.display = 'none';
    localHovered = null;
  });

  shadow.addEventListener('click', (e) => {
    if (!state.inspectMode || !localHovered) return;
    if (e.composedPath()[0].closest?.('.comment-popover')) return;
    e.preventDefault();
    e.stopPropagation();
    showCommentPopover(localHovered, container);
  });

  // Text selection
  shadow.addEventListener('mouseup', () => {
    if (state.inspectMode) return;
    const sel = shadow.getSelection ? shadow.getSelection() : window.getSelection();
    const text = sel?.toString().trim();
    container.querySelectorAll('.selection-btn').forEach(b => b.remove());
    if (text && text.length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const btn = document.createElement('button');
      btn.className = 'selection-btn';
      btn.textContent = 'Send Selection';
      btn.style.left = (rect.left - containerRect.left) + 'px';
      btn.style.top = (rect.bottom - containerRect.top + 4) + 'px';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        sendToHost({
          type: 'send-comment',
          text: `[Design Review — Screen: "${state.openScreen}"] Selected text: "${text}"`,
          context: { source: 'frontend-design', screen: state.openScreen, selectedText: text },
        });
        btn.remove();
      });
      container.appendChild(btn);
    }
  });
}

function renderShadowPins(shadow, container) {
  container.querySelectorAll('.comment-pin, .pin-tooltip').forEach(p => p.remove());
  const screenComments = state.comments.filter(c => c.screen === state.openScreen);
  const containerRect = container.getBoundingClientRect();

  screenComments.forEach((comment, i) => {
    let rect = comment.rect;
    if (comment.element && shadow.contains ? false : document.contains(comment.element)) {
      const r = comment.element.getBoundingClientRect();
      rect = { left: r.left - containerRect.left, top: r.top - containerRect.top, width: r.width, height: r.height };
    }

    const pin = document.createElement('div');
    pin.className = 'comment-pin' + (comment.stale ? ' stale' : '');
    pin.textContent = String(i + 1);
    pin.style.left = (rect.left + rect.width / 2 - 10) + 'px';
    pin.style.top = (rect.top - 10) + 'px';
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.pin-tooltip').forEach(t => t.remove());
      const tip = document.createElement('div');
      tip.className = 'pin-tooltip';
      tip.style.left = (parseInt(pin.style.left) + 24) + 'px';
      tip.style.top = pin.style.top;
      tip.innerHTML = `
        <div class="pin-element">${esc(comment.elementDesc)}</div>
        <div class="pin-text">${esc(comment.text)}</div>
        ${comment.stale ? '<div class="pin-stale-notice">Element may have changed</div>' : ''}
      `;
      container.appendChild(tip);
      setTimeout(() => document.addEventListener('click', () => tip.remove(), { once: true }), 0);
    });
    container.appendChild(pin);
  });
}

// ── Utilities ───────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => render());
