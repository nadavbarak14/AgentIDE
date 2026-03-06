# API Contract: Panel State (Updated)

**Feature**: 025-preview-device-presets
**Date**: 2026-03-06

## Existing Endpoints (Modified)

### PUT /api/sessions/:id/panel-state

**Change**: Accept new `mobileDeviceId` field in request body.

**Request Body** (partial - showing new/relevant fields only):
```json
{
  "previewViewport": "mobile",
  "mobileDeviceId": "iphone-15-pro",
  "customViewportWidth": null,
  "customViewportHeight": null,
  "terminalPosition": "bottom",
  "bottomHeightPercent": 55
}
```

**New field**:
| Field          | Type            | Required | Validation                     |
|----------------|-----------------|----------|--------------------------------|
| mobileDeviceId | string or null  | No       | If present, must be string or null |

**Response**: `{ "success": true }` (unchanged)

### GET /api/sessions/:id/panel-state

**Change**: Return new `mobileDeviceId` field.

**Response Body** (partial - showing new/relevant fields):
```json
{
  "previewViewport": "mobile",
  "mobileDeviceId": "iphone-15-pro",
  "terminalPosition": "bottom",
  "bottomHeightPercent": 55
}
```

**New field in response**:
| Field          | Type            | Default |
|----------------|-----------------|---------|
| mobileDeviceId | string or null  | null    |

## No New Endpoints

All changes are additions to the existing panel state save/load API. No new routes needed.
