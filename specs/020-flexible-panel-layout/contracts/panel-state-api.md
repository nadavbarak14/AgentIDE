# API Contract: Panel State (Extended for Flexible Layout)

**Branch**: `020-flexible-panel-layout` | **Date**: 2026-03-01

This document extends the existing `GET/PUT /api/sessions/{id}/panel-state` API to support the new `layout_config` field. All existing fields are preserved for backward compatibility.

---

## GET /api/sessions/:sessionId/panel-state

Retrieve the saved panel state for a session, including the new layout configuration.

### Response

```json
{
  "leftPanel": "files",
  "rightPanel": "git",
  "bottomPanel": "none",
  "leftWidthPercent": 25,
  "rightWidthPercent": 35,
  "bottomHeightPercent": 40,
  "terminalPosition": "center",
  "terminalVisible": true,
  "fontSize": 14,
  "previewUrl": "",
  "previewViewport": "desktop",
  "customViewportWidth": null,
  "customViewportHeight": null,
  "fileTabs": [],
  "activeTabIndex": 0,
  "tabScrollPositions": {},
  "gitScrollPosition": 0,

  "layoutConfig": {
    "presetId": "equal-3col",
    "cells": [
      { "cellId": "cell-0", "activePanelId": "files", "stackedPanelIds": [] },
      { "cellId": "cell-1", "activePanelId": "shell", "stackedPanelIds": [] },
      { "cellId": "cell-2", "activePanelId": "git",   "stackedPanelIds": ["preview"] }
    ],
    "sizes": [33, 34, 33]
  }
}
```

**Notes**:
- `layoutConfig` is `null` when no flexible layout has been saved (first use after upgrade). The frontend migrates the legacy `leftPanel`/`rightPanel`/`bottomPanel` fields into a `LayoutConfig` on first load.
- All existing fields remain present; they continue to drive legacy fallback behavior.

### Error Responses

| Status | Condition |
|--------|-----------|
| 404 | Session not found |
| 500 | Database error |

---

## PUT /api/sessions/:sessionId/panel-state

Save the full panel state, including the new layout configuration.

### Request Body

Same shape as the GET response. The new field:

```json
{
  "layoutConfig": {
    "presetId": "2left-1right",
    "cells": [
      { "cellId": "cell-0", "activePanelId": "files",   "stackedPanelIds": [] },
      { "cellId": "cell-1", "activePanelId": "shell",   "stackedPanelIds": [] },
      { "cellId": "cell-2", "activePanelId": "preview", "stackedPanelIds": ["git"] }
    ],
    "sizes": [33, 33, 67]
  }
}
```

**Validation rules** (backend enforces):
- `presetId` must be one of: `equal-3col`, `2left-1right`, `1left-2right`, `2top-1bottom`, `1top-2bottom`, `focus`
- `cells` must be a valid JSON array; malformed JSON → 400
- `sizes` must sum to 100 (±1.0 tolerance for floating-point)
- `cells.length` must match the preset's slot count
- Each `cellId` must be unique within `cells`
- Each panel ID may appear in at most one cell (active or stacked)
- `layoutConfig` may be `null` (treated as "use legacy fields")

### Response

```json
{ "success": true }
```

### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid `layoutConfig` structure or validation failure |
| 404 | Session not found |
| 500 | Database error |

---

## No New Endpoints

Layout presets are static frontend constants — no `/api/layout-presets` endpoint is needed. The preset definitions live in a TypeScript constants file in the frontend.

---

## SQLite Migration Script

```sql
-- Migration: add layout_config column to panel_states
-- Safe to run multiple times (IF NOT EXISTS check via application layer)
ALTER TABLE panel_states
  ADD COLUMN layout_config TEXT DEFAULT NULL;
```

Applied at backend startup via the existing migration pattern in `backend/src/models/db.ts`.
