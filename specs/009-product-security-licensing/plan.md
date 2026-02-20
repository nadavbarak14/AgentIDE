# Implementation Plan: Product Security & Licensing

**Branch**: `009-product-security-licensing` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-product-security-licensing/spec.md`

## Summary

Implement SSH-first security model for AgentIDE: hub binds to localhost by default (zero auth), with optional remote binding that gates access behind offline RSA-signed license key activation and JWT session cookies. Includes security hardening (SSRF protection, path traversal defense, security headers, rate limiting, hooks endpoint restriction) and CLI packaging (`agentide start`/`activate`).

**Key architectural principle**: This is a re-specification of existing security code. Most implementation already exists from feature 007. This plan covers validation, testing, and any gaps.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, `jose` (JWT), `commander` (CLI), `express-rate-limit`, `selfsigned` (TLS), `ssh2` (workers), `ws` (WebSocket), `better-sqlite3`
**Storage**: SQLite via better-sqlite3 — `auth_config` table (singleton) stores JWT secret and cached license metadata
**Testing**: Vitest — unit (`backend/tests/unit/`), integration (`backend/tests/integration/`), system (`backend/tests/system/`)
**Target Platform**: Linux server (primary), macOS (secondary)
**Project Type**: Web application (backend + frontend monorepo)
**Performance Goals**: License validation < 10ms, JWT verification < 5ms, startup < 10 seconds
**Constraints**: Offline-only (no network calls for license validation), single-instance deployment
**Scale/Scope**: Single-user or small-team tool. ~20 backend source files affected, 3 frontend files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for license/JWT/TLS, integration tests for auth API, system tests for full server lifecycle |
| II. UX-First Design | PASS | Zero friction for localhost (primary use case). License gate only for optional remote access. |
| III. UI Quality & Consistency | PASS | LicenseGate.tsx follows existing dark theme, clear error states, loading feedback |
| IV. Simplicity | PASS | No online checks, no session store, no RBAC. Minimal moving parts. |
| V. CI/CD Pipeline | PASS | All tests run in CI. PR-only workflow. |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies. Uses existing React, fetch API. |
| VII. Backend Security | PASS | OWASP coverage: auth on all endpoints, SSRF protection, path traversal defense, CSP headers, rate limiting, input validation |
| VIII. Observability | PASS | Structured logging via pino for all auth events: activation, validation, failure, rate limiting |

**Post-design re-check**: All gates still pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/009-product-security-licensing/
├── plan.md              # This file
├── research.md          # Phase 0: Technology decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Integration scenarios
├── contracts/           # Phase 1: API contracts
│   ├── auth-api.md      # Auth endpoints (activate, status, logout)
│   ├── hooks-api.md     # Hooks endpoint (localhost restriction)
│   ├── security-headers.md  # Headers, middleware, SSRF, path traversal
│   └── cli.md           # CLI commands (start, activate)
└── tasks.md             # Phase 2: Task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── auth/
│   │   ├── license.ts        # RSA-PSS license validation, disk I/O
│   │   ├── jwt.ts            # JWT sign/verify, cookie management
│   │   └── tls.ts            # TLS config loading, self-signed generation
│   ├── api/
│   │   ├── middleware.ts     # Auth middleware, sanitizePath, request logger
│   │   ├── websocket.ts     # WebSocket with JWT auth on upgrade
│   │   └── routes/
│   │       ├── auth.ts       # /api/auth/* (activate, status, logout)
│   │       ├── hooks.ts      # /api/hooks/* (localhost restriction)
│   │       ├── files.ts      # File serving + SSRF protection on proxy
│   │       └── workers.ts    # Worker management + SSH key validation
│   ├── services/
│   │   └── worker-manager.ts # SSH key validation (validateSshKeyFile)
│   ├── models/
│   │   ├── types.ts          # LicensePayload, AuthConfig, JwtPayload types
│   │   ├── db.ts             # Schema (auth_config table)
│   │   └── repository.ts     # getAuthConfig, updateAuthConfig, clearLicense
│   ├── hub-entry.ts          # Server startup: auth config, license check, middleware ordering
│   └── cli.ts                # CLI entry: start + activate commands
└── tests/
    ├── unit/
    │   ├── license.test.ts   # License validation edge cases
    │   ├── jwt.test.ts       # JWT sign/verify
    │   ├── tls.test.ts       # TLS cert generation
    │   └── cli.test.ts       # CLI argument parsing
    ├── integration/
    │   ├── api-auth.test.ts  # Auth API endpoints
    │   └── ssh-worker.test.ts # SSH key validation
    ├── system/
    │   ├── test-server.ts    # Test server helper (needs auth extension)
    │   ├── auth-lifecycle.test.ts    # Full auth flow system tests
    │   ├── websocket-auth.test.ts    # WebSocket auth system tests
    │   ├── tls-https.test.ts         # HTTPS system tests
    │   ├── rate-limiting.test.ts     # Rate limit system tests
    │   ├── license-lifecycle.test.ts # License edge case system tests
    │   └── middleware-order.test.ts  # Middleware stack verification
    └── helpers/
        └── license-helper.ts # Test license key generation

frontend/
└── src/
    ├── pages/
    │   └── LicenseGate.tsx   # License key entry screen
    ├── hooks/
    │   └── useAuth.ts        # Auth state management hook
    └── App.tsx               # Conditional rendering (gate vs dashboard)
```

**Structure Decision**: Existing web application structure (backend/ + frontend/) is maintained. All security code lives in `backend/src/auth/`. No new directories needed — only new test files in `backend/tests/system/`.

## Existing Implementation Status

Most of the feature code already exists from feature 007. This plan focuses on:

1. **Validating** existing code against the 009 spec (ensuring all 17 FRs are covered)
2. **System tests** that exercise the full stack end-to-end
3. **Gap fixes** for any requirements not yet met

| Component | Status | Gaps |
|-----------|--------|------|
| License validation (RSA-PSS) | Complete | None |
| JWT session management | Complete | None |
| Auth middleware | Complete | None |
| WebSocket JWT auth | Complete | None |
| Auth API routes (activate/status/logout) | Complete | None |
| Rate limiting | Complete | None |
| Hooks localhost restriction | Complete | None |
| SSRF protection | Complete | None |
| Path traversal defense | Complete | None |
| Security headers (CSP) | Complete | None |
| TLS (self-signed + user cert) | Complete | None |
| CLI (start + activate) | Complete | None |
| SSH key validation | Complete | None |
| Startup license check | Complete | None |
| Frontend LicenseGate | Complete | None |
| Frontend useAuth hook | Complete | None |
| Unit tests | Complete | 30+ tests passing |
| Integration tests | Complete | 20+ tests passing |
| System tests | **Missing** | Need full-stack system tests |

**Primary deliverable**: System tests that prove the feature works end-to-end.

## Complexity Tracking

No constitution violations. No complexity justification needed.
