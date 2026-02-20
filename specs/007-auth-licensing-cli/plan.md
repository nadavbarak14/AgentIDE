# Implementation Plan: Product Security, Licensing & CLI

**Branch**: `007-auth-licensing-cli` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-auth-licensing-cli/spec.md`

## Summary

Add license key validation (RSA-signed, offline), cookie-based auth (license key IS the credential), HTTPS/TLS support, CLI packaging (`agentide start`/`activate`), and SSH remote worker refinement. Auth is enforced only when hub is bound to a non-localhost address. Local development remains zero-friction.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, jose (JWT), commander (CLI), cookie-parser, express-rate-limit, selfsigned (TLS)
**Storage**: SQLite (better-sqlite3) — existing `c3.db`, one new table: `auth_config`
**Testing**: Vitest 2.1 (unit + integration + system)
**Target Platform**: Linux/macOS server, web browser (React 18 frontend)
**Project Type**: Web application (backend + frontend monorepo)
**Performance Goals**: License validation < 1 second (offline, node:crypto RSA verify)
**Constraints**: Offline-only license validation (no external server calls). Zero auth friction on localhost.
**Scale/Scope**: Single admin user. 5 new backend dependencies. 11 new files, 8 modified files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for license/JWT/TLS, integration tests for auth API, system tests for full flow |
| II. UX-First Design | PASS | Localhost = zero friction. Remote = single license key entry, 30-day cookie. No password. |
| III. UI Quality & Consistency | PASS | LicenseGate page uses existing Tailwind dark theme. Consistent error messages. |
| IV. Simplicity | PASS | No OAuth/SSO/multi-user. License key = auth. One table. One middleware. |
| V. CI/CD Pipeline | PASS | New tests added to existing CI. PR-based workflow maintained. |
| VI. Frontend Plugin Quality | PASS | No new frontend plugins. All new deps are backend-only (jose, commander, etc.) |
| VII. Backend Security | PASS | This feature IS the security implementation. RSA validation, JWT cookies, rate limiting, HTTPS. |
| VIII. Observability | PASS | All auth events logged via existing pino logger (activation, failures, rate limits). |

**Post-design re-check**: All gates still pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-auth-licensing-cli/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── auth-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── auth/
│   │   ├── license.ts         # NEW: RSA license key validation
│   │   ├── jwt.ts             # NEW: JWT sign/verify with jose
│   │   └── tls.ts             # NEW: TLS cert loading + self-signed generation
│   ├── api/
│   │   ├── middleware.ts       # MODIFIED: add requireAuth middleware
│   │   ├── websocket.ts        # MODIFIED: JWT check on upgrade
│   │   └── routes/
│   │       └── auth.ts         # NEW: /api/auth/* endpoints
│   ├── models/
│   │   ├── db.ts               # MODIFIED: add auth_config table
│   │   ├── types.ts            # MODIFIED: add auth types
│   │   └── repository.ts       # MODIFIED: add auth config methods
│   ├── hub-entry.ts            # MODIFIED: refactor to startHub(), add auth/TLS
│   └── cli.ts                  # NEW: CLI entry point (agentide command)
├── tests/
│   ├── unit/
│   │   ├── license.test.ts     # NEW
│   │   └── jwt.test.ts         # NEW
│   └── integration/
│       └── api-auth.test.ts    # NEW

frontend/
├── src/
│   ├── pages/
│   │   └── LicenseGate.tsx     # NEW: license key entry page
│   ├── hooks/
│   │   └── useAuth.ts          # NEW: auth state hook
│   ├── App.tsx                 # MODIFIED: auth gate wrapper
│   └── services/
│       └── api.ts              # MODIFIED: 401 interceptor, auth methods

tools/
└── generate-license.ts         # NEW: dev-only license key generator

package.json                    # MODIFIED: add bin field
backend/package.json            # MODIFIED: add 5 dependencies
```

**Structure Decision**: Existing web application structure (backend/ + frontend/) is maintained. New `backend/src/auth/` directory groups all auth-related modules (license, jwt, tls) separate from existing services. CLI entry point is at `backend/src/cli.ts` (alongside `hub-entry.ts`). This avoids adding a new top-level directory.

## Implementation Phases

### Phase 1: License Key System (backend only)

1. Generate RSA keypair for development/testing
2. Create `backend/src/auth/license.ts` — parse, validate, load/save from disk
3. Create `tools/generate-license.ts` — dev-only key generator
4. Create `backend/tests/unit/license.test.ts`

### Phase 2: Database + Types

5. Modify `backend/src/models/db.ts` — add `auth_config` table + migration
6. Modify `backend/src/models/types.ts` — add `LicensePayload`, `AuthConfig`, `JwtPayload`
7. Modify `backend/src/models/repository.ts` — add `getAuthConfig`, `updateAuthConfig`, `clearLicense`

### Phase 3: JWT + Auth Middleware

8. Install new dependencies: `jose`, `cookie-parser`, `express-rate-limit`
9. Create `backend/src/auth/jwt.ts` — sign/verify JWT, cookie helpers
10. Modify `backend/src/api/middleware.ts` — add `requireAuth`
11. Create `backend/src/api/routes/auth.ts` — activate, status, logout endpoints
12. Modify `backend/src/api/websocket.ts` — JWT check on upgrade
13. Modify `backend/src/hub-entry.ts` — wire auth router + middleware ordering
14. Create `backend/tests/unit/jwt.test.ts` and `backend/tests/integration/api-auth.test.ts`

### Phase 4: HTTPS/TLS

15. Install `selfsigned`
16. Create `backend/src/auth/tls.ts` — load certs or generate self-signed
17. Modify `hub-entry.ts` — HTTPS server creation when TLS enabled

### Phase 5: CLI Entry Point

18. Install `commander`
19. Create `backend/src/cli.ts` — `agentide start` and `agentide activate` commands
20. Refactor `hub-entry.ts` — extract `main()` to exported `startHub(options)`
21. Modify root `package.json` — add `bin` field

### Phase 6: Frontend Gate

22. Create `frontend/src/hooks/useAuth.ts` — calls GET /api/auth/status
23. Create `frontend/src/pages/LicenseGate.tsx` — license key input form
24. Modify `frontend/src/App.tsx` — wrap routes with auth check
25. Modify `frontend/src/services/api.ts` — add auth API, 401 interceptor

### Phase 7: Integration Testing

26. Full auth flow test: activate → protected routes → WebSocket → logout
27. Localhost mode test: all routes accessible without auth
28. Rate limiting test: 6th attempt returns 429

## New Dependencies

| Package | Version | Size | Purpose |
|---------|---------|------|---------|
| `jose` | ^5.x | ~30KB | JWT sign/verify (ESM, TypeScript native) |
| `cookie-parser` | ^1.4.x | ~5KB | Express cookie middleware |
| `express-rate-limit` | ^7.x | ~10KB | Rate limiting on auth endpoint |
| `commander` | ^12.x | ~50KB | CLI argument parsing |
| `selfsigned` | ^2.x | ~20KB | Self-signed TLS cert generation |

DevDependencies: `@types/cookie-parser`
