# Contract: Directory Browser API

**Feature**: 027-directory-picker-ux
**Date**: 2026-03-06

## Overview

No new API endpoints. The visual directory browser reuses the existing directory listing API. This contract documents the existing API usage patterns for the new browser UI.

## Existing Endpoint: List Directories

### `GET /api/directories`

**Purpose**: List subdirectories of a given path. Used by the visual browser to populate the folder list.

**Query Parameters**:

| Param | Type   | Required | Default      | Description                          |
|-------|--------|----------|--------------|--------------------------------------|
| path  | string | No       | Home dir (~) | Directory to list contents of        |
| query | string | No       | ""           | Prefix filter for directory names    |

**Response** (200):

```json
{
  "path": "/home/ubuntu/projects",
  "entries": [
    { "name": "my-app", "path": "/home/ubuntu/projects/my-app" },
    { "name": "api-server", "path": "/home/ubuntu/projects/api-server" }
  ],
  "exists": true
}
```

**Error Cases**:

| Status | Condition                    | Response                          |
|--------|------------------------------|-----------------------------------|
| 400    | Path contains `..` or `\0`  | `{ "error": "Invalid path" }`    |
| 500    | Permission denied / IO error | `{ "error": "Unable to list..." }` |

**Notes**:
- Returns max 20 entries, sorted alphabetically
- Filters out hidden directories (except `.config`), `node_modules`
- `exists: false` when path doesn't exist (not an error — returns 200 with empty entries)

### Browser Usage Pattern

The visual browser calls this endpoint differently than the current autocomplete:

| Action              | API Call                                     |
|---------------------|----------------------------------------------|
| Open browser        | `GET /api/directories` (no params → home)    |
| Click folder "foo"  | `GET /api/directories?path=/home/user/foo`   |
| Click back          | `GET /api/directories?path=/home/user`       |
| Click breadcrumb    | `GET /api/directories?path=<breadcrumb path>`|
| Type path in bar    | `GET /api/directories?path=<typed path>`     |

**Key difference**: The browser uses `path` param only (no `query` param), because it always lists a full directory's contents rather than filtering by partial name.

## Remote Worker Equivalent

### `GET /api/workers/:workerId/directories`

Same query parameters and response shape. Used when `isRemote=true` and `workerId` is set.
