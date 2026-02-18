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

## Key Files to Modify (v3 Update)

The v3 update focuses on two frontend files. Backend is unchanged.

### Frontend (v3 changes)

| File | Changes |
|------|---------|
| `frontend/src/components/SessionCard.tsx` | **MODIFY**: Files panel renders on LEFT side of terminal; Git/Preview panels render on RIGHT side |
| `frontend/src/components/DiffViewer.tsx` | **MODIFY**: Changed files in vertical sidebar (not horizontal tabs); batch commenting (Add Comment + Submit All) |

### Frontend (v1/v2 — unchanged)

| File | Status |
|------|--------|
| `frontend/src/components/FileTree.tsx` | Unchanged |
| `frontend/src/components/FileViewer.tsx` | Unchanged |
| `frontend/src/components/LivePreview.tsx` | Unchanged |
| `frontend/src/components/SessionGrid.tsx` | Unchanged |
| `frontend/src/components/TerminalView.tsx` | Unchanged |
| `frontend/src/hooks/usePanel.ts` | Unchanged |
| `frontend/src/services/api.ts` | Unchanged |
| `frontend/src/utils/diff-parser.ts` | Unchanged |

### Backend (unchanged)

All backend files remain unchanged. No schema changes, no API changes.

### Tests (unchanged)

| File | Status |
|------|--------|
| `frontend/tests/unit/diff-parser.test.ts` | Unchanged — all 10 tests still pass |
| All backend tests | Unchanged — all 88 tests still pass |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview (v3 Update)

```
┌──────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SessionCard (1-view mode)                          │  │
│  │                                                      │  │
│  │  Files mode (panel on LEFT):                         │  │
│  │  ┌────────────────────────┬───────────────────────┐ │  │
│  │  │  Files Panel            │  Terminal              │ │  │
│  │  │  ┌─────────┬──────────┐│  (xterm.js)            │ │  │
│  │  │  │FileTree │FileViewer││                         │ │  │
│  │  │  │(narrow) │(Monaco)  ││                         │ │  │
│  │  │  └─────────┴──────────┘│                         │ │  │
│  │  └────────────────────────┴───────────────────────┘ │  │
│  │                                                      │  │
│  │  Git mode (panel on RIGHT):                          │  │
│  │  ┌───────────────────────┬────────────────────────┐ │  │
│  │  │  Terminal              │  Git Panel              │ │  │
│  │  │  (xterm.js)            │  ┌────────┬───────────┐│ │  │
│  │  │                         │  │File    │Side-by-   ││ │  │
│  │  │                         │  │Sidebar │Side Diff  ││ │  │
│  │  │                         │  │(vert.) │+ comments ││ │  │
│  │  │                         │  └────────┴───────────┘│ │  │
│  │  └───────────────────────┴────────────────────────┘ │  │
│  │                                                      │  │
│  │  Preview mode (panel on RIGHT):                      │  │
│  │  ┌───────────────────────┬────────────────────────┐ │  │
│  │  │  Terminal              │  Preview Panel          │ │  │
│  │  │  (xterm.js)            │  [iframe]               │ │  │
│  │  └───────────────────────┴────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  REST API calls               WebSocket events            │
│    ↕                            ↕                         │
└───────────────────────────────────────────────────────────┘
         │                             │
         ↓                             ↓
┌───────────────────────────────────────────────────────────┐
│  Backend (Express + WS) — UNCHANGED in v3                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐           │
│  │ Panel    │  │ Comment   │  │ File/Git/    │           │
│  │ State    │  │ CRUD +    │  │ Port APIs    │           │
│  │ API      │  │ Delivery  │  │ (existing)   │           │
│  └────┬─────┘  └────┬──────┘  └──────────────┘           │
│       │              │                                     │
│       ↓              ↓                                     │
│  ┌──────────────────────────┐                             │
│  │  SQLite (better-sqlite3) │                             │
│  │  panel_states | comments │                             │
│  └──────────────────────────┘                             │
└───────────────────────────────────────────────────────────┘
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
