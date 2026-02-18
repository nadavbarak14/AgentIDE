# Quickstart: IDE Panels

**Feature Branch**: `002-ide-panels` | **Date**: 2026-02-18

## Prerequisites

- Feature 001 (C3 Dashboard) must be fully implemented
- Node.js 20 LTS
- npm workspaces configured (already done in root package.json)

## Setup

```bash
# Checkout the feature branch
git checkout 002-ide-panels

# Install dependencies (from repo root)
npm install

# Run database migration (schema additions for panel_states and comments tables)
# The migration runs automatically on server start via db.ts initialization
```

## Development

```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend

# Open browser to http://localhost:5173
```

## Testing

```bash
# Run all tests
npm test

# Run only backend tests
npm test --workspace=backend

# Run only frontend tests
npm test --workspace=frontend

# Run system tests (requires running server)
npm run test:system --workspace=frontend
```

## Key Files to Modify

### Backend

| File | Changes |
|------|---------|
| `backend/src/models/db.ts` | Add `panel_states` and `comments` table creation |
| `backend/src/models/types.ts` | Add `PanelState` and `Comment` interfaces |
| `backend/src/models/repository.ts` | Add panel state and comment CRUD methods |
| `backend/src/api/routes/sessions.ts` | Add panel-state and comments endpoints |
| `backend/src/services/session-manager.ts` | Deliver pending comments on session activation |

### Frontend

| File | Changes |
|------|---------|
| `frontend/src/components/SessionCard.tsx` | Add panel layout, 1-view mode toolbar, resizable split |
| `frontend/src/components/SessionGrid.tsx` | Pass `isSingleView` prop to SessionCard |
| `frontend/src/components/FileTree.tsx` | Add lazy loading, search filter, live updates from WebSocket |
| `frontend/src/components/FileViewer.tsx` | Replace `<pre>` with Monaco Editor, add tabbed UI, live reload |
| `frontend/src/components/DiffViewer.tsx` | Add line selection, comment UI, comment status display |
| `frontend/src/components/LivePreview.tsx` | Add auto-detection, manual URL input, "Open in new tab" fallback |
| `frontend/src/hooks/usePanel.ts` | New hook for panel state management and persistence |
| `frontend/src/services/api.ts` | Add panel state and comment API methods |

### Tests

| File | Changes |
|------|---------|
| `backend/tests/unit/panel-state.test.ts` | Panel state CRUD operations |
| `backend/tests/unit/comments.test.ts` | Comment CRUD and delivery logic |
| `backend/tests/integration/ide-panels.test.ts` | Panel state + comment integration |
| `frontend/tests/unit/usePanel.test.ts` | Panel state hook logic |
| `frontend/tests/unit/FileViewer.test.tsx` | Monaco editor, tabs, live reload |
| `frontend/tests/unit/DiffViewer.test.tsx` | Line selection, comment UI |
| `frontend/tests/system/ide-panels.test.ts` | End-to-end panel workflows |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Browser (Frontend)                              │
│  ┌──────────────────────────────────────────┐   │
│  │  SessionCard (1-view mode)                │   │
│  │  ┌───────────────┬──────────────────────┐│   │
│  │  │  Terminal      │  Side Panel          ││   │
│  │  │  (xterm.js)    │  ┌────────────────┐ ││   │
│  │  │               │  │ Files / Git /   │ ││   │
│  │  │               │  │ Preview         │ ││   │
│  │  │               │  │                │ ││   │
│  │  │               │  │ [Monaco Editor]│ ││   │
│  │  │               │  │ [Diff + Cmts]  │ ││   │
│  │  │               │  │ [iframe]       │ ││   │
│  │  │               │  └────────────────┘ ││   │
│  │  └───────────────┴──────────────────────┘│   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  REST API calls          WebSocket events        │
│    ↕                       ↕                     │
└──────────────────────────────────────────────────┘
         │                       │
         ↓                       ↓
┌─────────────────────────────────────────────────┐
│  Backend (Express + WS)                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Panel    │  │ Comment   │  │ File/Git/    │ │
│  │ State    │  │ CRUD +    │  │ Port APIs    │ │
│  │ API      │  │ Delivery  │  │ (existing)   │ │
│  └────┬─────┘  └────┬──────┘  └──────────────┘ │
│       │              │                           │
│       ↓              ↓                           │
│  ┌──────────────────────────┐                   │
│  │  SQLite (better-sqlite3) │                   │
│  │  panel_states | comments │                   │
│  └──────────────────────────┘                   │
└─────────────────────────────────────────────────┘
```
