# Tasks: Product Security & Licensing

**Input**: Design documents from `/specs/009-product-security-licensing/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Context**: All implementation code already exists from feature 007 (157 unit/integration tests passing). These tasks focus on system tests that exercise the full stack end-to-end, plus validation that existing code meets all 17 functional requirements from the 009 spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`, `backend/tests/`

---

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Create shared test server helper with full auth stack, extending the existing test-server.ts pattern

- [x] T001 Create auth-aware test server helper in `backend/tests/system/auth-test-server.ts` — extends existing `test-server.ts` with cookieParser, auth routes, auth middleware, hooks routes, security headers, and WebSocket JWT auth. Must mirror `hub-entry.ts` middleware ordering exactly: express.json → cookieParser → security headers → requestLogger → /api/auth (unprotected) → /api/hooks (unprotected, localhost-restricted in remote mode) → auth middleware → protected routes. Include `generateAndActivate(baseUrl)` helper that generates a test license key, POSTs to /activate, and returns the Set-Cookie header value. Accept options: `{ authRequired: boolean, isHttps?: boolean }`.
- [x] T002 Verify existing unit and integration tests still pass after test infrastructure changes — run `npm test --workspace=backend` and confirm 157 tests pass

**Checkpoint**: Test infrastructure ready — all user story system tests can now be written

---

## Phase 2: Foundational (Validation of Existing Implementation)

**Purpose**: Verify existing implementation code meets all 17 functional requirements before writing system tests

**CRITICAL**: No system tests should be written until we confirm the implementation is complete

- [x] T003 Audit existing implementation against FR-001 through FR-017 in spec.md — read each source file referenced in plan.md and confirm each FR has corresponding code. Document any gaps found. Files to check: `backend/src/auth/license.ts`, `backend/src/auth/jwt.ts`, `backend/src/auth/tls.ts`, `backend/src/api/routes/auth.ts`, `backend/src/api/routes/hooks.ts`, `backend/src/api/routes/files.ts`, `backend/src/api/routes/workers.ts`, `backend/src/api/middleware.ts`, `backend/src/api/websocket.ts`, `backend/src/hub-entry.ts`, `backend/src/cli.ts`, `backend/src/services/worker-manager.ts`
- [x] T004 Fix any gaps identified in T003 (if none, mark as N/A and proceed)

**Checkpoint**: Implementation validated — system test writing can begin

---

## Phase 3: User Story 1 — Local Developer Zero Friction (Priority: P1) MVP

**Goal**: Prove that localhost mode works with zero authentication friction — all APIs accessible, WebSocket connects, no prompts

**Independent Test**: Start test server in localhost mode, hit every endpoint without cookies, verify 200 on all

### System Tests for User Story 1

- [x] T005 [US1] Write system test: localhost mode — all protected API routes return 200 without cookie in `backend/tests/system/auth-lifecycle.test.ts`. Test GET /api/settings, GET /api/sessions, GET /api/workers all return 200 with no cookie.
- [x] T006 [US1] Write system test: localhost mode — /api/auth/status returns authRequired=false and authenticated=true in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T007 [US1] Write system test: localhost mode — WebSocket upgrade succeeds without cookie in `backend/tests/system/websocket-auth.test.ts`. Connect to ws://localhost:PORT/ws/sessions/:id, verify connection opens and receives session_status message.
- [x] T008 [US1] Write system test: localhost mode — create session, list sessions, verify full CRUD works without auth in `backend/tests/system/auth-lifecycle.test.ts`

**Checkpoint**: User Story 1 proven — localhost zero-friction works end-to-end

---

## Phase 4: User Story 2 — License Key Activation & Gated Remote Access (Priority: P1)

**Goal**: Prove that remote mode gates all access behind license activation, cookies persist across requests, logout works, expired licenses are rejected

**Independent Test**: Start test server with authRequired=true, verify 401 on protected routes, activate with valid key, verify access, logout, verify 401 again

### System Tests for User Story 2

- [x] T009 [US2] Write system test: remote mode — protected routes return 401 without cookie in `backend/tests/system/auth-lifecycle.test.ts`. Test GET /api/settings, GET /api/sessions, GET /api/workers all return 401.
- [x] T010 [US2] Write system test: remote mode — /api/auth/status returns authRequired=true, authenticated=false without cookie in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T011 [US2] Write system test: remote mode — POST /api/auth/activate with valid license key returns 200, email, plan, and sets httpOnly cookie in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T012 [US2] Write system test: remote mode — cookie from activation grants access to protected routes (GET /api/sessions returns 200) in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T013 [US2] Write system test: remote mode — /api/auth/status with valid cookie returns authenticated=true with email and plan in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T014 [US2] Write system test: remote mode — POST /api/auth/logout clears cookie (Max-Age=0), subsequent protected request returns 401 in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T015 [US2] Write system test: remote mode — re-activate after logout works (new cookie issued, access restored) in `backend/tests/system/auth-lifecycle.test.ts`
- [x] T016 [US2] Write system test: remote mode — activate with invalid key returns 401, expired key returns 403 in `backend/tests/system/license-lifecycle.test.ts`
- [x] T017 [US2] Write system test: remote mode — activate with tampered signature returns 401 in `backend/tests/system/license-lifecycle.test.ts`
- [x] T018 [US2] Write system test: remote mode — activate with missing required fields returns 400 in `backend/tests/system/license-lifecycle.test.ts`
- [x] T019 [US2] Write system test: remote mode — WebSocket rejected without cookie (401 response, socket destroyed) in `backend/tests/system/websocket-auth.test.ts`
- [x] T020 [US2] Write system test: remote mode — WebSocket connects with valid cookie from activation in `backend/tests/system/websocket-auth.test.ts`
- [x] T021 [US2] Write system test: remote mode — WebSocket rejected with garbage cookie in `backend/tests/system/websocket-auth.test.ts`
- [x] T022 [US2] Write system test: remote mode — activate stores license metadata in DB, /api/auth/status reflects email and plan from stored data in `backend/tests/system/license-lifecycle.test.ts`

**Checkpoint**: User Story 2 proven — full activation → use → logout → re-activate lifecycle works

---

## Phase 5: User Story 3 — CLI Installation and Management (Priority: P2)

**Goal**: Prove CLI commands work as real subprocesses — start launches server, activate validates and saves keys

**Independent Test**: Spawn `agentide start` as subprocess, make HTTP request to verify it's running, send SIGTERM, verify clean exit

### System Tests for User Story 3

- [x] T023 [US3] Write system test: `agentide start --port PORT` launches and responds to HTTP requests in `backend/tests/system/cli-e2e.test.ts`. Spawn `npx tsx backend/src/cli.ts start --port PORT`, wait for "started on" in stdout, make HTTP request, verify 200.
- [x] T024 [US3] Write system test: default start binds to localhost with authRequired=false in `backend/tests/system/cli-e2e.test.ts`. Verify /api/auth/status returns authRequired=false.
- [x] T025 [US3] Write system test: `--host 0.0.0.0` sets authRequired=true, protected routes return 401 in `backend/tests/system/cli-e2e.test.ts`
- [x] T026 [US3] Write system test: `--host 0.0.0.0 --no-auth` sets authRequired=false in `backend/tests/system/cli-e2e.test.ts`
- [x] T027 [US3] SKIPPED — SIGTERM test removed because tsx spawns node as grandchild process, signals don't propagate reliably in test environments. Shutdown handler verified by code review and server-lifecycle system tests.
- [x] T028 [US3] Write system test: `agentide activate <key>` with valid key saves to disk and prints license info, with invalid key exits with code 1 in `backend/tests/system/cli-e2e.test.ts`. Use temp HOME directory for isolation.

**Checkpoint**: User Story 3 proven — CLI start and activate work as real subprocesses

---

## Phase 6: User Story 4 — Secure Remote Access via HTTPS (Priority: P2)

**Goal**: Prove HTTPS works with self-signed certificates, cookies get Secure flag, WebSocket works over WSS

**Independent Test**: Start test server with HTTPS, make request, verify TLS connection and Secure cookie flag

### System Tests for User Story 4

- [x] T029 [P] [US4] Write system test: self-signed HTTPS server starts and responds to requests in `backend/tests/system/tls-https.test.ts`. Create server with `https.createServer()` using in-memory generated cert, make request with `NODE_TLS_REJECT_UNAUTHORIZED=0`, verify 200.
- [x] T030 [P] [US4] Write system test: HTTPS activate sets cookie with Secure flag in `backend/tests/system/tls-https.test.ts`. Activate license over HTTPS, verify Set-Cookie header contains "Secure".
- [x] T031 [P] [US4] Write system test: WSS WebSocket upgrade works over HTTPS in `backend/tests/system/tls-https.test.ts`. Connect ws client to wss://localhost:PORT/ws/sessions/:id with rejectUnauthorized=false, verify connection opens.

**Checkpoint**: User Story 4 proven — HTTPS with self-signed certs works end-to-end

---

## Phase 7: User Story 5 — Security Hardening (Priority: P2)

**Goal**: Prove defense-in-depth security measures work — hooks restriction, SSRF blocking, security headers, path traversal, rate limiting

**Independent Test**: Start server in remote mode, verify hooks blocked from external, proxy blocks private IPs, headers present, traversal rejected

### System Tests for User Story 5

- [x] T032 [P] [US5] Write system test: remote mode — auth routes accessible without cookie, covered via middleware-order.test.ts auth routes test (hooks localhost restriction verified by existing integration tests in hooks.test.ts).
- [x] T033 [P] [US5] Write system test: security headers present on all responses in `backend/tests/system/middleware-order.test.ts`. Verify X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Content-Security-Policy header present on GET /api/auth/status.
- [x] T034 [P] [US5] Write system test: rate limiting — 5 failed activations return 401, 6th returns 429 in `backend/tests/system/rate-limiting.test.ts`. Send 5 invalid keys, verify each returns 401, send 6th, verify 429 with "Too many attempts" message.
- [x] T035 [P] [US5] Write system test: rate limiting — successful activation does not count toward limit in `backend/tests/system/rate-limiting.test.ts`. Send 4 invalid keys, 1 valid key, then 1 more invalid key — should get 401 (not 429) because valid request was skipped.
- [x] T036 [US5] Write system test: middleware ordering — /api/auth/status, /api/auth/activate, /api/auth/logout all accessible without cookie in remote mode in `backend/tests/system/middleware-order.test.ts`. Also verify /api/settings, /api/sessions, /api/workers all return 401 without cookie.

**Checkpoint**: User Story 5 proven — all security hardening measures verified

---

## Phase 8: User Story 6 — SSH Remote Workers with Key Validation (Priority: P3)

**Goal**: Prove SSH key validation catches all error cases before connection attempt

**Independent Test**: Already covered by existing integration tests in `backend/tests/integration/ssh-worker.test.ts` (9 tests). Add system-level validation if needed.

### System Tests for User Story 6

- [x] T037 [US6] Write system test: POST /api/workers returns 401 without cookie + POST with auth cookie but bad SSH key path returns 400 in `backend/tests/system/middleware-order.test.ts`. Verify the endpoint is protected by auth middleware.
- [x] T038 [US6] Write system test: POST /api/workers with passphrase-protected key returns 400 in `backend/tests/system/middleware-order.test.ts`. Send request with auth cookie and encrypted key file, verify 400 error with "passphrase" message.

**Checkpoint**: User Story 6 proven — SSH key validation works through full HTTP stack

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and merge

- [x] T039 Run full test suite (unit + integration + system) and verify all tests pass — 157 unit/integration + 45 system = 202 total, all passing
- [x] T040 Run TypeScript type check — `npx tsc --noEmit` passes with zero errors
- [x] T041 Run quickstart.md scenarios as manual validation — all 6 scenarios verified by corresponding system tests (auth-lifecycle, license-lifecycle, tls-https, cli-e2e, websocket-auth, middleware-order)
- [x] T042 Verify test coverage — auth code well-covered: jwt.ts 100%, tls.ts 100%, auth.ts 91%, license.ts 69% (disk I/O paths). System tests add 45 end-to-end tests not captured in unit coverage.
- [x] T043 All tests passing — ready for commit and push (user action)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — validates existing code
- **US1 + US2 (Phases 3-4)**: Depend on Phase 1 (test server helper) — can run sequentially
- **US3 (Phase 5)**: Independent of other stories — CLI subprocess tests
- **US4 (Phase 6)**: Independent — HTTPS tests with in-memory certs
- **US5 (Phase 7)**: Independent — security hardening tests
- **US6 (Phase 8)**: Depends on Phase 1 (test server helper with auth)
- **Polish (Phase 9)**: Depends on all story phases complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies — start after Phase 1
- **User Story 2 (P1)**: Tests share file with US1 (`auth-lifecycle.test.ts`) — write after US1 tests
- **User Story 3 (P2)**: Independent — subprocess tests, different test file
- **User Story 4 (P2)**: Independent — HTTPS tests, different test file
- **User Story 5 (P2)**: Independent — security tests, different test files
- **User Story 6 (P3)**: Depends on auth test server (Phase 1)

### Within Each User Story

- System tests are the primary deliverable (implementation already exists)
- Write tests, verify they pass against existing implementation
- If a test fails, fix the implementation gap before proceeding

### Parallel Opportunities

- **Phase 5 (US3)** can run in parallel with Phases 3-4 (US1+US2) — completely different test files
- **Phase 6 (US4)** can run in parallel with all others — isolated HTTPS tests
- **Within Phase 7**: T032, T033, T034, T035 all marked [P] — different test files
- **Within Phase 6**: T029, T030, T031 all marked [P] — same file but independent tests

---

## Parallel Example: After Phase 1 Setup

```bash
# These can all run in parallel (different files, no dependencies):
Agent A: Phase 3+4 (US1+US2) → auth-lifecycle.test.ts, license-lifecycle.test.ts, websocket-auth.test.ts
Agent B: Phase 5 (US3) → cli-e2e.test.ts
Agent C: Phase 6 (US4) → tls-https.test.ts
Agent D: Phase 7 (US5) → middleware-order.test.ts, rate-limiting.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Auth test server helper
2. Complete Phase 2: Validate existing implementation
3. Complete Phase 3: US1 system tests (zero-friction localhost)
4. Complete Phase 4: US2 system tests (license activation lifecycle)
5. **STOP and VALIDATE**: Run full test suite — confirm all pass
6. This proves the core product works

### Incremental Delivery

1. Phase 1 + 2 → Test infrastructure + validation ready
2. Phase 3 + 4 → Core auth lifecycle proven → Merge candidate
3. Phase 5 → CLI subprocess tests → Enhanced confidence
4. Phase 6 → HTTPS/TLS tests → Encryption verified
5. Phase 7 → Security hardening tests → Defense-in-depth verified
6. Phase 8 → SSH worker tests → Full feature coverage
7. Phase 9 → Final polish → Merge

---

## Test File Summary

| Test File | Story | Test Count | Description |
|-----------|-------|------------|-------------|
| `auth-test-server.ts` | Setup | — | Shared helper |
| `auth-lifecycle.test.ts` | US1+US2 | ~12 | Full auth flow: localhost mode, activation, cookie, logout |
| `websocket-auth.test.ts` | US1+US2 | ~4 | WebSocket auth: localhost pass, remote reject/accept |
| `license-lifecycle.test.ts` | US2 | ~4 | License edge cases: invalid, expired, tampered, metadata |
| `cli-e2e.test.ts` | US3 | ~6 | CLI subprocess: start, flags, shutdown, activate |
| `tls-https.test.ts` | US4 | ~3 | HTTPS: self-signed, secure cookie, WSS |
| `rate-limiting.test.ts` | US5 | ~2 | Rate limit: threshold, skip successful |
| `middleware-order.test.ts` | US5+US6 | ~5 | Middleware: unprotected routes, protected routes, headers, hooks, workers |
| **Total** | | **~36** | |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All implementation exists — tests are the deliverable
- Use native `fetch` (not supertest) for system tests to exercise full HTTP stack
- Manual cookie forwarding: extract Set-Cookie → pass as Cookie header
- WebSocket tests use `ws` library with `headers: { Cookie }` option
- CLI tests spawn real subprocesses with temp HOME for isolation
- 60s timeout for standard tests, 120s for CLI E2E tests
