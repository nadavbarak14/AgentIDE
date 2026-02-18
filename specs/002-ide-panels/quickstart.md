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

## Key Files to Modify (v2 Update)

The v2 update focuses on three frontend files. Backend is unchanged.

### Frontend (v2 changes)

| File | Changes |
|------|---------|
| `frontend/src/components/DiffViewer.tsx` | **REWRITE**: Side-by-side two-column diff, rewrite `parseDiff()` for paired lines, gutter "+" icon, inline comment on click |
| `frontend/src/components/SessionCard.tsx` | **MODIFY**: Files panel renders tree + editor side-by-side (tree always visible on left) |

### Frontend (v1 — unchanged)

| File | Status |
|------|--------|
| `frontend/src/components/FileTree.tsx` | Unchanged — works as-is within new layout |
| `frontend/src/components/FileViewer.tsx` | Unchanged — works as-is within new layout |
| `frontend/src/components/LivePreview.tsx` | Unchanged |
| `frontend/src/components/SessionGrid.tsx` | Unchanged |
| `frontend/src/components/TerminalView.tsx` | Unchanged |
| `frontend/src/hooks/usePanel.ts` | Unchanged |
| `frontend/src/services/api.ts` | Unchanged |

### Backend (v1 — unchanged)

All backend files remain unchanged. The diff API returns raw unified diff text from `git diff`, which the frontend now parses into side-by-side format.

### Tests (v2 additions)

| File | Changes |
|------|---------|
| `frontend/tests/unit/diff-parser.test.ts` | **NEW**: Unit tests for side-by-side diff parser |
| All existing tests | Unchanged — must still pass |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview (v2 Update)

```
┌──────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SessionCard (1-view mode)                          │  │
│  │  ┌───────────────┬────────────────────────────────┐│  │
│  │  │  Terminal      │  Side Panel                    ││  │
│  │  │  (xterm.js)    │                                ││  │
│  │  │               │  Files mode:                   ││  │
│  │  │               │  ┌─────────┬──────────────┐   ││  │
│  │  │               │  │FileTree │ FileViewer    │   ││  │
│  │  │               │  │(narrow) │ (Monaco tabs) │   ││  │
│  │  │               │  └─────────┴──────────────┘   ││  │
│  │  │               │                                ││  │
│  │  │               │  Git mode:                     ││  │
│  │  │               │  ┌────────────┬───────────┐   ││  │
│  │  │               │  │Old (left)  │New (right)│   ││  │
│  │  │               │  │ gutter [+] │ gutter [+]│   ││  │
│  │  │               │  │ inline comments         │   ││  │
│  │  │               │  └────────────┴───────────┘   ││  │
│  │  │               │                                ││  │
│  │  │               │  Preview mode: [iframe]        ││  │
│  │  └───────────────┴────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  REST API calls               WebSocket events            │
│    ↕                            ↕                         │
└───────────────────────────────────────────────────────────┘
         │                             │
         ↓                             ↓
┌───────────────────────────────────────────────────────────┐
│  Backend (Express + WS) — UNCHANGED in v2                  │
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
