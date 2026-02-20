# Data Model: Product Security & Licensing

**Feature**: 009-product-security-licensing
**Date**: 2026-02-20

## Entity: License Key (ephemeral — not stored directly)

The license key itself is a signed token, not a database record. It is validated in-memory and its metadata is stored in `auth_config`.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| email | string | License holder's email | Required, non-empty |
| plan | string | Plan level (e.g., "pro", "team") | Required, non-empty |
| maxSessions | number | Maximum concurrent sessions allowed | Required, positive integer |
| expiresAt | ISO-8601 string | License expiry timestamp | Required, must be in future at validation time |
| issuedAt | ISO-8601 string | License issue timestamp | Required, valid date |

**Format**: `base64url(JSON).base64url(RSA-PSS-SHA256-signature)`

**State transitions**: N/A — license keys are immutable tokens. Expiry is time-based.

## Entity: Auth Config (singleton — `auth_config` table)

Server-side configuration tracking authentication state and cached license metadata.

| Field | Type | DB Column | Description |
|-------|------|-----------|-------------|
| id | integer | id | Always 1 (singleton) |
| jwtSecret | string | jwt_secret | HMAC-SHA256 secret for signing JWT session tokens. Auto-generated at DB creation (32 random bytes, hex-encoded). |
| licenseKeyHash | string \| null | license_key_hash | SHA-256 hash of the active license key. Used for comparison, never stores the raw key. |
| licenseEmail | string \| null | license_email | Cached email from the last validated license |
| licensePlan | string \| null | license_plan | Cached plan from the last validated license |
| licenseMaxSessions | number \| null | license_max_sessions | Cached max sessions from the last validated license |
| licenseExpiresAt | string \| null | license_expires_at | Cached expiry from the last validated license |
| licenseIssuedAt | string \| null | license_issued_at | Cached issue date from the last validated license |
| authRequired | boolean | auth_required | Whether authentication is enforced (true when binding to non-localhost) |
| createdAt | string | created_at | Row creation timestamp |
| updatedAt | string | updated_at | Last update timestamp |

**Initialization**: Created by `SEED` SQL with `jwt_secret = hex(randomblob(32))` and `auth_required = 0`.

## Entity: JWT Session Token (ephemeral — stored in cookie)

Browser session token issued after successful license activation.

| Field | Type | Description |
|-------|------|-------------|
| email | string | From license payload |
| plan | string | From license payload |
| licenseExpiresAt | string | From license payload — checked on every request |
| iat | number | Issued-at (Unix seconds) — set by `jose` |
| exp | number | Expiry (Unix seconds) — iat + 30 days |

**Storage**: httpOnly cookie named `agentide_session`, sameSite=strict, secure=true when HTTPS.

**Validation**: Verified on every protected request via `verifyToken()`. Additionally checks `licenseExpiresAt < now` to detect mid-session license expiry.

## Entity: Worker (existing — `workers` table)

SSH remote worker connection details. Relevant fields for this feature:

| Field | Type | DB Column | Description |
|-------|------|-----------|-------------|
| sshHost | string \| null | ssh_host | Remote machine hostname |
| sshPort | number | ssh_port | SSH port (default 22) |
| sshUser | string \| null | ssh_user | SSH username |
| sshKeyPath | string \| null | ssh_key_path | Path to SSH private key file |

**Key validation rules** (applied before connection attempt):
1. File must exist at `sshKeyPath`
2. File must be readable by current process
3. File must not contain `ENCRYPTED` (passphrase-protected)
4. File must contain `PRIVATE KEY` (not a public key or other file)

## Relationships

```
License Key ──validates──→ Auth Config (stores metadata after activation)
                              │
Auth Config ──secrets──→ JWT Session Token (signed with jwtSecret)
                              │
JWT Session Token ──authorizes──→ Protected API Routes + WebSocket

Worker ──validates──→ SSH Private Key File (on disk, not in DB)
```

## License Key File on Disk

| Location | Permissions | Purpose |
|----------|------------|---------|
| `~/.agentide/license.key` | 0600 (owner-only) | Persisted license key for startup validation |
| `~/.agentide/private.pem` | 0600 (owner-only) | Dev/test private key (NOT shipped in production) |
| `~/.agentide/tls/cert.pem` | 0600 | Self-signed TLS certificate |
| `~/.agentide/tls/key.pem` | 0600 | Self-signed TLS private key |
