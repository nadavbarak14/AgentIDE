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

## Key Files to Modify (v4 Update)

### Frontend (v4 changes)

| File | Changes |
|------|---------|
| `frontend/src/hooks/usePanel.ts` | **MODIFY**: Dual-panel state (leftPanel + rightPanel instead of single activePanel) |
| `frontend/src/components/SessionCard.tsx` | **MODIFY**: Three-column layout, two drag handles, independent panel toggles |
| `frontend/src/components/FileViewer.tsx` | **MODIFY**: Writable Monaco editor, Ctrl+S save, modified indicator |
| `frontend/src/hooks/useTerminal.ts` | **MODIFY**: Load clipboard addon for copy/paste support |
| `frontend/src/services/api.ts` | **ADD**: files.save() method |

### Backend (v4 changes)

| File | Changes |
|------|---------|
| `backend/src/worker/file-reader.ts` | **ADD**: writeFile() function |
| `backend/src/api/routes/files.ts` | **ADD**: PUT endpoint for file save |

### Unchanged

| File | Status |
|------|--------|
| `frontend/src/components/FileTree.tsx` | Unchanged |
| `frontend/src/components/DiffViewer.tsx` | Unchanged |
| `frontend/src/components/LivePreview.tsx` | Unchanged |
| `frontend/src/components/SessionGrid.tsx` | Unchanged |
| `frontend/src/components/TerminalView.tsx` | Unchanged |
| `frontend/src/utils/diff-parser.ts` | Unchanged |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview (v4 Update)

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  SessionCard (1-view mode) — v4 Dual Panel                  │  │
│  │                                                              │  │
│  │  Both Files + Git active (three-column):                     │  │
│  │  ┌──────────────┬───────────────┬───────────────────────┐  │  │
│  │  │ Files Panel   │ Terminal       │ Git Panel             │  │  │
│  │  │ ┌────┬──────┐│ (xterm.js +    │ ┌────────┬──────────┐│  │  │
│  │  │ │Tree│Editor││  clipboard     │ │Sidebar │Diff View ││  │  │
│  │  │ │    │(R/W) ││  addon)        │ │        │+ comments││  │  │
│  │  │ └────┴──────┘│               │ └────────┴──────────┘│  │  │
│  │  └──────────────┴───────────────┴───────────────────────┘  │  │
│  │                                                              │  │
│  │  Files only: [Files | Terminal]                              │  │
│  │  Git only:   [Terminal | Git]                                │  │
│  │  Preview:    [Terminal | Preview]                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  REST API calls (+ PUT files/content)    WebSocket events          │
│    ↕                                       ↕                       │
└────────────────────────────────────────────────────────────────────┘
         │                                    │
         ↓                                    ↓
┌────────────────────────────────────────────────────────────────────┐
│  Backend (Express + WS)                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐           │
│  │ Panel    │  │ Comment   │  │ File/Git/Port APIs   │           │
│  │ State    │  │ CRUD +    │  │ + PUT file save (v4) │           │
│  │ API      │  │ Delivery  │  │                      │           │
│  └────┬─────┘  └────┬──────┘  └──────────────────────┘           │
│       │              │                                             │
│       ↓              ↓                                             │
│  ┌──────────────────────────┐                                     │
│  │  SQLite (better-sqlite3) │                                     │
│  │  panel_states | comments │                                     │
│  └──────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Batch Comment Flow (v3)

```
User clicks "+" on line → Comment box opens
User types comment → Clicks "Add Comment"
  → Comment saved to React state as "Draft"
  → Yellow "Draft" badge shown on diff line
  → User can switch files, add more comments

User clicks "Submit All (3)" button in header
  → For each draft comment:
    → POST /api/sessions/:id/comments
    → Move draft to existingComments with status "pending" or "sent"
  → Clear draftComments state
  → Badge updates to show 0
```
