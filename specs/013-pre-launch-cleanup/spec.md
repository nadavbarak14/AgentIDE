# Feature Specification: Pre-Launch Cleanup — Remove Auth, Fix Tests

**Feature Branch**: `013-pre-launch-cleanup`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "what do we need to do before launch? i might want to remove all the auth, the SSH should be enough to connect to remote, and for now it is just my tool, and free. lets remove the auth by default now, so we don't need it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove Authentication Barrier (Priority: P1)

As a user starting the application, I should be able to access the dashboard immediately without encountering a license gate, activation flow, or any authentication step — whether running locally or remotely. SSH provides the security layer for remote access, so in-app auth is unnecessary overhead.

**Why this priority**: Authentication is the most visible friction point. Removing it is the core request and affects every user interaction from the moment the app loads.

**Independent Test**: Start the app with `--host 0.0.0.0` (remote mode) and verify the dashboard loads directly without any license prompt or auth check. All API endpoints respond without 401 errors. WebSocket connections establish without JWT validation.

**Acceptance Scenarios**:

1. **Given** the app is started in local mode (127.0.0.1), **When** a user opens the browser, **Then** the dashboard loads immediately with no auth prompts
2. **Given** the app is started in remote mode (0.0.0.0), **When** a user opens the browser, **Then** the dashboard loads immediately with no auth prompts (same as local)
3. **Given** the app is running, **When** any API request is made, **Then** the response is never 401 and no auth cookie is required
4. **Given** the app is running, **When** a WebSocket connection is initiated, **Then** the connection succeeds without JWT validation

---

### User Story 2 - Clean Up Auth Code and Dependencies (Priority: P2)

As a developer maintaining this codebase, I should not have dead auth code, unused dependencies, or orphaned database tables cluttering the project. All auth-related code, tests, types, frontend components, CLI commands, and dependencies should be removed so the codebase is lean and comprehensible.

**Why this priority**: Dead code increases maintenance burden, confuses future contributors, and adds unnecessary build weight. Cleaning it up simplifies the codebase for launch.

**Independent Test**: After removal, run full build (`npm run build`), lint (`npm run lint`), and typecheck (`npm run typecheck`) — all pass with zero errors. Grep the codebase for auth-related terms (jwt, license, LicenseGate, auth_config) and confirm no references remain in active source code.

**Acceptance Scenarios**:

1. **Given** auth code is removed, **When** the project builds, **Then** there are zero TypeScript errors, zero lint errors, and the build succeeds
2. **Given** auth code is removed, **When** searching source files for auth artifacts, **Then** no references to JWT, license validation, LicenseGate, auth middleware, or auth_config remain in active code
3. **Given** auth dependencies are removed, **When** checking package.json, **Then** `jose`, `selfsigned`, and other auth-only dependencies are no longer listed
4. **Given** the `--no-auth` CLI flag is removed, **When** running `agentide start --help`, **Then** the flag does not appear in help output
5. **Given** the `agentide activate` CLI command is removed, **When** running `agentide --help`, **Then** the activate command does not appear

---

### User Story 3 - Fix Release Smoke Test Failures (Priority: P3)

As a developer preparing for launch, I need all test suites to pass — including release smoke tests. Currently, 2 of 6 smoke tests fail because the test environment's `dataDir` is not within `homeDir`, violating the `isWithinHomeDir()` security check. This must be fixed before launch.

**Why this priority**: Passing tests are a gate for launch confidence. The fix is small (test environment setup) but blocks release validation.

**Independent Test**: Run `npm run test:release:smoke` and verify all 6 tests pass, including session creation and WebSocket connection tests.

**Acceptance Scenarios**:

1. **Given** the test environment is set up, **When** running release smoke tests, **Then** all smoke tests pass
2. **Given** the `dataDir` is configured correctly in test helpers, **When** a session is created via the API, **Then** it returns a success status (not 403)
3. **Given** the test environment is set up, **When** a WebSocket connection is attempted, **Then** it connects successfully without timeout

---

### User Story 4 - Remove Auth Database Table (Priority: P4)

As a developer, I want the `auth_config` database table removed from the schema so new installations don't create unnecessary tables, and the codebase doesn't reference auth data structures.

**Why this priority**: Lower priority because it doesn't affect user experience directly, but keeps the schema clean and avoids confusion about unused tables.

**Independent Test**: Start the app fresh (delete existing database), verify the `auth_config` table is not created. Existing databases with the table continue to work (table is simply ignored).

**Acceptance Scenarios**:

1. **Given** a fresh installation, **When** the app starts and initializes the database, **Then** the `auth_config` table is not created
2. **Given** an existing database with `auth_config` table, **When** the app starts, **Then** it does not error — the table is simply unused
3. **Given** auth repository methods are removed, **When** the project builds, **Then** no references to `getAuthConfig`, `updateAuthConfig`, or `clearLicense` remain

---

### Edge Cases

- What happens if someone passes the removed `--no-auth` flag? The CLI shows a standard "unknown option" error.
- What happens with existing databases that have `auth_config` populated? The app ignores it — no migration needed to drop the table, just stop creating it.
- What if `cookie-parser` or `express-rate-limit` is used elsewhere? Confirmed: both are auth-only — safe to remove.
- What happens to TLS support (`--tls`, `--cert`, `--key`, `--self-signed` flags)? Remove it — SSH tunnels handle all remote transport encryption, making TLS redundant.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST serve the dashboard to all users without any authentication check, regardless of bind address (localhost or remote)
- **FR-002**: System MUST NOT include auth middleware in the API request pipeline
- **FR-003**: System MUST NOT validate JWT tokens on WebSocket upgrade requests
- **FR-004**: System MUST NOT create the `auth_config` database table on new installations
- **FR-005**: System MUST NOT include the `--no-auth` CLI flag or `activate` CLI command
- **FR-006**: System MUST remove all auth-related frontend components (LicenseGate, useAuth hook, auth API methods, AuthGate wrapper)
- **FR-007**: System MUST remove all auth-related backend code (JWT module, license module, auth routes, auth middleware function)
- **FR-008**: System MUST remove auth-related npm dependencies that are not used elsewhere
- **FR-009**: System MUST remove all auth-related test files (unit tests for JWT/license, integration tests for auth API, system tests for auth lifecycle and WebSocket auth)
- **FR-010**: System MUST pass all remaining tests, linting, and type checking after auth removal
- **FR-011**: System MUST fix the release smoke test environment so `dataDir` is within `homeDir`, resolving the failing smoke tests
- **FR-012**: All release smoke tests MUST pass after fixes
- **FR-013**: System MUST remove TLS support (`--tls`, `--cert`, `--key`, `--self-signed` CLI flags) and the TLS module, since SSH handles all remote transport encryption

### Key Entities

- **auth_config table**: Database table to stop creating (existing instances ignored, not dropped)
- **Auth middleware**: Express middleware to remove from the request pipeline
- **LicenseGate**: Frontend page component to remove
- **useAuth hook**: Frontend React hook to remove
- **Auth routes**: `/api/auth/*` endpoint handlers to remove
- **TLS module**: Backend module for certificate generation and loading — to be removed

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users access the full application immediately upon opening it — zero auth-related screens or prompts appear in any mode
- **SC-002**: All automated tests pass (unit, integration, system, and release smoke tests) — 100% green across all suites
- **SC-003**: The codebase contains zero references to removed auth concepts (JWT, license key, LicenseGate, auth_config) in active source files
- **SC-004**: Build output size decreases due to removed auth dependencies and frontend components
- **SC-005**: The application starts and operates correctly in both local (127.0.0.1) and remote (0.0.0.0) modes without any auth-related errors or warnings in logs

## Clarifications

### Session 2026-02-21

- Q: Will removing auth break core functionality (terminals, file browser, SSH worker connections)? → A: No. Auth is a pure gatekeeper — it gates HTTP requests and WebSocket upgrades but does not participate in PTY spawning, SSH tunneling, session management, worker execution, or database operations. `req.auth` is never consumed by any business logic. Removal has zero functional impact.
- Q: Are `cookie-parser` and `express-rate-limit` used outside of auth? → A: No. Both are exclusively used by auth code (`cookie-parser` for JWT cookie extraction, `express-rate-limit` for activation endpoint). Safe to remove.
- Q: Does the license enforce session limits? → A: No. `licenseMaxSessions` is stored in `auth_config` but never checked during session creation. Concurrent session limits come from user-configurable settings, independent of licensing.
- Q: Should TLS support be kept or removed? → A: Remove it. SSH handles all remote transport encryption, making TLS redundant.

## Assumptions

- SSH provides sufficient security for remote access, making in-app authentication unnecessary for this phase
- The tool is currently free and personal-use, so licensing infrastructure is not needed
- Auth can be re-introduced later if the product evolves to require it (this is a removal, not a permanent architectural decision)
- Existing users with populated `auth_config` tables will not experience errors — the table is simply ignored
- `cookie-parser` and `express-rate-limit` are confirmed auth-only — safe to remove
