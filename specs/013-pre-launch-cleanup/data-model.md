# Data Model Changes: Pre-Launch Cleanup

**Feature**: 013-pre-launch-cleanup
**Date**: 2026-02-21

## Overview

This feature **removes** data entities rather than adding them. No new tables, columns, or types are introduced.

## Entities Removed

### auth_config (Database Table)

**Action**: Stop creating on new installations. Do not drop from existing databases.

**Previous Schema**:
```sql
CREATE TABLE IF NOT EXISTS auth_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  jwt_secret TEXT NOT NULL,
  license_key_hash TEXT,
  license_email TEXT,
  license_plan TEXT,
  license_max_sessions INTEGER,
  license_expires_at TEXT,
  license_issued_at TEXT,
  auth_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Migration Strategy**: No destructive migration. Simply remove the `CREATE TABLE IF NOT EXISTS auth_config` statement and its `INSERT OR IGNORE` seed from `db.ts`. Existing databases with the table will continue to work — the table is ignored.

### TypeScript Types Removed

| Type | File | Description |
|------|------|-------------|
| `LicensePayload` | `models/types.ts` | License key payload structure |
| `AuthConfig` | `models/types.ts` | Auth configuration from database |
| `JwtPayload` | `models/types.ts` | JWT token payload |
| `AuthStatusResponse` | `models/types.ts` | Auth status API response |

### Repository Methods Removed

| Method | Description |
|--------|-------------|
| `getAuthConfig()` | Retrieve auth configuration singleton |
| `updateAuthConfig(input)` | Update auth config fields |
| `clearLicense()` | Clear license metadata |

### Frontend Types Removed

| Type | File | Description |
|------|------|-------------|
| `AuthStatus` | `services/api.ts` | Auth status response type |
| `ActivateResponse` | `services/api.ts` | License activation response type |

## Entities Added

### Health Check Response (API only, no persistence)

**Endpoint**: `GET /api/health`
**Response**: `{ status: "ok" }`

No database table or persistent entity required.
