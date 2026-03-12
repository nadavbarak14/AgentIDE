# Feature Specification: Endpoint Authentication Hardening

**Feature Branch**: `035-endpoint-auth-hardening`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "We need real protection with the password. Also make sure it lasts for a long time, but make sure all endpoints are protected with password and needs authentication. Make a research — make sure we are not clowns."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brute Force Protection on Login (Priority: P1)

An administrator hosts the application on a public server. An attacker discovers the login URL and attempts to brute-force the access key by sending thousands of login requests per minute. The system must detect rapid failed login attempts and throttle or block the attacker, preventing key compromise even if the attacker has significant compute resources.

**Why this priority**: Without rate limiting, an attacker can attempt unlimited login guesses. This is the single most critical gap — the access key is the only line of defense, and it is currently exposed to unbounded brute-force attacks.

**Independent Test**: Can be tested by sending rapid sequential login requests with wrong keys and verifying that the system starts rejecting requests after the threshold.

**Acceptance Scenarios**:

1. **Given** the login endpoint is available, **When** a single IP sends more than 5 failed login attempts within a 15-minute window, **Then** all subsequent login requests from that IP are rejected with a "Too Many Requests" response until the window expires.
2. **Given** a blocked IP, **When** the rate-limit window expires, **Then** the IP can attempt login again normally.
3. **Given** a successful login, **When** the user logs in correctly, **Then** the successful attempt does not count toward the rate limit.
4. **Given** the login endpoint, **When** an attacker uses different access keys, **Then** every failed attempt counts toward the same IP-based rate limit regardless of key value.

---

### User Story 2 - All Endpoints Require Authentication (Priority: P1)

An administrator reviews the application and wants assurance that no API endpoint or static resource leaks data without authentication. Every endpoint — except the bare minimum needed for the login flow itself — must require a valid session. This includes REST API routes, WebSocket connections, static frontend assets, and any file-serving endpoints.

**Why this priority**: If even one endpoint is unprotected, it can leak sensitive data (session details, project files, source code). Comprehensive coverage is equally critical to brute-force protection.

**Independent Test**: Can be tested by enumerating all registered routes and sending unauthenticated requests to each, verifying that only the login-flow endpoints respond without credentials.

**Acceptance Scenarios**:

1. **Given** an unauthenticated request, **When** it hits any API endpoint except `/api/auth/login`, `/api/auth/status`, `/api/auth/logout`, `/api/health`, or `/login`, **Then** the system responds with a 401 status or redirects to the login page.
2. **Given** an unauthenticated WebSocket upgrade request from a non-localhost address, **When** it attempts to connect, **Then** the connection is rejected with a 401.
3. **Given** static frontend assets (JS, CSS, HTML), **When** requested without authentication from a non-localhost address, **Then** they are blocked or redirect to the login page.
4. **Given** extension endpoints (`/extensions`, `/extensions/*`), **When** requested without authentication from a non-localhost address, **Then** they require authentication.

---

### User Story 3 - Long-Lived Sessions That Actually Work (Priority: P2)

A user logs in and expects the session to persist reliably without needing to re-enter the access key frequently. Sessions should last for 30 days, survive server restarts, and only expire when the time limit is genuinely reached or when the user explicitly logs out.

**Why this priority**: Constantly re-authenticating is frustrating and reduces the tool's usability. However, sessions must still expire eventually for security.

**Independent Test**: Can be tested by creating a session, advancing time, and verifying the session remains valid up to the expiration boundary and is rejected after.

**Acceptance Scenarios**:

1. **Given** a valid login, **When** the user accesses the application within 30 days, **Then** the session remains valid without re-authentication.
2. **Given** a valid session, **When** the server restarts, **Then** the session remains valid (cookie-based, no server-side session state required).
3. **Given** a session older than 30 days, **When** the user makes a request, **Then** the session is rejected and the user must re-authenticate.

---

### User Story 4 - Security Audit Trail (Priority: P3)

A user wants to know if anyone has been attempting to access the system and when the last successful login happened. The system should log authentication events so the user can check if something suspicious is going on.

**Why this priority**: Audit trails help spot problems after the fact but don't prevent attacks directly. Nice to have for peace of mind.

**Independent Test**: Can be tested by performing login attempts (success and failure) and querying the audit log to verify events are recorded.

**Acceptance Scenarios**:

1. **Given** a failed login attempt, **When** the event is recorded, **Then** the audit log includes timestamp, source IP, and failure reason (wrong key, rate limited).
2. **Given** a successful login, **When** the event is recorded, **Then** the audit log includes timestamp and source IP.
3. **Given** the audit log, **When** a user queries it, **Then** events are returned in chronological order.

---

### Edge Cases

- What happens when the rate limiter storage grows large? Old entries must be evicted automatically (time-based TTL).
- What happens when a legitimate user is behind a shared IP (NAT) with an attacker? They get rate-limited too — this is an accepted trade-off; document IP allowlisting for trusted networks as a future consideration.
- What happens when the server clock changes significantly (NTP drift)? Cookie expiration checks should handle clock skew gracefully.
- What happens when the database is corrupted and `auth_config` is lost? The system must fail closed (reject all requests) rather than fail open.
- What happens if the rate limiter is restarted (server restart)? Rate limit counters reset — this is acceptable as it provides at most a temporary reprieve for attackers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST rate-limit the login endpoint to a maximum of 5 failed attempts per IP address within a 15-minute sliding window.
- **FR-002**: System MUST return a "429 Too Many Requests" response with a `Retry-After` header when the rate limit is exceeded.
- **FR-003**: System MUST NOT count successful login attempts toward the rate limit.
- **FR-004**: System MUST require authentication for ALL endpoints except: `/api/auth/login`, `/api/auth/status`, `/api/auth/logout`, `/api/health`, and `/login` (the login page itself).
- **FR-005**: System MUST require authentication for static frontend assets when accessed from non-localhost addresses.
- **FR-006**: System MUST require authentication for extension endpoints (`/extensions`, `/extensions/*`) when accessed from non-localhost addresses.
- **FR-007**: System MUST require authentication for WebSocket upgrade requests from non-localhost addresses.
- **FR-008**: System MUST issue session cookies with `HttpOnly`, `SameSite=Strict`, and a configurable `Max-Age` (default: 30 days).
- **FR-009**: System MUST validate session cookie expiration using the `issuedAt` timestamp embedded in the cookie payload.
- **FR-010**: System MUST record authentication events (login success, login failure, rate limit hit) with timestamp, source IP, and event type.
- **FR-011**: System MUST store audit log entries in persistent storage that survives server restarts.
- **FR-012**: System MUST use timing-safe comparison for all credential and token verification operations.
- **FR-013**: System MUST use a memory-hard hashing algorithm (scrypt or better) for access key storage with unique random salts.
- **FR-014**: System MUST fail closed — if the auth configuration is missing or corrupted, all non-localhost requests must be rejected.
- **FR-015**: System MUST preserve the localhost bypass for local development (requests from 127.0.0.1, ::1, ::ffff:127.0.0.1 skip authentication).

### Key Entities

- **Access Key**: The shared secret used to authenticate. Single key per instance. Stored as a salted hash.
- **Session Cookie**: Signed cookie containing authentication state and issuance timestamp. Validated on every request.
- **Rate Limit Record**: Per-IP tracking of failed login attempts within a sliding window. Ephemeral (in-memory, resets on restart).
- **Audit Log Entry**: Record of an authentication event. Contains event type, timestamp, source IP, and outcome. Stored persistently.
- **Auth Configuration**: Singleton record containing the hashed access key and cookie signing secret. Source of truth for authentication state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No unauthenticated request to any protected endpoint succeeds — 100% of non-exempt endpoints return 401 or redirect to login when no valid session is present.
- **SC-002**: After 5 failed login attempts from the same IP within 15 minutes, all subsequent attempts are blocked for the remainder of the window.
- **SC-003**: Authenticated sessions persist for the full configured duration (default 30 days) without requiring re-authentication, including across server restarts.
- **SC-004**: Every authentication event (success, failure, rate limit) is recorded in the audit log with timestamp and source IP — zero silent failures.
- **SC-006**: Login page and authentication flow complete in under 2 seconds under normal conditions.

## Assumptions

- The application is a single-instance deployment (no distributed rate limiting or session synchronization needed).
- Localhost bypass is intentional and desired for local development workflows — it is not a security gap because local users already have full system access.
- The existing scrypt-based hashing is sufficient; upgrading to Argon2id is a future consideration, not a requirement for this iteration.
- Rate limit state stored in memory is acceptable; server restarts reset the counter, which is a minor and temporary reprieve for attackers.
- The `Secure` cookie flag is not set because the application may run over HTTP locally; HTTPS enforcement is a separate infrastructure concern outside this feature's scope.
- A single access key per instance is sufficient; multi-user support is out of scope.
- Audit log retention policy is indefinite for now; log rotation or size limits can be added later.
