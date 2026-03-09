# Implementation Plan: Mobile View Support & Secure VPS Access

**Branch**: `029-mobile-secure-access` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-mobile-secure-access/spec.md`

## Summary

Add two capabilities to Adyx: (1) secure access via an auto-generated cryptographic access key for VPS-hosted hubs, and (2) responsive mobile layout for phone/tablet monitoring. Auth uses Node.js built-in `crypto` for key generation (256-bit), scrypt hashing, and HMAC cookie signing — no external crypto dependencies. Mobile layout uses Tailwind responsive classes on existing components. Localhost connections bypass auth entirely.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, React 18, Tailwind CSS 3, Vite 6, better-sqlite3 11.7, xterm.js 5, ws 8
**New Dependencies**: `express-rate-limit` (login rate limiting), `cookie-parser` (cookie parsing)
**Storage**: SQLite (better-sqlite3) with WAL mode — one new table: `auth_config`
**Testing**: Vitest 2.1.0 (unit + integration + system), Playwright 1.58 (browser E2E), supertest 7 (HTTP)
**Target Platform**: Linux server (VPS), accessed via desktop and mobile browsers
**Project Type**: Web application (backend + frontend workspaces)
**Performance Goals**: Login page loads in <1s, auth middleware adds <1ms per request, mobile dashboard renders at 60fps
**Constraints**: Zero new crypto dependencies (Node.js built-in only), plaintext key never persisted
**Scale/Scope**: Single-user/small-team tool, 1-10 concurrent browser sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for auth service, integration tests for auth API, system tests for full flow, frontend component tests for responsive layout |
| II. UX-First Design | PASS | Localhost bypass = zero friction for local dev. Mobile layout designed for monitoring use case. Login page is minimal. |
| III. UI Quality & Consistency | PASS | Login page matches dark theme. Mobile layout uses existing Tailwind design tokens. Touch targets ≥44px. |
| IV. Simplicity | PASS | No JWT library, no bcrypt — built-in crypto only. Responsive via Tailwind classes, not a mobile framework. Single `auth_config` table. |
| V. CI/CD Pipeline | PASS | All changes go through PR with CI. No direct pushes to main. |
| VI. Frontend Plugin Quality | PASS | No new frontend plugins. `express-rate-limit` and `cookie-parser` are well-maintained, TypeScript-typed. |
| VII. Backend Security | PASS | scrypt key hashing, HMAC cookie signing, HttpOnly/SameSite cookies, rate limiting, localhost bypass with per-request IP check. Secrets never in logs. |
| VIII. Observability | PASS | Log auth events (login success/failure, rate limit hit, key generation). Never log the plaintext key after initial display. |

## Project Structure

### Documentation (this feature)

```text
specs/029-mobile-secure-access/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 API contracts
│   └── auth-api.md      # Auth endpoint contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts                    # MODIFY: add auth_config table + migration
│   │   └── repository.ts           # MODIFY: add auth config CRUD methods
│   ├── services/
│   │   └── auth-service.ts         # NEW: key gen, hashing, cookie signing
│   ├── api/
│   │   ├── middleware.ts            # MODIFY: add requireAuth() middleware
│   │   ├── routes/
│   │   │   └── auth.ts             # NEW: login/logout/status endpoints
│   │   ├── login-page.ts           # NEW: standalone HTML login page
│   │   └── websocket.ts            # MODIFY: add cookie auth on upgrade
│   ├── hub-entry.ts                # MODIFY: wire auth middleware + login route
│   └── cli.ts                      # MODIFY: display access key on startup
└── tests/
    ├── unit/
    │   └── auth-service.test.ts    # NEW: auth service unit tests
    ├── integration/
    │   └── api-auth.test.ts        # NEW: auth API integration tests
    └── system/
        └── auth-flow.test.ts       # NEW: full auth system test

frontend/
├── src/
│   ├── components/
│   │   ├── SessionGrid.tsx         # MODIFY: responsive grid columns
│   │   └── SessionCard.tsx         # MODIFY: mobile panel layout
│   └── pages/
│       └── Dashboard.tsx           # MODIFY: mobile sidebar, navigation
└── tests/
    └── unit/
        └── responsive-layout.test.ts  # NEW: responsive behavior tests
```

**Structure Decision**: Existing web application structure (backend + frontend workspaces). Auth service is a new service file following the existing `services/` pattern. Auth routes follow the existing `api/routes/` pattern. No structural changes needed.

## Complexity Tracking

No constitution violations. All decisions favor simplicity:
- Built-in `crypto` instead of external dependencies
- Tailwind responsive classes instead of a mobile framework
- Singleton `auth_config` table instead of a user/session management system
- HMAC cookies instead of JWT tokens
