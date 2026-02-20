# Tasks: Product Security, Licensing & CLI

**Input**: Design documents from `/specs/007-auth-licensing-cli/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies, generate dev keypair, create license generation tooling

- [x] T001 Install backend dependencies (jose, cookie-parser, express-rate-limit, commander, selfsigned, @types/cookie-parser) in backend/package.json
- [x] T002 [P] Generate RSA-2048 dev keypair and create license key generator script in tools/generate-license.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, type definitions, repository methods, and license validation core — MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add auth_config table migration (singleton pattern matching settings table) in backend/src/models/db.ts
- [x] T004 [P] Add auth type definitions (LicensePayload, AuthConfig, JwtPayload, AuthStatusResponse) in backend/src/models/types.ts
- [x] T005 Add auth repository methods (getAuthConfig, updateAuthConfig, clearLicense, rowToAuthConfig) in backend/src/models/repository.ts
- [x] T006 [P] Create RSA license key validation module (validateLicense, loadLicenseFromDisk, saveLicenseToDisk) in backend/src/auth/license.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Local Developer Uses AgentIDE Without Friction (Priority: P1) MVP

**Goal**: When hub binds to localhost (default), all features work with zero auth friction — no license prompt, no cookies, no middleware blocking

**Independent Test**: Run `agentide start` (default localhost), open `localhost:3000`, verify dashboard loads with all features and no auth prompts

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T007 [US1] Integration test for localhost mode — verify all API routes return 200 without cookies in backend/tests/integration/api-auth.test.ts

### Implementation for User Story 1

- [x] T008 [US1] Refactor hub-entry.ts to export startHub(options: HubOptions) with authRequired computed from host binding in backend/src/hub-entry.ts
- [x] T009 [US1] Create createAuthMiddleware(jwtSecret, authRequired) that passes through when authRequired=false in backend/src/api/middleware.ts
- [x] T010 [US1] Wire cookieParser and requireAuth middleware into Express stack (after auth routes, before protected routes) in backend/src/hub-entry.ts

**Checkpoint**: Localhost mode fully functional — dashboard loads without any auth checks

---

## Phase 4: User Story 2 — License Key Activation and Gated Access (Priority: P1)

**Goal**: Valid license key → JWT cookie → dashboard access. Invalid/expired keys rejected with clear errors. Browser license gate when accessing remote hub without cookie.

**Independent Test**: Generate test license key, start hub with `--host 0.0.0.0`, visit from browser, verify license gate appears, enter key, verify dashboard loads and cookie is set

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [P] [US2] Unit test for license key parsing, RSA signature validation, expired key rejection in backend/tests/unit/license.test.ts
- [x] T012 [P] [US2] Unit test for JWT sign/verify, cookie helpers, expired token handling in backend/tests/unit/jwt.test.ts
- [x] T013 [US2] Integration test for auth endpoints — POST /api/auth/activate (valid, invalid, expired), GET /api/auth/status, POST /api/auth/logout, 401 on protected routes in backend/tests/integration/api-auth.test.ts

### Implementation for User Story 2

- [x] T014 [US2] Create JWT sign/verify module using jose (HMAC-SHA256, 30-day expiry) and cookie helpers (setAuthCookie, clearAuthCookie) in backend/src/auth/jwt.ts
- [x] T015 [US2] Create auth API routes — POST /api/auth/activate, GET /api/auth/status (never 401), POST /api/auth/logout in backend/src/api/routes/auth.ts
- [x] T016 [US2] Add JWT verification on WebSocket upgrade (parse cookie from request.headers.cookie, reject if invalid and authRequired=true) in backend/src/api/websocket.ts
- [x] T017 [US2] Wire auth router into Express stack before requireAuth middleware (auth routes are unprotected) in backend/src/hub-entry.ts
- [x] T018 [P] [US2] Create useAuth hook — calls GET /api/auth/status on mount, returns { loading, authenticated, authRequired, email, plan, recheckAuth } in frontend/src/hooks/useAuth.ts
- [x] T019 [P] [US2] Create LicenseGate page — centered card with license key input, activate button, error display, calls POST /api/auth/activate in frontend/src/pages/LicenseGate.tsx
- [x] T020 [US2] Add auth API methods (auth.status, auth.activate, auth.logout) and 401 interceptor (dispatch auth:unauthorized event) in frontend/src/services/api.ts
- [x] T021 [US2] Wrap routes with auth gate — useAuth check: loading→spinner, !authenticated→LicenseGate, authenticated→dashboard in frontend/src/App.tsx

**Checkpoint**: License-gated access fully functional — remote mode requires valid key, localhost mode unaffected

---

## Phase 5: User Story 3 — Secure Remote Access From Any Device (Priority: P2)

**Goal**: HTTPS/TLS support for secure remote access. Self-signed or user-provided certs. Rate limiting on auth endpoint to prevent brute force.

**Independent Test**: Start hub with `--host 0.0.0.0 --tls --self-signed`, visit from another device over HTTPS, verify certificate works, verify license gate appears, verify rate limiting activates after 5 failed attempts

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T022 [P] [US3] Unit test for TLS cert loading and self-signed generation in backend/tests/unit/tls.test.ts
- [x] T023 [US3] Integration test for rate limiting (6th attempt returns 429) and HTTPS server startup in backend/tests/integration/api-auth.test.ts

### Implementation for User Story 3

- [x] T024 [P] [US3] Create TLS module — loadTlsConfig(certPath, keyPath), generateSelfSignedCert() storing in ~/.agentide/tls/ in backend/src/auth/tls.ts
- [x] T025 [US3] Add HTTPS server creation (https.createServer when TLS config provided, else http.createServer) in backend/src/hub-entry.ts
- [x] T026 [US3] Add express-rate-limit to POST /api/auth/activate (5 attempts per 15 min per IP, 429 response with retryAfter) in backend/src/api/routes/auth.ts
- [x] T027 [US3] Set cookie Secure flag conditionally (true when HTTPS active) in setAuthCookie helper in backend/src/auth/jwt.ts

**Checkpoint**: Secure remote access functional — HTTPS works, brute force blocked

---

## Phase 6: User Story 4 — Easy Installation via CLI (Priority: P2)

**Goal**: Single `npm install -g agentide` installs the product. `agentide start` launches hub, `agentide activate <key>` activates license, `agentide --help/--version` work correctly.

**Independent Test**: Run `npm install -g .` from repo root, run `agentide --help`, verify commands listed, run `agentide start`, verify hub starts

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T028 [US4] Unit test for CLI command parsing — verify start options (port, host, tls, cert, key, self-signed), activate argument parsing, help/version output in backend/tests/unit/cli.test.ts

### Implementation for User Story 4

- [x] T029 [US4] Create CLI entry point with commander — `agentide start` (options: --port, --host, --tls, --cert, --key, --self-signed) and `agentide activate <license-key>` commands in backend/src/cli.ts
- [x] T030 [P] [US4] Add bin field ("agentide": "./backend/dist/cli.js") to root package.json
- [x] T031 [US4] Add CLI build step — ensure shebang preservation and chmod +x in build scripts in backend/package.json

**Checkpoint**: CLI fully functional — package installable globally, commands work

---

## Phase 7: User Story 5 — Remote Workers via SSH Private Key (Priority: P3)

**Goal**: Add remote workers by providing SSH host, username, and private key path. Hub connects via SSH key-based auth (no password). Sessions run on remote workers with terminal output streaming back.

**Independent Test**: Start hub, add remote worker via dashboard with SSH host + username + private key path, verify connection, create session targeting remote worker, verify terminal output streams

### Tests for User Story 5 (MANDATORY per Constitution Principle I)

- [x] T032 [US5] Integration test for SSH private key worker connection (key file validation, connection error handling, passphrase rejection) in backend/tests/integration/ssh-worker.test.ts

### Implementation for User Story 5

- [x] T033 [US5] Add privateKeyPath field to worker types and database schema in backend/src/models/types.ts
- [x] T034 [US5] Implement SSH private key authentication in worker connection (read key file, pass to ssh2 client, no password fallback) in backend/src/hub/tunnel-manager.ts
- [x] T035 [US5] Add worker add validation — verify key file exists, is readable, detect and reject passphrase-protected keys with clear error message in backend/src/hub/tunnel-manager.ts
- [x] T036 [US5] Update worker add API to accept and validate privateKeyPath field in backend/src/api/routes/workers.ts
- [x] T037 [P] [US5] Update frontend worker add form to include private key file path input field

**Checkpoint**: Remote workers fully functional — SSH key-based connection, session execution, and terminal streaming working

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, security audit, and cleanup

- [x] T038 [P] Run quickstart.md validation — verify all manual testing scenarios work
- [x] T039 Verify test coverage across all user stories (license, JWT, auth API, TLS, CLI, SSH worker)
- [x] T040 Security audit — validate cookie settings (httpOnly, secure, sameSite), error message sanitization (no stack traces), input validation on all endpoints
- [ ] T041 Push branch, wait for CI green, rebase-merge to main

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — can start immediately after Phase 2
- **US2 (Phase 4)**: Depends on US1 (Phase 3) — auth middleware must exist before auth enforcement
- **US3 (Phase 5)**: Depends on US2 (Phase 4) — TLS/rate-limiting builds on auth routes
- **US4 (Phase 6)**: Depends on US1 (Phase 3) — CLI wraps startHub(), can run parallel with US2/US3
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) — SSH refinement is independent of auth
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 — needs auth middleware and hub refactor in place
- **User Story 3 (P2)**: Depends on US2 — TLS and rate limiting build on auth routes
- **User Story 4 (P2)**: Depends on US1 — CLI calls startHub(), can be parallel with US2/US3
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) — independent of auth system

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Foundation modules (license, JWT) before routes
- Routes before frontend
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002 can run in parallel with T001 (different files)
- T004 and T006 can run in parallel with T003/T005 (different files)
- T011 and T012 can run in parallel (different test files)
- T018 and T019 can run in parallel (different frontend files)
- T022 and T024 can run in parallel (test + implementation in different files)
- US4 (CLI) can be developed in parallel with US2/US3 after US1 is done
- US5 (SSH workers) can be developed in parallel with US2/US3/US4 after Phase 2

---

## Parallel Example: User Story 2

```bash
# Launch tests in parallel (different files):
Task: "Unit test for license key validation in backend/tests/unit/license.test.ts"        # T011
Task: "Unit test for JWT sign/verify in backend/tests/unit/jwt.test.ts"                    # T012

# Launch frontend components in parallel (different files):
Task: "Create useAuth hook in frontend/src/hooks/useAuth.ts"                               # T018
Task: "Create LicenseGate page in frontend/src/pages/LicenseGate.tsx"                      # T019
```

## Parallel Example: After Foundational Phase

```bash
# These user stories can run in parallel tracks:
# Track A: US1 → US2 → US3 (auth pipeline)
# Track B: US4 (CLI, after US1)
# Track C: US5 (SSH workers, independent)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (install deps, generate keypair)
2. Complete Phase 2: Foundational (db schema, types, repository, license module)
3. Complete Phase 3: User Story 1 (localhost zero-friction)
4. Complete Phase 4: User Story 2 (license gate + auth)
5. **STOP and VALIDATE**: Test both stories — localhost works without auth, remote mode requires license
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Localhost works (MVP baseline!)
3. Add User Story 2 → Test independently → License-gated access (MVP complete!)
4. Add User Story 3 → Test independently → HTTPS + rate limiting
5. Add User Story 4 → Test independently → CLI packaging
6. Add User Story 5 → Test independently → SSH remote workers
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US2 → US3 (auth pipeline)
   - Developer B: US4 (CLI, starts after US1 done)
   - Developer C: US5 (SSH workers, independent)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- `jose` library (not `jsonwebtoken`) for JWT — per research.md decision
- `node:crypto` RSA-PSS for license validation — no external dependency
- License key format: `base64url(payload).base64url(RSA-PSS-SHA256-signature)`
- Cookie name: `agentide_session`
- Auth middleware order: cookieParser → authRouter (unprotected) → requireAuth → protected routes
