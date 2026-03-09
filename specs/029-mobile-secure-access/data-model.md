# Data Model: Mobile View Support & Secure VPS Access

**Feature Branch**: `029-mobile-secure-access`
**Date**: 2026-03-09

## New Table: `auth_config`

Singleton table (single row, `id = 1`) storing the access key hash and cookie signing secret.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, CHECK(id = 1) | Singleton constraint |
| `key_hash` | TEXT | NOT NULL | scrypt hash of the access key (includes salt) |
| `cookie_secret` | TEXT | NOT NULL | Random secret for HMAC-signing auth cookies |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When the key was first generated |

**Format of `key_hash`**: `<salt-hex>:<scrypt-hash-hex>` — salt is 16 bytes (32 hex chars), hash is 64 bytes (128 hex chars).

**Format of `cookie_secret`**: 32 random bytes, hex-encoded (64 chars). Generated once alongside the access key.

## Existing Tables — No Changes

No modifications to existing tables (`sessions`, `workers`, `settings`, `panel_states`, `comments`, `projects`, `preview_comments`, `uploaded_images`, `video_recordings`).

## Entity Relationships

```
auth_config (singleton)
  └── Validates → Authentication Cookie (browser-side)
       └── Gates access to → All API routes & WebSocket connections
                               └── Except: localhost requests (bypass)
                               └── Except: GET /api/health
                               └── Except: Login page & static assets
```

## State Transitions

### Access Key Lifecycle

```
[No key in DB] ──first startup──> [Key generated, hash stored]
                                        │
                                   [Key displayed in terminal]
                                        │
                                   [Subsequent startups: key hash loaded, no display]
```

### Authentication Session Lifecycle

```
[Unauthenticated] ──correct key──> [Authenticated (30-day cookie)]
       ▲                                    │
       │                              [Cookie expires after 30 days]
       │                                    │
       └────────────────────────────────────┘

[Unauthenticated] ──wrong key──> [Failed attempt counter++]
                                        │
                                   [5 failures in 15min]
                                        │
                                   [Rate-limited (locked out)]
                                        │
                                   [15min cooldown expires]
                                        │
                                   [Counter resets]
```

## Validation Rules

- `key_hash`: Must be non-empty, must follow `<salt>:<hash>` format
- `cookie_secret`: Must be exactly 64 hex characters
- Auth cookie payload: Must contain `authenticated: true` and `issuedAt` within 30 days of current time
- Auth cookie signature: HMAC-SHA256 must match recomputed value using `cookie_secret`
