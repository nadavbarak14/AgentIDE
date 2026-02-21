# Quickstart: Pre-Launch Cleanup Implementation

**Feature**: 013-pre-launch-cleanup
**Branch**: `013-pre-launch-cleanup`

## Implementation Order

The implementation follows a dependency chain — each phase builds on the previous:

### Phase 1: Add Health Check Endpoint
Create `GET /api/health` before removing auth, so tests have a replacement health check.

**Files**: `backend/src/api/routes/health.ts` (new), `backend/src/hub-entry.ts` (register route)

### Phase 2: Remove Backend Auth Code
Delete auth modules, remove middleware, clean up hub-entry, simplify WebSocket.

**Files**: Delete 4 auth files, edit `hub-entry.ts`, `middleware.ts`, `websocket.ts`, `cli.ts`, `hooks.ts`

### Phase 3: Remove Auth Database & Types
Remove auth_config table creation, auth types, repository methods.

**Files**: `db.ts`, `repository.ts`, `types.ts`

### Phase 4: Remove Frontend Auth Code
Delete LicenseGate, useAuth hook, clean App.tsx and api.ts.

**Files**: Delete 2 files, edit `App.tsx`, `api.ts`

### Phase 5: Remove Dependencies
Uninstall auth-only npm packages.

**Packages**: `jose`, `selfsigned`, `cookie-parser`, `@types/cookie-parser`, `express-rate-limit`

### Phase 6: Remove Auth Tests & Fix Remaining Tests
Delete auth test files, update CLI tests, fix release test health checks.

**Files**: Delete 10+ test files, edit `cli.test.ts`, `cli-e2e.test.ts`, `critical-path.test.ts`, `server.ts`

### Phase 7: Fix Smoke Test Environment
Fix `dataDir` to be within `homeDir` in release test helpers.

**Files**: `release-tests/helpers/environment.ts`

### Phase 8: Verify
Run full test suite, lint, typecheck, build. All green.

## Key Risks

| Risk | Mitigation |
|------|-----------|
| Breaking non-auth code that accidentally depends on auth | Investigated: zero entanglement confirmed |
| Release tests fail due to health check URL change | Phase 1 adds health endpoint before Phase 2 removes auth |
| Missed auth references cause TypeScript errors | Grep sweep after removal, fix any remaining references |
| `cookie-parser` or `express-rate-limit` used elsewhere | Confirmed: auth-only usage via codebase grep |

## Verification Commands

```bash
npm run build      # Build succeeds
npm run typecheck  # No type errors
npm run lint       # No lint errors
npm test           # All unit/integration/system tests pass
npm run test:release:smoke  # All smoke tests pass
```
