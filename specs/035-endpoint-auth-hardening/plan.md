# Implementation Plan: Endpoint Authentication Hardening

**Branch**: `035-endpoint-auth-hardening` | **Date**: 2026-03-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/035-endpoint-auth-hardening/spec.md`

## Summary

Harden the existing authentication system to close security gaps: add rate limiting on the login endpoint (5 failed attempts per 15-min window per IP), move currently-unprotected endpoints (bridge scripts, extensions) behind auth middleware, change fail-open to fail-closed behavior, and add a persistent SQLite audit log for auth events. No new auth mechanisms — just fixing the holes in the existing one.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, better-sqlite3, express-rate-limit 8.2.1 (new), cookie-parser, ws 8
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `auth_config` table, new `auth_audit_log` table
**Testing**: Vitest 2.1.0, supertest 7.0.0, in-memory SQLite for test isolation
**Target Platform**: Linux server (single instance)
**Project Type**: Web application (Express backend + React frontend)
**Performance Goals**: Login flow under 2 seconds
**Constraints**: Single-instance deployment, no distributed state, personal tool (single user per instance)
**Scale/Scope**: 7 files modified, 3 new test files, 1 new dependency

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for audit repo methods, integration tests for rate limiting + endpoint coverage, system tests for full auth flow |
| II. UX-First Design | PASS | Rate limiting provides clear error messages with retry timing. Login flow unchanged for happy path. 30-day sessions prevent frustration |
| III. UI Quality & Consistency | N/A | No UI changes (login page unchanged) |
| IV. Simplicity | PASS | Re-uses existing library (express-rate-limit), no new abstractions, simple SQLite table for audit |
| V. CI/CD Pipeline | PASS | All changes testable in CI, no infrastructure changes |
| VI. Frontend Plugin Quality | N/A | No frontend changes |
| VII. Backend Security & Correctness | PASS | This feature directly addresses OWASP broken auth, insufficient logging. Fail-closed behavior prevents data leaks |
| VIII. Observability & Logging | PASS | Audit log captures all auth events with structured data (event type, IP, timestamp) |

**Post-Phase 1 Re-check**: All gates still pass. No complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/035-endpoint-auth-hardening/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Data model (auth_audit_log table)
├── quickstart.md        # Dev setup guide
├── contracts/
│   └── auth-api.yaml    # OpenAPI contract for auth endpoints
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts              # MODIFY: Add auth_audit_log table + migration
│   │   ├── repository.ts      # MODIFY: Add logAuthEvent(), getAuthAuditLog()
│   │   └── types.ts           # MODIFY: Add AuthAuditEntry interface
│   ├── services/
│   │   └── auth-service.ts    # NO CHANGES (crypto functions are solid)
│   ├── api/
│   │   ├── routes/
│   │   │   └── auth.ts        # MODIFY: Add rate limiter, audit logging, audit endpoint
│   │   ├── middleware.ts       # MODIFY: Fail-closed when auth config missing
│   │   └── hub-entry.ts       # MODIFY: Reorder routes for bridge/extension auth
│   └── ...
├── tests/
│   ├── unit/
│   │   └── auth-audit.test.ts          # NEW: Audit log repo method tests
│   ├── integration/
│   │   └── api-auth.test.ts            # MODIFY: Add rate limiting + endpoint coverage tests
│   └── system/
│       └── auth-flow.test.ts           # MODIFY: Add audit trail verification
└── package.json                        # MODIFY: Add express-rate-limit dependency
```

**Structure Decision**: Web application (backend/ + frontend/). All changes are backend-only. Frontend is unaffected.

## Complexity Tracking

No constitution violations. All changes are minimal and justified:
- 1 new dependency (express-rate-limit) — previously used, well-known
- 1 new table (auth_audit_log) — simple append-only log
- 0 new abstractions — everything uses existing patterns (Repository, Express middleware)
