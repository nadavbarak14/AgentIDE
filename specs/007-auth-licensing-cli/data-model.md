# Data Model: Product Security, Licensing & CLI

**Branch**: `007-auth-licensing-cli` | **Date**: 2026-02-20

## New Table: `auth_config`

Singleton row (like existing `settings` table). Stores JWT signing secret and activated license metadata.

### Schema

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

### Seed

```sql
INSERT OR IGNORE INTO auth_config (id, jwt_secret, auth_required)
  VALUES (1, hex(randomblob(32)), 0);
```

### Column Reference

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | `INTEGER CHECK(id = 1)` | No | Enforces singleton (matches `settings` pattern) |
| `jwt_secret` | `TEXT` | No | HMAC-SHA256 signing key for JWTs, auto-generated on first run |
| `license_key_hash` | `TEXT` | Yes | SHA-256 hash of the activated license key |
| `license_email` | `TEXT` | Yes | Email decoded from license payload |
| `license_plan` | `TEXT` | Yes | Plan name from license (e.g., "pro") |
| `license_max_sessions` | `INTEGER` | Yes | Max concurrent sessions from license |
| `license_expires_at` | `TEXT` | Yes | ISO-8601 expiry from license payload |
| `license_issued_at` | `TEXT` | Yes | ISO-8601 issue date from license payload |
| `auth_required` | `INTEGER` | No | 0 = localhost (no auth), 1 = remote (auth enforced) |
| `created_at` | `TEXT` | No | Row creation timestamp |
| `updated_at` | `TEXT` | No | Last modification timestamp |

### Migration

Added to the `migrate()` function in `db.ts`. Checks if table exists, creates if not, matching existing migration pattern.

## New TypeScript Types

### `LicensePayload`

Decoded payload from a license key (after base64 decode, before signature verification).

```typescript
interface LicensePayload {
  email: string;
  plan: string;
  maxSessions: number;
  expiresAt: string;   // ISO-8601
  issuedAt: string;    // ISO-8601
}
```

### `AuthConfig`

Maps to the `auth_config` database row.

```typescript
interface AuthConfig {
  jwtSecret: string;
  licenseKeyHash: string | null;
  licenseEmail: string | null;
  licensePlan: string | null;
  licenseMaxSessions: number | null;
  licenseExpiresAt: string | null;
  licenseIssuedAt: string | null;
  authRequired: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### `JwtPayload`

Contents encoded within the JWT session cookie.

```typescript
interface JwtPayload {
  email: string;
  plan: string;
  licenseExpiresAt: string;
  iat: number;  // issued-at (Unix seconds)
  exp: number;  // expiry (Unix seconds, iat + 30 days)
}
```

## New Repository Methods

Following existing patterns (`getSettings` / `updateSettings`):

| Method | Description |
|--------|-------------|
| `getAuthConfig(): AuthConfig` | Fetch singleton auth config row |
| `updateAuthConfig(input): AuthConfig` | Patch any combination of auth config fields |
| `clearLicense(): AuthConfig` | Reset all license fields to NULL |

Row converter: `rowToAuthConfig(row)` maps snake_case DB columns to camelCase TypeScript interface.

## License Key Format

```
base64url(JSON.stringify(payload)) + "." + base64url(RSA-PSS-SHA256-signature)
```

- Payload: JSON with `{ email, plan, maxSessions, expiresAt, issuedAt }`
- Signature: RSA-PSS with SHA-256, 2048-bit key
- Public key: Embedded in source code as PEM string
- Private key: Developer-only, never shipped

## Cookie Specification

| Attribute | Value |
|-----------|-------|
| Name | `agentide_session` |
| Value | JWT (HMAC-SHA256 signed) |
| HttpOnly | Yes |
| Secure | Only when HTTPS active |
| SameSite | Strict |
| Path | `/` |
| Max-Age | `2592000` (30 days) |

## No Changes to Existing Tables

The `sessions`, `workers`, `settings`, `panel_states`, `comments`, and `artifacts` tables remain unchanged.
