# Data Model: Endpoint Authentication Hardening

**Feature**: 035-endpoint-auth-hardening
**Date**: 2026-03-12

## Existing Entities (No Changes)

### auth_config (singleton)

Already exists. No schema changes needed.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, CHECK(id = 1) | Singleton enforcement |
| key_hash | TEXT | NOT NULL | Scrypt hash of access key (format: salt-hex:hash-hex) |
| cookie_secret | TEXT | NOT NULL | HMAC signing secret (64 hex chars) |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |

## New Entities

### auth_audit_log

New table for persistent auth event logging.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Event ID |
| event_type | TEXT | NOT NULL | One of: 'login_success', 'login_failure', 'rate_limited', 'logout' |
| source_ip | TEXT | NOT NULL | Client IP address |
| details | TEXT | | Optional JSON details (e.g., failure reason) |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Event timestamp |

**SQL**:
```sql
CREATE TABLE IF NOT EXISTS auth_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  source_ip TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Index** (for querying recent events):
```sql
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON auth_audit_log(created_at);
```

## Ephemeral State (Not Persisted)

### Rate Limit Records

Managed in-memory by `express-rate-limit`. Not stored in the database.

- Key: Client IP address
- Value: Request count within the current 15-minute window
- TTL: 15 minutes (auto-evicted)
- Resets on server restart

## Entity Relationships

```
auth_config (1) ──── validates ────> Session Cookie (many, ephemeral)
                                          │
                                          ▼
auth_audit_log (many) <── records ── Login Attempt
                                          │
                                          ▼
                                   Rate Limit Record (ephemeral, per IP)
```

## Repository Methods (New)

```typescript
// Add to Repository class

logAuthEvent(eventType: string, sourceIp: string, details?: string): void
// INSERT into auth_audit_log

getAuthAuditLog(limit?: number): AuthAuditEntry[]
// SELECT from auth_audit_log ORDER BY created_at DESC LIMIT ?
```

## TypeScript Types (New)

```typescript
interface AuthAuditEntry {
  id: number;
  eventType: 'login_success' | 'login_failure' | 'rate_limited' | 'logout';
  sourceIp: string;
  details: string | null;
  createdAt: string;
}
```
