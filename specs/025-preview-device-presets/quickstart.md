# Quickstart: Preview Device Presets & Layout Persistence

**Feature**: 025-preview-device-presets
**Date**: 2026-03-06

## Overview

This feature makes three changes to the preview panel:
1. Screenshot/recording View/Full toggles become dropdown menus on their action buttons
2. Mobile viewport button opens a device preset picker instead of switching to a fixed size
3. Selected device preset and terminal position/height are reliably persisted

## Key Files to Modify

### Frontend

| File | Change |
|------|--------|
| `frontend/src/components/PreviewOverlay.tsx` | Replace View/Full toggle buttons with dropdown menus on screenshot/record buttons |
| `frontend/src/components/LivePreview.tsx` | Replace mobile button direct-switch with device preset dropdown; update mobile frame to use selected device dimensions |
| `frontend/src/hooks/usePanel.ts` | Add `mobileDeviceId` to state, persistence, and restore logic; fix terminal position auto-switch override |
| `frontend/src/services/api.ts` | Add `mobileDeviceId` to `PanelStateData` interface |

### Backend

| File | Change |
|------|--------|
| `backend/src/models/db.ts` | Add migration: `ALTER TABLE panel_states ADD COLUMN mobile_device_id TEXT DEFAULT NULL` |
| `backend/src/models/types.ts` | Add `mobileDeviceId` to `PanelState` interface |
| `backend/src/models/repository.ts` | Add `mobile_device_id` to savePanelState INSERT, rowToPanelState mapping |
| `backend/src/api/routes/sessions.ts` | Add `mobileDeviceId` to PUT validation and GET defaults |

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/constants/devicePresets.ts` | Static device preset definitions (id, name, category, width, height) |

## Development Order

1. **Define device presets** constant file
2. **Backend schema migration** - add `mobile_device_id` column
3. **Backend API updates** - add field to save/load routes
4. **Frontend usePanel updates** - add `mobileDeviceId` state + persistence
5. **PreviewOverlay dropdowns** - replace View/Full toggles with dropdown menus
6. **LivePreview device picker** - replace mobile button with device preset dropdown
7. **Terminal position fix** - prevent auto-switch from overriding user's explicit choice
8. **Tests** - unit tests for presets, integration tests for persistence, component tests for dropdowns

## Architecture Notes

- Device presets are static frontend constants, not stored in the database
- Only the preset ID (`mobileDeviceId`) is persisted in `panel_states`
- The existing `previewViewport` enum ('desktop'/'mobile'/'custom') is unchanged
- Dropdown pattern follows existing ProjectPicker.tsx implementation (useState + useRef + mousedown listener)
- The mobile frame rendering reuses the existing phone frame UI, just with dynamic dimensions from the selected preset
- Tablet presets use a different frame style (squared corners, no notch)
