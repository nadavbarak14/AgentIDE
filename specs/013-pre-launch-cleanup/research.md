# Research: Pre-Launch Cleanup — Remove Auth, Fix Tests

**Feature**: 013-pre-launch-cleanup
**Date**: 2026-02-21

## R1: Auth System Entanglement with Core Functionality

**Decision**: Auth is safe to remove — zero entanglement with core functionality.

**Rationale**: The auth system is a pure gatekeeper that gates HTTP requests (middleware) and WebSocket upgrades (JWT check) but does not participate in PTY spawning, SSH tunneling, session management, worker execution, or database operations. `req.auth` is never consumed by any business logic. No session limits are enforced via licensing — concurrent session limits come from user-configurable settings.

**Alternatives considered**: Disable auth (set `authRequired=false` always) vs. remove auth entirely. Chose full removal to eliminate dead code, reduce dependencies, and simplify the codebase for launch.

## R2: Dependencies Safe to Remove

**Decision**: Remove `jose`, `selfsigned`, `cookie-parser`, `@types/cookie-parser`, and `express-rate-limit`.

**Rationale**: All five are exclusively used by auth code:
- `jose` — JWT signing/verification in `auth/jwt.ts`
- `selfsigned` — self-signed cert generation in `auth/tls.ts`
- `cookie-parser` — JWT cookie extraction in middleware, applied in `hub-entry.ts`
- `@types/cookie-parser` — TypeScript types for cookie-parser
- `express-rate-limit` — rate limiting on `/api/auth/activate` endpoint only

None are used outside of auth routes/middleware. Confirmed via codebase grep.

**Alternatives considered**: Keep `express-rate-limit` for future rate limiting on other endpoints. Rejected — can be re-added when needed (YAGNI).

## R3: Hooks Router `authRequired` Parameter

**Decision**: Remove `authRequired` parameter from hooks router but keep localhost restriction as always-on when server binds to non-localhost.

**Rationale**: The hooks endpoint (`/api/hooks/event`) receives external events (e.g., Git push notifications). The current localhost restriction is conditional on `authRequired`. Since auth is being removed, the parameter goes away, but the defense-in-depth localhost restriction should remain unconditional — determine at startup whether the server is bound to non-localhost and pass that info instead.

**Alternatives considered**:
1. Remove localhost check entirely (SSH handles security) — rejected, defense-in-depth is cheap
2. Keep `authRequired` parameter name — rejected, misleading after auth removal

## R4: Health Check Endpoint for Release Tests

**Decision**: Create a lightweight `/api/health` endpoint that returns `{ status: "ok" }` and update all release test infrastructure to use it.

**Rationale**: Currently 25+ release tests use `/api/auth/status` as health check via `waitForHealth()` in `release-tests/helpers/server.ts`. Removing auth routes would break all release tests. A dedicated health endpoint is the standard pattern and decouples test infrastructure from feature-specific routes.

**Alternatives considered**:
1. Use `/api/sessions` as health check — rejected, semantically wrong (sessions is a resource endpoint, not a health check)
2. Use `/api/settings` — rejected, same semantic issue

## R5: TLS/HTTPS Removal

**Decision**: Remove TLS support entirely — `--tls`, `--cert`, `--key`, `--self-signed` CLI flags, `auth/tls.ts` module, `node:https` import, and all HTTPS server creation logic.

**Rationale**: SSH tunnels handle all remote transport encryption. TLS adds complexity (certificate management, self-signed cert generation) with no benefit when SSH is the only access method. The `https` module import and conditional server creation in `hub-entry.ts` can be simplified to always use `http.createServer()`.

**Alternatives considered**: Keep `--cert`/`--key` for user-provided certs. Rejected — SSH is the only remote access method, making TLS redundant.

## R6: Files to Delete vs. Edit

**Decision**: 15 files deleted entirely, 12 files edited.

### Files to DELETE (15):
| File | Reason |
|------|--------|
| `backend/src/auth/jwt.ts` | JWT signing/verification — auth only |
| `backend/src/auth/license.ts` | License validation — auth only |
| `backend/src/auth/tls.ts` | TLS cert generation — auth only |
| `backend/src/api/routes/auth.ts` | Auth API routes — auth only |
| `frontend/src/pages/LicenseGate.tsx` | License activation UI — auth only |
| `frontend/src/hooks/useAuth.ts` | Auth state hook — auth only |
| `backend/tests/unit/jwt.test.ts` | Tests for deleted module |
| `backend/tests/unit/license.test.ts` | Tests for deleted module |
| `backend/tests/unit/tls.test.ts` | Tests for deleted module |
| `backend/tests/integration/api-auth.test.ts` | Tests for deleted routes |
| `backend/tests/system/auth-lifecycle.test.ts` | Tests auth flow |
| `backend/tests/system/websocket-auth.test.ts` | Tests WebSocket auth |
| `backend/tests/system/license-lifecycle.test.ts` | Tests license flow |
| `backend/tests/system/tls-https.test.ts` | Tests TLS/HTTPS |
| `backend/tests/system/rate-limiting.test.ts` | Tests auth rate limiting |
| `backend/tests/system/middleware-order.test.ts` | Tests auth middleware ordering |
| `backend/tests/helpers/license-helper.ts` | Test helper for license generation |
| `backend/tests/system/auth-test-server.ts` | Test helper for auth server |

### Files to EDIT (12):
| File | Changes |
|------|---------|
| `backend/src/api/middleware.ts` | Remove `createAuthMiddleware` function and JWT imports |
| `backend/src/hub-entry.ts` | Remove auth imports, startup checks, middleware registration, TLS, cookie-parser |
| `backend/src/cli.ts` | Remove TLS/auth CLI flags, delete `activate` command |
| `backend/src/models/db.ts` | Remove `auth_config` table creation and seed |
| `backend/src/models/repository.ts` | Remove auth config methods (`getAuthConfig`, `updateAuthConfig`, `clearLicense`) |
| `backend/src/models/types.ts` | Remove auth types (`LicensePayload`, `AuthConfig`, `JwtPayload`, `AuthStatusResponse`) |
| `backend/src/api/websocket.ts` | Remove JWT check on upgrade, simplify function signature |
| `backend/src/api/routes/hooks.ts` | Remove `authRequired` parameter, keep localhost restriction unconditional |
| `backend/package.json` | Remove `jose`, `selfsigned`, `cookie-parser`, `express-rate-limit` |
| `frontend/src/App.tsx` | Remove `AuthGate`, `useAuth`, `LicenseGate` imports and wrapper |
| `frontend/src/services/api.ts` | Remove auth API methods and 401 event dispatch |
| `release-tests/helpers/server.ts` | Update health check URL from `/api/auth/status` to `/api/health` |

### Files to ADD (1):
| File | Reason |
|------|--------|
| `backend/src/api/routes/health.ts` | New lightweight health check endpoint |

### Test files to UPDATE (3):
| File | Changes |
|------|---------|
| `backend/tests/unit/cli.test.ts` | Remove tests for `activate` command and auth flags |
| `backend/tests/system/cli-e2e.test.ts` | Remove auth status checks, update to not reference auth |
| `release-tests/smoke/critical-path.test.ts` | Update health check test from `/api/auth/status` to `/api/health` |

## R7: Smoke Test `dataDir`/`homeDir` Issue

**Decision**: The `dataDir` is created as a sibling of `homeDir` under `tempDir`. The `isWithinHomeDir()` check rejects paths not under `$HOME`. In the test environment, `HOME` is set to `homeDir` but `dataDir` is `tempDir/data` (not under `homeDir`). Fix: make `dataDir` a subdirectory of `homeDir`.

**Rationale**: The security check `isWithinHomeDir()` validates that session working directories are within the user's home directory. In tests, `dataDir` must be within the mocked `HOME` directory. Currently `dataDir = path.join(tempDir, 'data')` but should be `dataDir = path.join(homeDir, 'data')`.

**Alternatives considered**: Modify `isWithinHomeDir()` to accept a configurable base — rejected, the security check is correct and should not be weakened for tests.
