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

## Key Files to Modify (v7 Update)

### Frontend (v7 changes)

| File | Changes |
|------|---------|
| `frontend/src/components/DiffViewer.tsx` | **MODIFY**: Background diff refresh (no loading spinner on refreshKey change); clear comments from view after "Send All" delivery |

### Backend (v7 changes)

| File | Changes |
|------|---------|
| `backend/src/api/routes/sessions.ts` | **MODIFY**: Delete comments from DB after successful delivery in deliver endpoint |
| `backend/src/models/repository.ts` | **MODIFY**: Add `deleteCommentsByIds()` method (if needed) |

### Unchanged in v7

| File | Status |
|------|--------|
| `frontend/src/components/SessionCard.tsx` | Unchanged (v5 changes complete) |
| `frontend/src/components/SessionGrid.tsx` | Unchanged (v6 changes complete) |
| `frontend/src/pages/Dashboard.tsx` | Unchanged (v6 changes complete) |
| `frontend/src/hooks/usePanel.ts` | Unchanged |
| `backend/src/services/session-manager.ts` | Unchanged (v7 batch format already applied) |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview (v6 Update)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                                    │
│                                                                        │
│  ┌─────────────────────────────────────────┬──────────────────────┐   │
│  │  Main Area                               │  Sidebar (toggleable)│   │
│  │  ┌─────────────────────────────────────┐ │  ┌────────────────┐ │   │
│  │  │  Top Bar                             │ │  │ New Session     │ │   │
│  │  │  Title | Stats | [>>] | Settings     │ │  │ Form           │ │   │
│  │  └─────────────────────────────────────┘ │  ├────────────────┤ │   │
│  │  ┌─────────────────────────────────────┐ │  │ Active (2)     │ │   │
│  │  │  SessionGrid                         │ │  │ Queued (3)     │ │   │
│  │  │  ┌─────────────────────────────────┐ │ │  │ Completed (5)  │ │   │
│  │  │  │  Focus Sessions (grid)          │ │ │  │ Failed (0)     │ │   │
│  │  │  │  ┌──────────────────────────┐   │ │ │  └────────────────┘ │   │
│  │  │  │  │ SessionCard (IDE panels) │   │ │ │     w-80 ↔ w-0      │   │
│  │  │  │  │ [Files|Terminal|Git]     │   │ │ │  (localStorage)     │   │
│  │  │  │  └──────────────────────────┘   │ │ │                     │   │
│  │  │  └─────────────────────────────────┘ │ └──────────────────────┘  │
│  │  │  ┌─────────────────────────────────┐ │                           │
│  │  │  │  More Sessions (collapsible)    │ │                           │
│  │  │  │  [+5 more ▼] ↔ [mini-cards ▲]  │ │                           │
│  │  │  └─────────────────────────────────┘ │                           │
│  │  └─────────────────────────────────────┘ │                           │
│  └─────────────────────────────────────────┘                           │
└────────────────────────────────────────────────────────────────────────┘
```

### Multi-Line Comment Selection (v5)

```
Method 1 — Gutter Drag:
  mousedown on line number → start tracking
  mousemove across lines → highlight range
  mouseup → open comment input for range

Method 2 — Text Selection:
  Select text across lines in diff content
  mouseup → detect selection range from DOM
  Floating "Comment" button appears
  Click button → open comment input for range
```

### Comment Flow (v7 — Ephemeral)

```
User clicks "+" on line → Comment box opens
User types comment → Clicks "Add Comment"
  → POST /api/sessions/:id/comments (saved as 'pending' in DB)
  → "Pending" indicator shown on diff line
  → User can switch files, add more comments

User clicks "Send All (3)" button in header
  → POST /api/sessions/:id/comments/deliver
  → All pending comments composed into single-line batch message
  → Injected into Claude session PTY as one input
  → Comments deleted from DB (ephemeral)
  → Comments cleared from diff view
  → Badge disappears
```
