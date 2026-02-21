/**
 * Slide Deck Extension — app.js
 * PowerPoint-style slide editor with filmstrip, canvas, notes & presenter mode.
 */

// ── State ───────────────────────────────────────────────────────────────
const state = {
  slides: [],          // { id, name, html, notes, updatedAt }
  activeSlide: null,   // id of currently selected slide
  presenting: false,
  nextId: 1,
};

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

function sendReady() { if (!initialized) sendToHost({ type: 'ready' }); }
sendReady();
const readyInterval = setInterval(() => {
  if (initialized) { clearInterval(readyInterval); return; }
  sendReady();
}, 500);

// ── Board command handlers ──────────────────────────────────────────────
function handleBoardCommand(command, params) {
  switch (command) {
    case 'slides.add_slide':    addSlide(params.name, params.html, params.notes); break;
    case 'slides.update_slide': updateSlide(params.name, params.html, params.notes); break;
    case 'slides.remove_slide': removeSlide(params.name); break;
    case 'slides.reorder_slides': reorderSlides(params.order); break;
    case 'slides.export_pptx':  exportNotification(); break;
  }
}

// ── Slide management ────────────────────────────────────────────────────
function addSlide(name, html, notes) {
  if (!name || !html) return;
  const existing = state.slides.find(s => s.name === name);
  if (existing) {
    existing.html = html;
    if (notes !== undefined) existing.notes = notes || '';
    existing.updatedAt = Date.now();
  } else {
    const slide = { id: state.nextId++, name, html, notes: notes || '', updatedAt: Date.now() };
    state.slides.push(slide);
    state.activeSlide = slide.id;
  }
  render();
}

function updateSlide(name, html, notes) {
  const slide = state.slides.find(s => s.name === name);
  if (!slide) return;
  if (html) slide.html = html;
  if (notes !== undefined) slide.notes = notes;
  slide.updatedAt = Date.now();
  render();
}

function removeSlide(name) {
  const idx = state.slides.findIndex(s => s.name === name);
  if (idx === -1) return;
  const removed = state.slides.splice(idx, 1)[0];
  if (state.activeSlide === removed.id) {
    state.activeSlide = state.slides.length > 0
      ? state.slides[Math.min(idx, state.slides.length - 1)].id
      : null;
  }
  render();
}

function reorderSlides(order) {
  if (!Array.isArray(order)) return;
  const map = new Map(state.slides.map(s => [s.name, s]));
  const reordered = [];
  for (const name of order) {
    const s = map.get(name);
    if (s) reordered.push(s);
  }
  // Append any slides not in order list
  for (const s of state.slides) {
    if (!reordered.includes(s)) reordered.push(s);
  }
  state.slides = reordered;
  render();
}

function exportNotification() {
  // Visual feedback — export is handled by the skill script
  const app = $('#app');
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#a6e3a1;color:#1e1e2e;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;z-index:9999;';
  toast.textContent = 'Export triggered — check terminal';
  app.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function selectSlide(id) {
  state.activeSlide = id;
  render();
}

// ── Presenter mode ──────────────────────────────────────────────────────
function startPresenter() {
  if (state.slides.length === 0) return;
  if (!state.activeSlide) state.activeSlide = state.slides[0].id;
  state.presenting = true;
  render();
}

function stopPresenter() {
  state.presenting = false;
  render();
}

function presenterNav(delta) {
  const idx = state.slides.findIndex(s => s.id === state.activeSlide);
  const next = idx + delta;
  if (next >= 0 && next < state.slides.length) {
    state.activeSlide = state.slides[next].id;
    render();
  }
}

// ── Drag & drop reorder ─────────────────────────────────────────────────
let dragSrcId = null;

function onDragStart(e, id) {
  dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e, targetId) {
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcId === null || dragSrcId === targetId) return;
  const srcIdx = state.slides.findIndex(s => s.id === dragSrcId);
  const tgtIdx = state.slides.findIndex(s => s.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const [moved] = state.slides.splice(srcIdx, 1);
  state.slides.splice(tgtIdx, 0, moved);
  dragSrcId = null;
  render();
}

// ── Keyboard shortcuts (presenter) ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (!state.presenting) return;
  if (e.key === 'Escape') { stopPresenter(); return; }
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); presenterNav(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); presenterNav(-1); }
});

// ── Render ──────────────────────────────────────────────────────────────
function render() {
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '';

  if (state.presenting) { renderPresenter(app); return; }
  if (state.slides.length === 0) { renderEmpty(app); return; }

  renderToolbar(app);

  const main = el('div', 'main');

  // Slide strip
  const strip = el('div', 'slide-strip');
  state.slides.forEach((slide, i) => {
    const thumb = el('div', 'strip-thumb' + (slide.id === state.activeSlide ? ' active' : ''));
    thumb.draggable = true;
    thumb.addEventListener('click', () => selectSlide(slide.id));
    thumb.addEventListener('dragstart', (e) => onDragStart(e, slide.id));
    thumb.addEventListener('dragover', onDragOver);
    thumb.addEventListener('dragleave', onDragLeave);
    thumb.addEventListener('drop', (e) => onDrop(e, slide.id));

    const frame = document.createElement('iframe');
    frame.srcdoc = slide.html;
    frame.sandbox = 'allow-scripts';
    frame.className = 'strip-frame';
    frame.setAttribute('scrolling', 'no');
    thumb.appendChild(frame);

    const num = el('span', 'strip-num');
    num.textContent = String(i + 1);
    thumb.appendChild(num);

    const del = el('button', 'strip-delete');
    del.textContent = '\u00d7';
    del.title = 'Remove slide';
    del.addEventListener('click', (e) => { e.stopPropagation(); removeSlide(slide.name); });
    thumb.appendChild(del);

    strip.appendChild(thumb);
  });
  main.appendChild(strip);

  // Canvas area
  const active = state.slides.find(s => s.id === state.activeSlide);
  const canvasCol = el('div', '');
  canvasCol.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';

  if (active) {
    const canvas = el('div', 'canvas-area');
    const wrapper = el('div', 'slide-wrapper');
    const frame = document.createElement('iframe');
    frame.srcdoc = active.html;
    frame.sandbox = 'allow-scripts';
    frame.className = 'slide-frame';
    wrapper.appendChild(frame);
    canvas.appendChild(wrapper);
    canvasCol.appendChild(canvas);

    // Notes bar
    if (active.notes) {
      const notesBar = el('div', 'notes-bar');
      notesBar.innerHTML = `<div class="notes-label">Speaker Notes</div><div class="notes-text">${esc(active.notes)}</div>`;
      canvasCol.appendChild(notesBar);
    }
  }

  main.appendChild(canvasCol);
  app.appendChild(main);
}

function renderToolbar(app) {
  const active = state.slides.find(s => s.id === state.activeSlide);
  const toolbar = el('div', 'toolbar');
  toolbar.innerHTML = `
    <span class="toolbar-title">Slides</span>
    <span class="toolbar-count">${state.slides.length}</span>
    <div class="toolbar-spacer"></div>
    ${active ? `<span style="font-size:11px;color:var(--text-muted);margin-right:4px;">${esc(active.name)}</span>` : ''}
    <button class="toolbar-btn" id="btn-present" title="Present (fullscreen)">&#x25B6; Present</button>
    <button class="toolbar-btn" id="btn-comment" title="Send feedback to Claude">&#x1F4AC; Comment</button>
  `;
  app.appendChild(toolbar);

  toolbar.querySelector('#btn-present').addEventListener('click', startPresenter);
  toolbar.querySelector('#btn-comment').addEventListener('click', () => {
    if (!active) return;
    sendToHost({
      type: 'send-comment',
      text: `[Slide Deck — Slide: "${active.name}" (#${state.slides.indexOf(active) + 1}/${state.slides.length})] Please review this slide and suggest improvements.`,
      context: { source: 'powerpoint-slides', slide: active.name },
    });
  });
}

function renderEmpty(app) {
  const ph = el('div', 'placeholder');
  ph.innerHTML = `
    <div class="placeholder-icon">&#x1F4CA;</div>
    <div class="placeholder-text">No slides yet</div>
    <div class="placeholder-hint">Use /slides-add-slide to create slides</div>
  `;
  app.appendChild(ph);
}

function renderPresenter(app) {
  const active = state.slides.find(s => s.id === state.activeSlide);
  if (!active) { stopPresenter(); return; }
  const idx = state.slides.indexOf(active);

  const overlay = el('div', 'presenter-overlay');
  const frame = document.createElement('iframe');
  frame.srcdoc = active.html;
  frame.sandbox = 'allow-scripts';
  frame.className = 'slide-frame';
  overlay.appendChild(frame);

  const controls = el('div', 'presenter-controls');
  controls.innerHTML = `
    <button class="presenter-btn" id="pres-prev">&#x2190; Prev</button>
    <span class="presenter-counter">${idx + 1} / ${state.slides.length}</span>
    <button class="presenter-btn" id="pres-next">Next &#x2192;</button>
    <button class="presenter-btn" id="pres-exit">&#x2715; Exit</button>
  `;
  overlay.appendChild(controls);
  app.appendChild(overlay);

  overlay.querySelector('#pres-prev').addEventListener('click', () => presenterNav(-1));
  overlay.querySelector('#pres-next').addEventListener('click', () => presenterNav(1));
  overlay.querySelector('#pres-exit').addEventListener('click', stopPresenter);
}

// ── Utilities ───────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

document.addEventListener('DOMContentLoaded', () => render());
