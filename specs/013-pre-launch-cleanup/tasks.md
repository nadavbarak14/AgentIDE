# Tasks: Pre-Launch Cleanup — Remove Auth, Fix Tests

**Input**: Design documents from `/specs/013-pre-launch-cleanup/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Auth test files are being DELETED (not written). A unit test for the new health endpoint is added. All remaining existing tests must pass after changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add health check endpoint before removing auth routes — release tests depend on a health check URL and currently use `/api/auth/status`. This must exist before auth is removed.

- [x] T001 Create health check route returning `{ status: "ok" }` in `backend/src/api/routes/health.ts`
- [x] T002 Register health route in Express app in `backend/src/hub-entry.ts` — add `app.use('/api/health', createHealthRouter())` before auth routes
- [x] T003 Write unit test for health endpoint in `backend/tests/unit/health.test.ts`

**Checkpoint**: `GET /api/health` returns 200 `{ status: "ok" }`. Existing tests still pass.

---

## Phase 2: User Story 1 - Remove Authentication Barrier (Priority: P1)

**Goal**: Remove all auth checks so the app is immediately accessible without any authentication — locally and remotely. Dashboard loads directly, API endpoints never return 401 for missing auth, WebSocket connects without JWT.

**Independent Test**: Start the app with `--host 0.0.0.0`, open browser, verify dashboard loads with no license gate. Hit any API endpoint without cookies — all return data, never 401.

### Implementation for User Story 1

- [x] T004 [US1] Remove auth middleware from `backend/src/api/middleware.ts` — delete `createAuthMiddleware` function and its JWT imports (`verifyToken`, `COOKIE_NAME`). Keep `requestLogger`, `errorHandler`, `validateUuid`, `validateBody`, `sanitizePath`.
- [x] T005 [US1] Remove WebSocket JWT validation from `backend/src/api/websocket.ts` — delete the JWT auth check block in the upgrade handler (lines checking `authRequired && jwtSecret`), remove `jwtSecret` and `authRequired` parameters from `setupWebSocket` signature, remove `verifyToken`/`COOKIE_NAME` import
- [x] T006 [US1] Clean up `backend/src/hub-entry.ts` — this is the largest edit:
  - Remove imports: `cookieParser`, `https`, `loadTlsConfig`, `generateSelfSignedCert`, `validateLicense`, `loadLicenseFromDisk`, `createAuthMiddleware`, `createAuthRouter`
  - Remove from `HubOptions` interface: `tls`, `certPath`, `keyPath`, `selfSigned`, `noAuth`
  - Remove `authRequired` calculation and `isHttps` variable
  - Remove startup license validation block
  - Remove `authConfig` retrieval and `authRequired` DB update
  - Remove `app.use(cookieParser())`
  - Remove `app.use('/api/auth', createAuthRouter(...))`
  - Remove `app.use('/api', createAuthMiddleware(...))`
  - Simplify server creation: replace `if (isHttps) { https.createServer(...) } else { http.createServer(...) }` with just `const server = http.createServer(app)`
  - Update `setupWebSocket` call to remove `jwtSecret` and `authRequired` args
  - Remove auth-related startup log messages
- [x] T007 [US1] Update hooks router in `backend/src/api/routes/hooks.ts` — remove `authRequired` parameter from `createHooksRouter`. Keep localhost restriction but make it unconditional: pass `isRemote` boolean instead (true when server binds to non-localhost). Update the corresponding call in `hub-entry.ts`.
- [x] T008 [US1] Remove auth CLI flags and activate command from `backend/src/cli.ts` — remove `--tls`, `--cert`, `--key`, `--self-signed`, `--no-auth` options from `start` command. Delete entire `activate` command block. Remove corresponding options from the action handler object passed to `startHub()`.
- [x] T009 [US1] Remove AuthGate from `frontend/src/App.tsx` — remove `useAuth` import, `LicenseGate` import, entire `AuthGate` component. Simplify `App()` to render `<BrowserRouter><Routes>...</Routes></BrowserRouter>` directly without the AuthGate wrapper.
- [x] T010 [P] [US1] Remove auth API methods from `frontend/src/services/api.ts` — delete the 401 `auth:unauthorized` event dispatch from the request helper, delete `AuthStatus` and `ActivateResponse` interfaces, delete the entire `auth` API object (`status`, `activate`, `logout` methods).

**Checkpoint**: App starts in remote mode (0.0.0.0) without auth. Dashboard loads directly. No 401s on any endpoint. WebSocket connects without JWT.

---

## Phase 3: User Story 2 - Clean Up Auth Code and Dependencies (Priority: P2)

**Goal**: Delete all dead auth files, remove unused npm dependencies, clean up types and repository methods. Zero auth artifacts remain in source code.

**Independent Test**: `npm run build && npm run typecheck && npm run lint` all pass. `grep -r "jwt\|LicenseGate\|auth_config\|createAuthMiddleware" backend/src/ frontend/src/` returns zero results.

### Implementation for User Story 2

#### Delete auth source files

- [x] T011 [P] [US2] Delete `backend/src/auth/jwt.ts`
- [x] T012 [P] [US2] Delete `backend/src/auth/license.ts`
- [x] T013 [P] [US2] Delete `backend/src/auth/tls.ts`
- [x] T014 [P] [US2] Delete `backend/src/api/routes/auth.ts`
- [x] T015 [P] [US2] Delete `frontend/src/pages/LicenseGate.tsx`
- [x] T016 [P] [US2] Delete `frontend/src/hooks/useAuth.ts`

#### Delete auth test files

- [x] T017 [P] [US2] Delete `backend/tests/unit/jwt.test.ts`
- [x] T018 [P] [US2] Delete `backend/tests/unit/license.test.ts`
- [x] T019 [P] [US2] Delete `backend/tests/unit/tls.test.ts`
- [x] T020 [P] [US2] Delete `backend/tests/integration/api-auth.test.ts`
- [x] T021 [P] [US2] Delete `backend/tests/system/auth-lifecycle.test.ts`
- [x] T022 [P] [US2] Delete `backend/tests/system/websocket-auth.test.ts`
- [x] T023 [P] [US2] Delete `backend/tests/system/license-lifecycle.test.ts`
- [x] T024 [P] [US2] Delete `backend/tests/system/tls-https.test.ts`
- [x] T025 [P] [US2] Delete `backend/tests/system/rate-limiting.test.ts`
- [x] T026 [P] [US2] Delete `backend/tests/system/middleware-order.test.ts`
- [x] T027 [P] [US2] Delete `backend/tests/helpers/license-helper.ts`
- [x] T028 [P] [US2] Delete `backend/tests/system/auth-test-server.ts`

#### Clean up remaining references

- [x] T029 [US2] Remove auth types from `backend/src/models/types.ts` — delete `LicensePayload`, `AuthConfig`, `JwtPayload`, `AuthStatusResponse` interfaces and the `Auth & Licensing` section comment
- [x] T030 [US2] Remove auth repository methods from `backend/src/models/repository.ts` — delete `rowToAuthConfig` helper function, `getAuthConfig()`, `updateAuthConfig()`, `clearLicense()` methods, and remove `AuthConfig` from imports
- [x] T031 [US2] Update `backend/tests/unit/cli.test.ts` — remove tests for `activate` command, `--tls`, `--cert`, `--key`, `--self-signed`, `--no-auth` flags. Keep tests for `start` command with remaining flags (`-p`, `-H`).
- [x] T032 [US2] Update `backend/tests/system/cli-e2e.test.ts` — remove any references to `/api/auth/status`, auth activation, or license-related test cases. Keep non-auth CLI tests.

#### Remove npm dependencies

- [x] T033 [US2] Remove auth-only npm packages from `backend/package.json` — run `npm uninstall jose selfsigned cookie-parser @types/cookie-parser express-rate-limit` from the `backend/` directory

#### Verification sweep

- [x] T034 [US2] Run `npm run build && npm run typecheck && npm run lint` — fix any remaining compilation errors from dangling auth references. Grep `backend/src/` and `frontend/src/` for `jwt`, `license`, `LicenseGate`, `auth_config`, `createAuthMiddleware`, `COOKIE_NAME`, `authRequired` — remove any remaining occurrences.

**Checkpoint**: Zero auth artifacts in source code. Build, typecheck, and lint all pass clean.

---

## Phase 4: User Story 4 - Remove Auth Database Table (Priority: P4)

**Goal**: Stop creating `auth_config` table on new installations. Existing databases with the table are unaffected.

**Independent Test**: Delete the local `.db` file, start the app, verify `auth_config` table does not exist in the new database (check via `sqlite3` or app startup logs).

- [x] T035 [US4] Remove `auth_config` table creation from `backend/src/models/db.ts` — delete the `CREATE TABLE IF NOT EXISTS auth_config (...)` statement and the `INSERT OR IGNORE INTO auth_config (...)` seed statement from the schema initialization

**Checkpoint**: Fresh DB has no `auth_config` table. App starts normally with existing DBs that have the table.

---

## Phase 5: User Story 3 - Fix Release Smoke Test Failures (Priority: P3)

**Goal**: All release smoke tests pass. Fix the `dataDir`/`homeDir` path mismatch and update health check URLs.

**Independent Test**: Run `npm run test:release:smoke` — all tests pass (6/6).

- [x] T036 [US3] Fix `dataDir` path in `release-tests/helpers/environment.ts` — change `dataDir` from `path.join(tempDir, 'data')` to `path.join(homeDir, 'data')` so it falls within the mocked `$HOME` directory, satisfying the `isWithinHomeDir()` security check
- [x] T037 [US3] Update health check URL in `release-tests/helpers/server.ts` — change `waitForHealth` from fetching `/api/auth/status` to `/api/health`
- [x] T038 [US3] Update `release-tests/smoke/critical-path.test.ts` — change the health endpoint test from checking `/api/auth/status` with `authRequired` field to checking `/api/health` with `status: "ok"` response

**Checkpoint**: `npm run test:release:smoke` — all smoke tests pass.

---

## Phase 6: Polish & Verification

**Purpose**: Full verification that all changes are correct and nothing is broken.

- [x] T039 Run full test suite: `npm test` — all unit, integration, and system tests pass
- [x] T040 Run release smoke tests: `npm run test:release:smoke` — all smoke tests pass
- [x] T041 Run full build: `npm run build` — both backend and frontend build cleanly
- [x] T042 Final grep sweep: search `backend/src/`, `frontend/src/`, and `release-tests/` for any remaining auth artifacts (`jwt`, `license`, `LicenseGate`, `auth_config`, `selfsigned`, `cookie-parser`, `createAuthMiddleware`) — confirm zero results in active source files (spec files are OK)
- [x] T043 Push branch, create PR, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 — health endpoint must exist before auth routes are removed
- **Phase 3 (US2)**: Depends on Phase 2 — auth code must be disconnected before files are deleted
- **Phase 4 (US4)**: Depends on Phase 3 — types/methods must be removed before DB schema cleanup
- **Phase 5 (US3)**: Depends on Phase 1 (health endpoint) and Phase 3 (auth test files deleted) — can run in parallel with Phase 4
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — can start after T001-T003
- **US2 (P2)**: Depends on US1 — files can only be deleted after code references are removed
- **US4 (P4)**: Depends on US2 — DB cleanup after repository methods removed
- **US3 (P3)**: Depends on Foundational + US2 — smoke test fixes need health endpoint and auth test cleanup

### Parallel Opportunities

Within Phase 2 (US1):
- T004 and T005 can run in parallel (different files: middleware.ts vs websocket.ts)
- T009 and T010 can run in parallel (different files: App.tsx vs api.ts)
- T006 must run before T007 (hooks.ts depends on hub-entry.ts changes)

Within Phase 3 (US2):
- ALL file deletions (T011-T028) can run in parallel
- T029 and T030 can run in parallel (different files: types.ts vs repository.ts)
- T031 and T032 can run in parallel (different test files)
- T033 depends on T011-T028 (delete files before uninstalling deps)
- T034 depends on all previous US2 tasks

Within Phase 5 (US3):
- T036, T037, T038 can run in parallel (different files)

---

## Parallel Example: User Story 2 (File Deletions)

```bash
# All auth source files can be deleted simultaneously:
Delete backend/src/auth/jwt.ts
Delete backend/src/auth/license.ts
Delete backend/src/auth/tls.ts
Delete backend/src/api/routes/auth.ts
Delete frontend/src/pages/LicenseGate.tsx
Delete frontend/src/hooks/useAuth.ts

# All auth test files can be deleted simultaneously:
Delete backend/tests/unit/jwt.test.ts
Delete backend/tests/unit/license.test.ts
Delete backend/tests/unit/tls.test.ts
Delete backend/tests/integration/api-auth.test.ts
Delete backend/tests/system/auth-lifecycle.test.ts
Delete backend/tests/system/websocket-auth.test.ts
Delete backend/tests/system/license-lifecycle.test.ts
Delete backend/tests/system/tls-https.test.ts
Delete backend/tests/system/rate-limiting.test.ts
Delete backend/tests/system/middleware-order.test.ts
Delete backend/tests/helpers/license-helper.ts
Delete backend/tests/system/auth-test-server.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001-T003)
2. Complete Phase 2: US1 (T004-T010)
3. **STOP and VALIDATE**: Start app in remote mode, verify no auth prompts, all endpoints accessible
4. The app is now functional without auth — this is the core deliverable

### Incremental Delivery

1. Phase 1 → Health endpoint ready
2. Phase 2 (US1) → Auth barrier removed → **App is usable** (MVP!)
3. Phase 3 (US2) → Dead code cleaned up → Codebase is lean
4. Phase 4 (US4) → DB schema cleaned → Fresh installs are clean
5. Phase 5 (US3) → Smoke tests fixed → Release pipeline is green
6. Phase 6 → Full verification → Ready to merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T006 (hub-entry.ts) is the most complex single task — it touches imports, interface, startup logic, middleware registration, server creation, and logging
- File deletions are low-risk and highly parallelizable
- Run `npm run typecheck` frequently during Phase 2 to catch dangling references early
- Auth references in `specs/` directories are documentation and should NOT be removed
