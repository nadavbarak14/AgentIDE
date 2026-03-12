# Quickstart: Endpoint Authentication Hardening

**Feature**: 035-endpoint-auth-hardening
**Branch**: `035-endpoint-auth-hardening`

## What This Feature Does

Hardens the existing authentication system by:
1. Adding rate limiting to the login endpoint (5 failed attempts per 15 min per IP)
2. Closing auth gaps on extension and bridge script endpoints
3. Ensuring sessions last 30 days reliably
4. Adding a persistent audit log for auth events

## Files to Modify

### Backend Changes

| File | Change |
|------|--------|
| `backend/package.json` | Add `express-rate-limit` ^8.2.1 dependency |
| `backend/src/models/db.ts` | Add `auth_audit_log` table to schema + migration |
| `backend/src/models/repository.ts` | Add `logAuthEvent()` and `getAuthAuditLog()` methods |
| `backend/src/models/types.ts` | Add `AuthAuditEntry` interface |
| `backend/src/api/routes/auth.ts` | Add rate limiter middleware to login route, add audit log endpoint, log all auth events |
| `backend/src/hub-entry.ts` | Reorder route registration to move bridge scripts and extensions behind `requireAuth` |
| `backend/src/api/middleware.ts` | Change fail-open to fail-closed when auth config is missing |

### Test Changes

| File | Change |
|------|--------|
| `backend/tests/unit/auth-audit.test.ts` | New: Test audit log repository methods |
| `backend/tests/integration/api-auth.test.ts` | Add rate limiting tests, endpoint coverage tests, audit log tests |
| `backend/tests/system/auth-flow.test.ts` | Add rate limiting and audit trail to end-to-end flow |

## Dev Setup

```bash
cd backend
npm install express-rate-limit@^8.2.1
npm test   # Run unit + integration tests
```

## Key Design Decisions

1. **In-memory rate limiting** — uses `express-rate-limit`'s default MemoryStore. Resets on server restart, which is acceptable for a personal tool.
2. **Fail closed** — missing auth config from non-localhost = 401. No silent pass-through.
3. **Audit log in SQLite** — same database as everything else. Low volume, simple queries.
4. **No key rotation** — single user on own machine, not enterprise. Key set at startup and stays.
