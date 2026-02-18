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

## Key Files to Modify (v5 Update)

### Frontend (v5 changes — all frontend-only)

| File | Changes |
|------|---------|
| `frontend/src/components/DiffViewer.tsx` | **MODIFY**: Fix overflow-hidden → overflow-x-auto, full-width for new files, gutter drag + text selection for comments |
| `frontend/src/components/SessionCard.tsx` | **MODIFY**: Responsive min-widths (200px panel, 300px terminal), internal port detection state |
| `frontend/src/components/SessionGrid.tsx` | **MODIFY**: Remove unused detectedPort prop passthrough |

### Backend (v5 changes)

None — all v5 changes are frontend-only.

### Unchanged in v5

| File | Status |
|------|--------|
| `frontend/src/components/FileTree.tsx` | Unchanged |
| `frontend/src/components/FileViewer.tsx` | Unchanged (v4 changes complete) |
| `frontend/src/components/LivePreview.tsx` | Unchanged (already functional) |
| `frontend/src/components/TerminalView.tsx` | Unchanged |
| `frontend/src/hooks/usePanel.ts` | Unchanged (v4 changes complete) |
| `frontend/src/hooks/useTerminal.ts` | Unchanged (v4 changes complete) |
| `frontend/src/services/api.ts` | Unchanged (v4 changes complete) |
| `frontend/src/utils/diff-parser.ts` | Unchanged |
| `backend/src/*` | Unchanged |

## Feature Flags / Configuration

No feature flags needed. IDE panels are shown/hidden based on grid layout:
- `grid_layout === '1x1'` → Show IDE toolbar and panels
- Any other layout → Hide toolbar and panels

## Architecture Overview (v5 Update)

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  SessionCard (1-view mode) — v5 Responsive + Port Detection │  │
│  │                                                              │  │
│  │  Both Files + Git active (three-column):                     │  │
│  │  min 200px   min 300px      min 200px                       │  │
│  │  ┌──────────────┬───────────────┬───────────────────────┐  │  │
│  │  │ Files Panel   │ Terminal       │ Git Panel             │  │  │
│  │  │ ┌────┬──────┐│ (xterm.js +    │ ┌────────┬──────────┐│  │  │
│  │  │ │Tree│Editor││  clipboard     │ │Sidebar │Diff View ││  │  │
│  │  │ │    │(R/W) ││  addon)        │ │        │(v5 fixes)││  │  │
│  │  │ └────┴──────┘│               │ │        │• overflow ││  │  │
│  │  │              │               │ │        │• gutter   ││  │  │
│  │  │              │               │ │        │  drag     ││  │  │
│  │  │              │               │ │        │• text sel ││  │  │
│  │  │              │               │ └────────┴──────────┘│  │  │
│  │  └──────────────┴───────────────┴───────────────────────┘  │  │
│  │                                                              │  │
│  │  Port detection: WS port_detected → state → LivePreview     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  REST API calls                          WebSocket events          │
│    ↕                                       ↕ (port_detected)       │
└────────────────────────────────────────────────────────────────────┘
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
