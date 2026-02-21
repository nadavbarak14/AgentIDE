# Auth System Archive

Removed in `013-pre-launch-cleanup` (2026-02-21).

Auth was a pure gatekeeper layer — JWT middleware on HTTP, JWT check on WebSocket upgrade, license validation at startup. None of it touched core functionality (PTY, SSH, sessions, files).

## What's here

### Source files
- `backend/src/auth/jwt.ts` — JWT token creation/verification (using `jose`)
- `backend/src/auth/license.ts` — License key validation and disk persistence
- `backend/src/auth/tls.ts` — Self-signed cert generation and TLS config (using `selfsigned`)
- `backend/src/api/routes/auth.ts` — `/api/auth/*` routes (status, activate, logout)
- `frontend/src/pages/LicenseGate.tsx` — License activation UI gate
- `frontend/src/hooks/useAuth.ts` — Auth state hook

### Test files
- Unit: `jwt.test.ts`, `license.test.ts`, `tls.test.ts`
- Integration: `api-auth.test.ts`
- System: `auth-lifecycle.test.ts`, `websocket-auth.test.ts`, `license-lifecycle.test.ts`, `tls-https.test.ts`, `rate-limiting.test.ts`, `middleware-order.test.ts`
- Helpers: `license-helper.ts`, `auth-test-server.ts`
- Release: `auth-options.test.ts`, `tls-options.test.ts`

## To restore

1. Copy files back to their original paths (directory structure mirrors the repo)
2. Re-add npm deps: `npm install jose selfsigned cookie-parser @types/cookie-parser express-rate-limit`
3. Re-add `auth_config` table to `backend/src/models/db.ts` schema
4. Re-add auth types to `backend/src/models/types.ts`
5. Re-add auth methods to `backend/src/models/repository.ts`
6. Re-wire in `hub-entry.ts`, `cli.ts`, `App.tsx`, `api.ts`, `middleware.ts`, `websocket.ts`
