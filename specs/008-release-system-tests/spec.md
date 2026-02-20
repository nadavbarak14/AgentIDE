# Feature Specification: Release-Ready System Tests

**Feature Branch**: `008-release-system-tests`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Comprehensive release-ready system tests for the auth, licensing, TLS, and CLI features. Real-life end-to-end tests that exercise the full product as a user would experience it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auth Lifecycle Verification (Priority: P1)

A release engineer wants to verify that the complete authentication lifecycle works correctly before shipping. This means confirming that: (a) local development mode requires zero authentication, (b) remote mode enforces authentication on all protected resources, (c) a user can activate a license key, receive a session cookie, access all features, log out, and re-authenticate — all as a seamless flow.

**Why this priority**: Authentication is the foundation of the product's security. If auth flows are broken, remote access is either blocked entirely or dangerously open. This is the highest-risk area for a release.

**Independent Test**: Run the auth lifecycle test suite in isolation. It should start a real server, exercise the full activation flow, and verify every state transition (unauthenticated → authenticated → logged out → re-authenticated).

**Acceptance Scenarios**:

1. **Given** a server running in localhost mode, **When** any protected route is requested without credentials, **Then** the request succeeds (no auth friction for local dev)
2. **Given** a server running in remote mode, **When** a protected route is requested without credentials, **Then** the server returns an authentication-required error
3. **Given** a server running in remote mode, **When** a valid license key is submitted, **Then** the server returns license details and sets a session cookie
4. **Given** an authenticated session, **When** a protected route is requested with the session cookie, **Then** the request succeeds
5. **Given** an authenticated session, **When** the user logs out, **Then** the session cookie is cleared and subsequent requests to protected routes are rejected
6. **Given** a logged-out session, **When** a valid license key is submitted again, **Then** a new session cookie is issued and access is restored

---

### User Story 2 - Middleware Stack & Route Protection Verification (Priority: P1)

A release engineer wants to confirm that the server's route protection rules are correctly applied: authentication routes are always accessible (so users can activate and check status), webhook/hook routes are always accessible (so local processes can report events), and all other routes are protected when auth is enabled.

**Why this priority**: Misconfigured middleware ordering could either lock users out of the activation flow or leave protected routes open. This is critical for security correctness.

**Independent Test**: Run the middleware order test suite. It should verify the accessibility of each route category (auth routes, hook routes, protected routes) in remote mode without any credentials.

**Acceptance Scenarios**:

1. **Given** a server running in remote mode with no credentials, **When** the auth status endpoint is requested, **Then** the server responds successfully (auth routes are unprotected)
2. **Given** a server running in remote mode with no credentials, **When** the activation endpoint is requested, **Then** the server responds (accepts the request for processing)
3. **Given** a server running in remote mode with no credentials, **When** the hook endpoint is requested, **Then** the server responds successfully (hooks are unprotected)
4. **Given** a server running in remote mode with no credentials, **When** a settings, sessions, or workers endpoint is requested, **Then** the server rejects with an authentication error
5. **Given** a malformed request body, **When** sent to any endpoint, **Then** the server returns a client error (not a server crash)

---

### User Story 3 - License Validation & Edge Cases (Priority: P1)

A release engineer wants to verify that the license key validation handles all edge cases correctly: expired keys are rejected, tampered keys are rejected, missing-field keys are rejected, and mid-session license expiry is caught.

**Why this priority**: License validation is the gate that controls product access. Incorrect validation means either paying customers are locked out or unauthorized users gain access.

**Independent Test**: Run the license lifecycle test suite. It should test various invalid license keys and verify the server rejects them with clear errors, and test the scenario where a license expires after a session cookie has been issued.

**Acceptance Scenarios**:

1. **Given** a server running in remote mode, **When** an expired license key is submitted, **Then** the server rejects it with an expiry error
2. **Given** a server running in remote mode, **When** a tampered license key is submitted, **Then** the server rejects it with a validation error
3. **Given** a server running in remote mode, **When** a license key with missing fields is submitted, **Then** the server rejects it with a format error
4. **Given** a valid session cookie whose underlying license has since expired, **When** a protected route is requested, **Then** the server rejects the request (license expiry enforced even with valid cookie)
5. **Given** an expired license session, **When** a new valid license key is submitted, **Then** a fresh session is created and access is restored
6. **Given** a successful activation, **When** the auth status is checked, **Then** the response includes the license holder's email and plan

---

### User Story 4 - WebSocket Authentication (Priority: P2)

A release engineer wants to verify that WebSocket connections (used for terminal streaming) are properly protected by the same authentication system as regular routes.

**Why this priority**: WebSocket connections provide direct terminal access. If WebSocket auth is broken, an attacker could bypass the license gate and gain terminal access to the server.

**Independent Test**: Run the WebSocket auth test suite. It should attempt WebSocket connections with and without valid credentials in both localhost and remote modes.

**Acceptance Scenarios**:

1. **Given** a server running in localhost mode, **When** a WebSocket connection is attempted without credentials, **Then** the connection succeeds
2. **Given** a server running in remote mode, **When** a WebSocket connection is attempted without credentials, **Then** the connection is rejected
3. **Given** a server running in remote mode, **When** a WebSocket connection is attempted with a valid session cookie, **Then** the connection succeeds
4. **Given** a server running in remote mode, **When** a WebSocket connection is attempted with an invalid cookie, **Then** the connection is rejected

---

### User Story 5 - Rate Limiting Verification (Priority: P2)

A release engineer wants to confirm that brute-force protection is active on the license activation endpoint, preventing attackers from guessing license keys.

**Why this priority**: Without rate limiting, an attacker could attempt thousands of license key combinations. This is essential for security but lower priority than core auth correctness.

**Independent Test**: Run the rate limiting test suite. It should submit multiple invalid license keys rapidly and verify the server blocks further attempts after the threshold.

**Acceptance Scenarios**:

1. **Given** a server running in remote mode, **When** 5 failed activation attempts are made from the same source, **Then** each returns an authentication error (not yet rate limited)
2. **Given** 5 prior failed activation attempts, **When** a 6th attempt is made, **Then** the server returns a rate-limit error indicating the caller should wait
3. **Given** a mix of successful and failed attempts, **When** only failures are counted, **Then** successful activations do not consume the rate limit budget

---

### User Story 6 - HTTPS/TLS Server Verification (Priority: P2)

A release engineer wants to verify that the server can operate over HTTPS with self-signed certificates, and that security-related cookie flags are set correctly when using TLS.

**Why this priority**: HTTPS is required for secure remote access (preventing man-in-the-middle attacks), but is an additive security layer on top of the already-working auth system.

**Independent Test**: Run the TLS test suite. It should start an HTTPS server with a self-signed certificate and verify it responds to requests, sets secure cookie flags, and supports WebSocket over TLS.

**Acceptance Scenarios**:

1. **Given** a server started with self-signed TLS enabled, **When** an HTTPS request is made, **Then** the server responds successfully
2. **Given** a server running with TLS, **When** a license key is activated, **Then** the session cookie includes the Secure flag
3. **Given** a server running with TLS, **When** a WebSocket connection is attempted over the secure protocol, **Then** the connection succeeds

---

### User Story 7 - CLI End-to-End Verification (Priority: P3)

A release engineer wants to verify that the command-line interface correctly launches the server, respects configuration flags, and can be cleanly shut down. This tests the product as a user would install and run it.

**Why this priority**: The CLI is the user's entry point. While important, it wraps functionality already tested in other stories. CLI-specific bugs (argument parsing, process lifecycle) are lower risk than auth or security bugs.

**Independent Test**: Run the CLI end-to-end test suite. It should spawn real CLI subprocesses, verify they start servers that respond to HTTP requests, and verify clean shutdown behavior.

**Acceptance Scenarios**:

1. **Given** the CLI is invoked with a start command and port, **When** the server finishes starting, **Then** it responds to HTTP requests
2. **Given** the CLI is started with default settings, **When** the auth status is checked, **Then** authentication is not required (localhost mode)
3. **Given** the CLI is started with remote host binding, **When** the auth status is checked, **Then** authentication is required
4. **Given** the CLI is started with remote host binding and auth disabled, **When** the auth status is checked, **Then** authentication is not required (override)
5. **Given** the CLI is started with TLS and self-signed cert flags, **When** an HTTPS request is made, **Then** the server responds
6. **Given** a running CLI server, **When** a shutdown signal is sent, **Then** the process exits cleanly
7. **Given** a running CLI server in remote mode, **When** a license is activated and a session is created via the API, **Then** the session appears in the session list (full product flow)

---

### Edge Cases

- What happens when a session cookie is presented after the server restarts (new secret generated)? The cookie should be rejected and the user re-prompted for activation.
- What happens when multiple rapid activation requests succeed? Each should issue a fresh cookie and the last one should be the active session.
- What happens when an invalid JSON body is sent to the activation endpoint? The server should return a clear client error, not crash.
- What happens when a WebSocket upgrade is attempted for a non-existent session? The connection should be rejected regardless of auth state.
- What happens when the CLI process is killed abruptly (not via signal)? Subsequent test runs should not be blocked by stale state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The test suite MUST start real server instances that listen on network ports and respond to actual network requests
- **FR-002**: The test suite MUST exercise the complete authentication flow end-to-end: unauthenticated request → license activation → authenticated request → logout → re-authentication
- **FR-003**: The test suite MUST verify that auth routes (status, activate, logout) are accessible without credentials in remote mode
- **FR-004**: The test suite MUST verify that protected routes (settings, sessions, workers) reject requests without valid credentials in remote mode
- **FR-005**: The test suite MUST verify that hook/webhook routes are accessible without credentials in remote mode
- **FR-006**: The test suite MUST verify WebSocket connections are protected by the same auth system as regular routes
- **FR-007**: The test suite MUST verify rate limiting activates after the configured threshold of failed activation attempts
- **FR-008**: The test suite MUST verify HTTPS server operation with self-signed certificates
- **FR-009**: The test suite MUST verify cookie security flags (Secure flag set when using TLS)
- **FR-010**: The test suite MUST spawn real CLI subprocesses and verify server startup, configuration flags, and clean shutdown
- **FR-011**: The test suite MUST verify expired, tampered, and malformed license keys are rejected with appropriate errors
- **FR-012**: The test suite MUST verify that license expiry is enforced on subsequent requests even after a valid session cookie was issued
- **FR-013**: The test suite MUST use isolated resources (in-memory databases, temporary directories) to prevent interference between tests and with production data
- **FR-014**: The test suite MUST complete within a reasonable timeout (under 2 minutes for the full suite)
- **FR-015**: The test suite MUST work in CI environments without manual intervention or special setup

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All system tests pass on a clean checkout with a single command (zero manual setup beyond dependency installation)
- **SC-002**: The test suite covers all 7 user stories with at least 45 individual test cases
- **SC-003**: Each user story's tests can be run independently and pass in isolation
- **SC-004**: The full system test suite completes in under 120 seconds
- **SC-005**: Zero test flakiness — tests produce the same result on 3 consecutive runs
- **SC-006**: Tests detect real regressions — intentionally breaking auth middleware causes at least 5 test failures

### Assumptions

- A development RSA keypair exists at `~/.agentide/` for test license key generation (generated during prior feature setup)
- The existing mock PTY spawner pattern is sufficient to avoid spawning real terminal processes in tests
- In-memory databases provide sufficient fidelity for system tests (SQLite in-memory behaves identically to on-disk for the features under test)
- Tests run on a system where ephemeral TCP ports are available for server binding
- CLI subprocess tests may be slower than in-process tests, and a 120-second total timeout is acceptable
