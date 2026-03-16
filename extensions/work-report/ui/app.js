/**
 * Work Report Extension — app.js
 * Renders the agent's HTML work report from report.html in the session directory.
 */

// ── State ───────────────────────────────────────────────────────────────
const state = {
  sessionId: null,
  hasReport: false,
  refreshCounter: 0,
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
  const { type, command, params, sessionId, extensionName } = e.data;

  if (type === 'init') {
    initialized = true;
    state.sessionId = sessionId;
    loadReport();
    return;
  }
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
    case 'report.file_changed':
      loadReport();
      break;
  }
}

// ── Report loading ──────────────────────────────────────────────────────
async function loadReport() {
  if (!state.sessionId) return;

  const url = `/api/sessions/${state.sessionId}/serve/report.html`;

  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      state.hasReport = true;
      state.refreshCounter++;
      render();
    } else {
      state.hasReport = false;
      render();
    }
  } catch {
    state.hasReport = false;
    render();
  }
}

// ── Render ──────────────────────────────────────────────────────────────
function render() {
  const app = $('#app');
  if (!app) return;

  if (!state.hasReport) {
    app.innerHTML = renderEmptyState();
    return;
  }

  // Render report in an iframe, with cache-busting query param for refresh
  const reportUrl = `/api/sessions/${state.sessionId}/serve/report.html?_r=${state.refreshCounter}`;
  app.innerHTML = `<iframe class="report-frame" src="${reportUrl}" title="Work Report"></iframe>`;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <div class="empty-state-title">No work report yet</div>
      <div class="empty-state-text">The agent will create a report after completing its task to show what was done.</div>
    </div>
  `;
}

// Initial render (empty state until init message arrives)
render();
