# Implementation Plan: Pre-Launch Cleanup — Remove Auth, Fix Tests

**Branch**: `013-pre-launch-cleanup` | **Date**: 2026-02-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-pre-launch-cleanup/spec.md`

## Summary

Remove the entire authentication/licensing system (JWT, license keys, TLS, auth middleware, LicenseGate frontend) and related dependencies from the codebase. The app becomes open-access — SSH provides the security layer for remote connections. Additionally, fix failing release smoke tests caused by `dataDir`/`homeDir` path mismatch and add a dedicated health check endpoint to replace the removed `/api/auth/status`.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, React 18, better-sqlite3, ws 8, xterm.js 5, Vite 6, Tailwind CSS 3
**Storage**: SQLite (better-sqlite3) with WAL mode — removing `auth_config` table from schema
**Testing**: Vitest 2.1.0 — removing auth test files, fixing smoke tests
**Target Platform**: Linux server (Node.js backend + browser frontend)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: N/A — this is a code removal feature
**Constraints**: All existing tests must continue to pass after removal
**Scale/Scope**: ~15 files deleted, ~12 files edited, 5 npm dependencies removed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Removing auth tests alongside auth code. All remaining tests must pass. New health endpoint gets a test. |
| II. UX-First Design | PASS | Removes friction (auth gate) — direct UX improvement. |
| III. UI Quality & Consistency | PASS | Removing LicenseGate page. No UI regressions — dashboard loads directly. |
| IV. Simplicity | PASS | Removing ~15 files and 5 dependencies. Net simplification. |
| V. CI/CD Pipeline | PASS | Feature branch → PR → CI green → merge. No shortcuts. |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies. Removing unused ones. |
| VII. Backend Security | JUSTIFIED | Removing auth is a deliberate decision — SSH provides the security layer. Input validation (`sanitizePath`, `isWithinHomeDir`) remains intact. Hooks endpoint retains localhost restriction. |
| VIII. Observability & Logging | PASS | Request logger middleware stays. Auth-specific logs removed with auth code. |

**Post-Phase-1 Re-check**: Constitution VII ("Authentication and authorization MUST be enforced on every endpoint") is violated by design. **Justification**: This is a personal, free tool where SSH provides transport security and access control. The auth system was never enforcing meaningful authorization (no role-based access, no session limits based on license). Removing it eliminates dead complexity. Auth can be re-introduced if the product evolves to require it.

## Project Structure

### Documentation (this feature)

```text
specs/013-pre-launch-cleanup/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: data model changes
├── quickstart.md        # Phase 1: implementation quickstart
├── contracts/
│   └── api-changes.md   # Phase 1: API contract changes
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── auth/                    # DELETE entire directory (jwt.ts, license.ts, tls.ts)
│   ├── api/
│   │   ├── middleware.ts        # EDIT: remove createAuthMiddleware
│   │   ├── websocket.ts        # EDIT: remove JWT check on upgrade
│   │   └── routes/
│   │       ├── auth.ts          # DELETE
│   │       ├── health.ts        # NEW: health check endpoint
│   │       └── hooks.ts         # EDIT: remove authRequired param
│   ├── models/
│   │   ├── db.ts                # EDIT: remove auth_config table
│   │   ├── repository.ts        # EDIT: remove auth methods
│   │   └── types.ts             # EDIT: remove auth types
│   ├── hub-entry.ts             # EDIT: major cleanup — remove auth, TLS, cookie-parser
│   └── cli.ts                   # EDIT: remove auth flags, activate command
├── tests/
│   ├── unit/
│   │   ├── jwt.test.ts          # DELETE
│   │   ├── license.test.ts      # DELETE
│   │   ├── tls.test.ts          # DELETE
│   │   └── cli.test.ts          # EDIT: remove auth flag/command tests
│   ├── integration/
│   │   └── api-auth.test.ts     # DELETE
│   ├── system/
│   │   ├── auth-lifecycle.test.ts    # DELETE
│   │   ├── websocket-auth.test.ts    # DELETE
│   │   ├── license-lifecycle.test.ts # DELETE
│   │   ├── tls-https.test.ts         # DELETE
│   │   ├── rate-limiting.test.ts     # DELETE
│   │   ├── middleware-order.test.ts   # DELETE
│   │   ├── auth-test-server.ts        # DELETE (test helper)
│   │   └── cli-e2e.test.ts           # EDIT: remove auth references
│   └── helpers/
│       └── license-helper.ts    # DELETE
└── package.json                 # EDIT: remove 5 dependencies

frontend/
├── src/
│   ├── pages/
│   │   └── LicenseGate.tsx      # DELETE
│   ├── hooks/
│   │   └── useAuth.ts           # DELETE
│   ├── services/
│   │   └── api.ts               # EDIT: remove auth methods
│   └── App.tsx                  # EDIT: remove AuthGate wrapper

release-tests/
├── helpers/
│   ├── environment.ts           # EDIT: fix dataDir within homeDir
│   └── server.ts                # EDIT: update health check URL
└── smoke/
    └── critical-path.test.ts    # EDIT: update health check test
```

**Structure Decision**: Existing web application structure (backend + frontend). No new directories. The `backend/src/auth/` directory is deleted entirely.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Constitution VII: Auth on every endpoint | SSH provides access control; this is a personal free tool | Keeping auth as dead code adds maintenance burden with zero security benefit since SSH already gates access |
