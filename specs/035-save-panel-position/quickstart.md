# Quickstart: Save Panel Position

## What This Feature Does

Two changes:
1. **Terminal stays "up"**: When panels open, the Claude Code terminal stays in the top zone (horizontal layout with panels) instead of auto-moving to the bottom zone. The existing left/right arrangement is unchanged.
2. **Layout persistence**: Exact panel widths/heights are saved per panel combination and restored when toggling panels in and out.

## Key Files to Modify

### Frontend
1. **`frontend/src/components/SessionCard.tsx`** — Remove/change auto-positioning effect (lines ~553-578) that moves terminal from `'center'` to `'bottom'` when panels open
2. **`frontend/src/hooks/usePanel.ts`** — Add combination key generation + snapshot save/restore on panel toggle
3. **`frontend/src/services/api.ts`** — New API client methods for layout snapshots

### Backend
4. **`backend/src/models/db.ts`** — New `panel_layout_snapshots` table
5. **`backend/src/models/repository.ts`** — Snapshot CRUD methods
6. **`backend/src/models/types.ts`** — `LayoutSnapshot` type
7. **`backend/src/api/routes/sessions.ts`** — Snapshot API endpoints

### Tests
8. **`frontend/tests/unit/panelLayout.test.ts`** — Verify layout behavior with terminal in center
9. **New tests** — Snapshot persistence and auto-positioning behavior

## Implementation Order

1. **Database migration** — Create `panel_layout_snapshots` table
2. **Backend API** — Repository methods + REST endpoints
3. **Auto-positioning change** — Stop moving terminal to `'bottom'` when panels open
4. **Snapshot logic** — Save/restore layout per combination in `usePanel.ts`
5. **Tests**

## Core Change (simplified)

```
BEFORE: User opens panel → terminal moves to bottom zone → layout: [panels on top] / [terminal on bottom]
AFTER:  User opens panel → terminal stays in top zone    → layout: [left panel | terminal | right panel]
```

The existing `'center'` terminal position already renders this horizontal layout correctly. The only change is removing the auto-switch that pushes it to `'bottom'`.
