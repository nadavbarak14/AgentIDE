# Quickstart: Flexible Panel Layout Manager

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01

## Prerequisites

- Node.js 20 LTS installed
- Project dependencies installed (`npm install` at repo root and `npm install` in `frontend/`)
- Running instance of the backend (`npm run dev` or `npm start`)

## Install New Dependencies

```bash
# Frontend only — no new backend dependencies
cd frontend
npm install @dnd-kit/core @dnd-kit/sortable react-resizable-panels
```

## Running the Application

```bash
# From repo root — starts both backend and frontend in dev mode
npm run dev
```

The IDE opens at `http://localhost:<HUB_PORT>`.

## Using the Flexible Panel Layout

### Switch Layout Preset

1. Open any session in the IDE
2. Look for the **Layout Picker** button in the session toolbar (grid icon, next to zoom controls)
3. Click it to open the preset picker popover
4. Click any preset icon to switch — panels rearrange instantly

### Drag a Panel to a New Position

1. Hover over a panel's **header bar** — a drag cursor appears
2. Click and drag the header to a different grid cell
3. A **blue drop zone highlight** appears over valid targets
4. Release to drop — the panel snaps to its new position

### Resize Panels

1. Hover over the **divider** between two panels — a resize cursor appears
2. Click and drag to resize both adjacent panels simultaneously
3. Panels cannot be resized below their minimum size (~200px)

### Close and Reopen a Panel

1. Click the **✕** button on a panel's header to close it
2. Neighboring panels expand to fill the freed space
3. To reopen: click the **Panels** menu in the toolbar and select the closed panel

### Layout Persistence

Layouts are **automatically saved** — no manual save needed. After a page reload or application restart, your last layout is restored exactly as you left it.

## Running Tests

```bash
# Unit + integration tests
npm test

# Frontend component tests only
cd frontend && npm test

# Lint + type check
npm run lint
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/constants/layoutPresets.ts` | Static preset definitions |
| `frontend/src/types/layout.ts` | TypeScript types for LayoutConfig, CellConfig, etc. |
| `frontend/src/hooks/useLayoutConfig.ts` | Layout state management hook |
| `frontend/src/components/FlexiblePanelGrid.tsx` | Main layout renderer |
| `frontend/src/components/LayoutPresetPicker.tsx` | Preset picker toolbar component |
| `frontend/src/components/PanelVisibilityMenu.tsx` | Panel show/hide menu |
| `frontend/src/components/SessionCard.tsx` | Updated to use FlexiblePanelGrid |
| `backend/src/models/db.ts` | Migration: adds `layout_config` column |
| `backend/src/api/routes/sessions.ts` | Extended to validate/store `layoutConfig` |

## Environment Variables

No new environment variables are required.
