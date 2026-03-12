# API Contracts: Save Panel Position

## Existing Endpoints (No Changes)

### GET /api/sessions/:id/panel-state
### PUT /api/sessions/:id/panel-state

Unchanged. The terminal position value will now more commonly be `'center'` (instead of auto-switching to `'bottom'`), but the API contract is the same.

---

## New Endpoints

### GET /api/sessions/:id/layout-snapshot

Retrieve a saved layout snapshot for a specific panel combination.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| viewMode | string | No | `'zoomed'` for zoomed layout, omit for grid |
| combination | string | Yes | Panel combination key (e.g., `"files"`, `"files+git"`) |

**Response 200**:
```json
{
  "sessionId": "uuid",
  "combinationKey": "files+git",
  "leftWidthPercent": 25,
  "rightWidthPercent": 35,
  "bottomHeightPercent": 40
}
```

**Response 404** (no snapshot for this combination):
```json
{
  "error": "No layout snapshot found"
}
```

---

### PUT /api/sessions/:id/layout-snapshot

Save or update a layout snapshot for a specific panel combination.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| viewMode | string | No | `'zoomed'` for zoomed layout, omit for grid |

**Request Body**:
```json
{
  "combinationKey": "files+git",
  "leftWidthPercent": 25,
  "rightWidthPercent": 35,
  "bottomHeightPercent": 40
}
```

**Validation Rules**:
| Field | Rule |
|-------|------|
| combinationKey | Non-empty string |
| leftWidthPercent | Integer, 0-100 |
| rightWidthPercent | Integer, 0-100 |
| bottomHeightPercent | Integer, 0-100 |

**Response 200**:
```json
{
  "success": true
}
```

---

## Frontend API Client Additions

```typescript
export const layoutSnapshot = {
  get: (sessionId: string, combination: string, viewMode?: string) =>
    request<LayoutSnapshotData>(
      `/sessions/${sessionId}/layout-snapshot?combination=${encodeURIComponent(combination)}${viewMode ? `&viewMode=${viewMode}` : ''}`
    ),

  save: (sessionId: string, data: LayoutSnapshotInput, viewMode?: string) =>
    request<{ success: boolean }>(
      `/sessions/${sessionId}/layout-snapshot${viewMode ? `?viewMode=${viewMode}` : ''}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),
};
```
