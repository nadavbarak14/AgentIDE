# Research: Endpoint Authentication Hardening

**Feature**: 035-endpoint-auth-hardening
**Date**: 2026-03-12

## R-001: Rate Limiting Strategy

**Decision**: Re-implement `express-rate-limit` on the login endpoint with `skipSuccessfulRequests: true`.

**Rationale**:
- `express-rate-limit` v8.2.1 was previously used in this codebase and removed in commit `a0a63b7` as part of a larger refactor — not due to technical issues
- The library is well-maintained, lightweight, and handles IP-based limiting out of the box
- Using `skipSuccessfulRequests: true` (from the archived implementation) is better than counting all requests — it prevents legitimate users from being locked out by their own successful logins
- In-memory store is sufficient for single-instance deployment (no Redis/external store needed)

**Alternatives considered**:
- Custom in-memory rate limiter: Unnecessary complexity when a battle-tested library exists
- Database-backed rate limiting: Over-engineered for single-instance; adds DB writes on every login attempt
- Fail2ban / OS-level: Out of scope, requires infrastructure changes

---

## R-002: Unprotected Endpoint Inventory

**Decision**: Move bridge scripts and extension endpoints behind auth middleware by reordering route registration in `hub-entry.ts`.

**Rationale**: Current route registration order in `hub-entry.ts`:
1. Health check (line 387) — intentionally unprotected
2. Auth routes (line 390) — must be unprotected
3. Login page (line 393) — must be unprotected
4. **`requireAuth` middleware (line 399)** — everything after this is protected
5. Protected API routes (lines 402-415)

**Currently unprotected (should be protected)**:
- `GET /api/inspect-bridge.js` (line 418) — registered after requireAuth but served as a separate file handler
- `GET /api/widget-bridge.js` (line 426) — same issue
- `GET /api/extensions` (line 434) — extension listing
- `GET /extensions/*` (line 457) — extension file serving

**Fix approach**: Ensure these endpoints are registered after the `requireAuth` middleware call and that the middleware applies to them. The bridge scripts run inside preview iframes which already have auth cookies, so requiring auth won't break functionality.

**Alternatives considered**:
- Separate auth token for bridge scripts: Over-complicated; cookies already work in iframe context
- Allowlist specific script paths: Fragile, hard to maintain as new scripts are added

---

## R-003: Audit Log Storage

**Decision**: Create a new `auth_audit_log` SQLite table for persistent auth event storage.

**Rationale**:
- SQLite is already used for all persistence (better-sqlite3 with WAL mode)
- Auth events are low-volume (login attempts only, not every request)
- No external logging infrastructure needed for a personal tool
- Simple table: event_type, timestamp, source_ip, details
- Existing `Repository` pattern makes adding a new table straightforward

**Alternatives considered**:
- File-based logging (Winston/Pino): Already have a logger but it writes to stdout/files, not queryable; can't build UI on top
- Separate logging database: Unnecessary for low-volume auth events
- In-memory only: Doesn't survive restarts, defeats the purpose

---

## R-004: Session Cookie Validation

**Decision**: Keep existing HMAC-SHA256 cookie implementation. Verify 30-day expiry is correctly enforced.

**Rationale**:
- Current implementation already uses:
  - `HttpOnly` cookies (prevents XSS access)
  - `SameSite=Strict` (prevents CSRF)
  - HMAC-SHA256 signatures (prevents tampering)
  - `issuedAt` timestamp with 30-day validation
  - Timing-safe comparison via `crypto.timingSafeEqual()`
- The cookie survives server restarts because validation uses the `cookieSecret` stored in the database
- 30-day max-age is set on the cookie itself AND validated server-side via `issuedAt`

**What needs verification**:
- Confirm `maxAge` in `res.cookie()` matches the server-side validation window
- Confirm expired cookies are properly cleared (set to empty + maxAge=0)

---

## R-005: Fail-Closed Behavior

**Decision**: The `requireAuth` middleware already partially fails closed — if `authConfig` is null, it allows requests through (legacy mode). This must be changed to reject requests when auth config is missing.

**Rationale**:
- Current code in middleware.ts: if no auth config exists, `next()` is called (fail-open)
- This was designed for backward compatibility when auth was optional
- For hardened auth, missing auth config from a non-localhost IP should result in 401
- Localhost bypass should still work regardless of auth config state

**Risk**: If the database is corrupted and auth_config is lost, the entire app becomes inaccessible from remote. This is the correct behavior for a security-hardened system — fail closed, fix the database, restart.

---

## R-006: Testing Strategy

**Decision**: Add rate limiting tests, endpoint coverage tests, and audit log tests using existing Vitest + supertest infrastructure.

**Rationale**:
- Existing test infrastructure is well-established (Vitest 2.1.0, supertest 7.0.0, in-memory SQLite)
- Previous rate limiting test existed and was removed — can use as reference
- Key testing concern: rate limiter is a module-level singleton, so rate limit tests must account for shared state
- Solution: Use `express-rate-limit`'s `resetKey()` or create fresh rate limiter instances per test

**Test categories needed**:
- Unit: Audit log repository methods
- Integration: Rate limiting behavior (5 attempts, window reset, skip successful)
- Integration: All-endpoints auth coverage (enumerate routes, verify 401/redirect)
- System: End-to-end login with rate limiting and audit trail
