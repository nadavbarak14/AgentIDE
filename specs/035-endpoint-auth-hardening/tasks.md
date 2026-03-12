# Tasks: Endpoint Authentication Hardening

**Input**: Design documents from `/specs/035-endpoint-auth-hardening/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and prepare shared types/schema needed by multiple stories

- [X] T001 Install `express-rate-limit@^8.2.1` dependency in `backend/package.json` and run `npm install`
- [X] T002 [P] Add `AuthAuditEntry` interface to `backend/src/models/types.ts` with fields: id (number), eventType ('login_success' | 'login_failure' | 'rate_limited' | 'logout'), sourceIp (string), details (string | null), createdAt (string)
- [X] T003 [P] Add `auth_audit_log` table creation SQL to the schema in `backend/src/models/db.ts` and add a migration function to create the table + index on `created_at` for existing databases

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add repository methods for audit logging that multiple user stories depend on

**CRITICAL**: US1 and US4 both need audit log writes, so these must be done first

- [X] T004 Add `logAuthEvent(eventType: string, sourceIp: string, details?: string): void` method to the Repository class in `backend/src/models/repository.ts` — INSERT into `auth_audit_log`
- [X] T005 Add `getAuthAuditLog(limit?: number): AuthAuditEntry[]` method to the Repository class in `backend/src/models/repository.ts` — SELECT from `auth_audit_log` ORDER BY `created_at` DESC with default limit 50
- [X] T006 Write unit tests for `logAuthEvent()` and `getAuthAuditLog()` in `backend/tests/unit/auth-audit.test.ts` — test insert, retrieval order, limit parameter, empty log, event type values

**Checkpoint**: Audit log infrastructure ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Brute Force Protection on Login (Priority: P1) MVP

**Goal**: Rate-limit the login endpoint to 5 failed attempts per IP per 15-minute window, so brute-force attacks are blocked

**Independent Test**: Send 6+ failed login requests from same IP and verify 6th returns 429 with Retry-After header

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [X] T007 [P] [US1] Add rate limiting integration tests to `backend/tests/integration/api-auth.test.ts`: (1) 5 failed attempts return 401, 6th returns 429 with Retry-After header, (2) successful login does not count toward limit, (3) rate limit error message matches contract ("Too many failed attempts. Try again in 15 minutes."), (4) RateLimit headers present in responses. Note: rate limiter is a singleton — these tests should run in their own describe block and the rate limiter should be reset between tests or the test suite should account for shared state

### Implementation for User Story 1

- [X] T008 [US1] Add rate limiter middleware to the login route in `backend/src/api/routes/auth.ts`: import `express-rate-limit`, create `loginLimiter` with config: windowMs=15*60*1000, max=5, skipSuccessfulRequests=true, standardHeaders=true, legacyHeaders=false, message={error: 'Too many failed attempts. Try again in 15 minutes.', retryAfter: 900}. Apply as middleware to `POST /login` route. Export the limiter instance for test access/reset
- [X] T009 [US1] Add audit logging calls to the login handler in `backend/src/api/routes/auth.ts`: log `login_success` on successful login (with source IP), log `login_failure` on failed login (with source IP). The Repository instance is available via the route's closure. Get source IP from `req.ip || req.socket.remoteAddress`

**Checkpoint**: Rate limiting works — 6th failed attempt from same IP returns 429. Successful logins don't count. All events logged.

---

## Phase 4: User Story 2 - All Endpoints Require Authentication (Priority: P1)

**Goal**: Close auth gaps so every endpoint (except login flow + health check) requires a valid session from non-localhost IPs

**Independent Test**: Send unauthenticated requests to every endpoint from a non-localhost IP and verify all return 401 or redirect to /login, except the exempt list

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [X] T010 [P] [US2] Add endpoint auth coverage integration tests to `backend/tests/integration/api-auth.test.ts`: (1) unauthenticated GET to `/api/inspect-bridge.js` returns 401 or redirect, (2) unauthenticated GET to `/api/widget-bridge.js` returns 401 or redirect, (3) unauthenticated GET to `/api/extensions` returns 401, (4) unauthenticated GET to `/extensions/some-file` returns 401 or redirect, (5) exempt endpoints still work without auth: GET `/api/health` returns 200, GET `/login` returns 200, GET `/api/auth/status` returns 200, POST `/api/auth/login` accepts requests (may return 401 for wrong key but not for missing session)
- [X] T011 [P] [US2] Add fail-closed unit test to `backend/tests/unit/auth-middleware.test.ts`: when `authConfig` is null and request is from non-localhost IP, middleware should return 401 (not call next())

### Implementation for User Story 2

- [X] T012 [US2] Change fail-open to fail-closed in `backend/src/api/middleware.ts`: in the `requireAuth` function, when `repo.getAuthConfig()` returns null and the request is NOT from localhost, return 401 (API) or redirect to /login (HTML) instead of calling `next()`. Localhost requests still pass through regardless
- [X] T013 [US2] Reorder route registration in `backend/src/hub-entry.ts` to move bridge scripts and extension endpoints AFTER the `requireAuth(repo)` middleware call. Currently `/api/inspect-bridge.js`, `/api/widget-bridge.js`, `/api/extensions`, and `/extensions/*` are registered in positions where they bypass auth. Move them after line 399 (the requireAuth middleware). Ensure the bridge scripts still serve correctly with proper Content-Type headers

**Checkpoint**: All endpoints except the exempt list (health, login page, auth routes) return 401 for unauthenticated non-localhost requests. Fail-closed behavior works.

---

## Phase 5: User Story 3 - Long-Lived Sessions That Actually Work (Priority: P2)

**Goal**: Verify and ensure sessions persist for 30 days, survive server restarts, and expire correctly

**Independent Test**: Create a session, verify it works, verify it survives restart simulation, verify it expires after 30 days (mock time)

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [X] T014 [P] [US3] Add session persistence tests to `backend/tests/integration/api-auth.test.ts`: (1) cookie is set with maxAge=2592000 (30 days in seconds), (2) cookie has HttpOnly and SameSite=Strict flags, (3) valid cookie authenticates requests successfully, (4) cookie with issuedAt older than 30 days is rejected (use auth-service's `createCookieValue` with a mocked timestamp or set `maxAgeDays` parameter), (5) expired cookie is cleared (Set-Cookie with maxAge=0)

### Implementation for User Story 3

- [X] T015 [US3] Verify and fix session cookie configuration in `backend/src/api/routes/auth.ts`: confirm `res.cookie('adyx_auth', ...)` sets maxAge to 2592000000 (30 days in milliseconds), httpOnly to true, sameSite to 'strict', path to '/'. If any setting is wrong or missing, fix it. Also verify `validateCookieValue` in `backend/src/services/auth-service.ts` uses the same 30-day window for `issuedAt` validation

**Checkpoint**: Sessions last exactly 30 days, have correct security flags, and are properly rejected after expiration.

---

## Phase 6: User Story 4 - Security Audit Trail (Priority: P3)

**Goal**: Add a queryable audit log endpoint so users can see login attempts and check for suspicious activity

**Independent Test**: Perform login attempts (success + failure), then GET `/api/auth/audit-log` and verify all events appear with correct data

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [X] T016 [P] [US4] Add audit log endpoint integration tests to `backend/tests/integration/api-auth.test.ts`: (1) GET `/api/auth/audit-log` returns 401 without auth, (2) GET `/api/auth/audit-log` with valid auth returns JSON with entries array, (3) after a failed login, the audit log contains a `login_failure` entry with source IP, (4) after a successful login, the audit log contains a `login_success` entry, (5) `limit` query parameter limits results, (6) entries are in reverse chronological order

### Implementation for User Story 4

- [X] T017 [US4] Add `GET /audit-log` route to the auth router in `backend/src/api/routes/auth.ts`: this endpoint requires authentication (it's behind requireAuth since it uses the auth router but is a GET that checks auth status — add explicit auth check or register it after requireAuth). Parse `limit` query param (default 50, max 500), call `repo.getAuthAuditLog(limit)`, return `{ entries }`. The route must be registered as a protected route
- [X] T018 [US4] Add audit logging to the logout handler in `backend/src/api/routes/auth.ts`: log `logout` event with source IP when `POST /logout` is called

**Checkpoint**: Audit log captures all auth events and is queryable via authenticated API endpoint.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: System-level validation and final integration testing

- [X] T019 Add system test for full auth hardening flow in `backend/tests/system/auth-flow.test.ts`: (1) unauthenticated access to protected endpoint is blocked, (2) login with wrong key fails and is logged, (3) login with correct key succeeds and is logged, (4) authenticated access to protected endpoints works, (5) after 5 failed attempts from same IP, rate limiting kicks in, (6) audit log endpoint shows all events, (7) logout clears session and is logged
- [X] T020 Run `npm test && npm run lint` in `backend/` to verify all tests pass and no lint errors
- [ ] T021 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T002, T003 from Setup — BLOCKS US1 and US4
- **US1 (Phase 3)**: Depends on T001 (express-rate-limit installed) + Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 1 only (no audit log dependency) — can run in parallel with US1
- **US3 (Phase 5)**: No dependencies beyond Phase 1 — can run in parallel with US1 and US2
- **US4 (Phase 6)**: Depends on Phase 2 completion (audit log repo methods)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Needs express-rate-limit (T001) + audit repo methods (T004). Independent of other stories.
- **US2 (P1)**: Needs nothing beyond existing codebase. Independent of other stories.
- **US3 (P2)**: Needs nothing beyond existing codebase. Independent of other stories.
- **US4 (P3)**: Needs audit repo methods (T004, T005). Independent of other stories.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks within a story are sequential (each builds on previous)
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T004 and T005 can run sequentially (same file, but independent methods)
- US2 and US3 can start as soon as Phase 1 is done (no Phase 2 dependency)
- US1 and US4 can start as soon as Phase 2 is done
- All test tasks marked [P] within a phase can run in parallel with implementation tasks in other stories

---

## Parallel Example: After Phase 2 Completion

```bash
# These can all start simultaneously:
# Agent A: US1 - Rate limiting (needs express-rate-limit + audit methods)
# Agent B: US2 - Endpoint coverage (independent, only modifies hub-entry.ts + middleware.ts)
# Agent C: US3 - Session validation (independent, only verifies auth.ts + auth-service.ts)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (install dep, add types, add table)
2. Complete Phase 2: Foundational (audit repo methods + tests)
3. Complete Phase 3: US1 — Rate limiting on login
4. Complete Phase 4: US2 — All endpoints require auth
5. **STOP and VALIDATE**: Rate limiting works, all endpoints protected, fail-closed
6. This is the MVP — the two most critical security gaps are closed

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 → Rate limiting works → No more brute force
3. Add US2 → All endpoints protected → No data leaks
4. Add US3 → Sessions verified → User experience confirmed
5. Add US4 → Audit trail → Peace of mind
6. Polish → System tests → CI green → Merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Rate limiter singleton state: tests must account for shared state across test cases (use resetKey() or isolated instances)
- Bridge scripts in iframes already have auth cookies — requiring auth won't break them
- Fail-closed change means corrupted DB = app inaccessible from remote (correct behavior)
- Commit after each task or logical group
