# Quickstart: Mobile View Support & Secure VPS Access

**Feature Branch**: `029-mobile-secure-access`

## Prerequisites

- Node.js 20 LTS
- Existing Adyx codebase with `npm install` completed

## New Dependencies

```bash
npm install express-rate-limit cookie-parser
npm install -D @types/cookie-parser
```

## Implementation Order

### Phase 1: Auth Backend (P1 — must ship first)

1. **Database migration** — Add `auth_config` table in `db.ts`
2. **Auth service** — `backend/src/services/auth-service.ts`
   - `generateAccessKey()` → returns plaintext key
   - `hashKey(key)` → returns `salt:hash` string
   - `verifyKey(key, hash)` → boolean
   - `createAuthCookie(secret)` → signed cookie value
   - `validateAuthCookie(cookie, secret)` → boolean
3. **Auth middleware** — `backend/src/api/middleware.ts`
   - `requireAuth()` — Express middleware checking cookie or localhost
4. **Auth routes** — `backend/src/api/routes/auth.ts`
   - `POST /api/auth/login` (rate-limited)
   - `GET /api/auth/status`
   - `POST /api/auth/logout`
5. **Login page** — `backend/src/api/login-page.ts`
   - Inline HTML template served at `GET /login`
6. **Hub integration** — Wire middleware and routes into `hub-entry.ts`
7. **WebSocket auth** — Add cookie check in `websocket.ts` upgrade handler
8. **CLI output** — Display access key in `cli.ts` on first startup
9. **Tests** — Unit tests for auth service, integration tests for auth routes, system test for full auth flow

### Phase 2: Mobile Dashboard (P2)

1. **SessionGrid responsive** — Replace hardcoded 3-column with responsive grid
2. **SessionCard mobile** — Hide panels, touch-friendly buttons
3. **Dashboard sidebar** — Collapse on mobile
4. **Navigation** — No horizontal scroll on mobile
5. **Tests** — Frontend component tests for responsive behavior

### Phase 3: Mobile Session Viewer (P3)

1. **Read-only terminal view** — Plain text scrollback for mobile
2. **Tab navigation** — Terminal / Files / Diff tabs
3. **Responsive diff view** — Unified diff with horizontal scroll
4. **Tests** — Component tests for mobile session view

## Key Files to Modify

| File | Change |
|------|--------|
| `backend/src/models/db.ts` | Add `auth_config` table + migration |
| `backend/src/models/repository.ts` | Add auth config CRUD methods |
| `backend/src/api/middleware.ts` | Add `requireAuth()` middleware |
| `backend/src/hub-entry.ts` | Wire auth middleware, login page route |
| `backend/src/api/websocket.ts` | Add cookie validation on upgrade |
| `backend/src/cli.ts` | Display access key on first startup |
| `frontend/src/components/SessionGrid.tsx` | Responsive grid columns |
| `frontend/src/components/SessionCard.tsx` | Mobile panel hiding |
| `frontend/src/pages/Dashboard.tsx` | Mobile sidebar collapse |

## New Files

| File | Purpose |
|------|---------|
| `backend/src/services/auth-service.ts` | Key generation, hashing, cookie signing |
| `backend/src/api/routes/auth.ts` | Auth API endpoints |
| `backend/src/api/login-page.ts` | Standalone login HTML page |
| `backend/tests/unit/auth-service.test.ts` | Auth service unit tests |
| `backend/tests/integration/api-auth.test.ts` | Auth API integration tests |
| `backend/tests/system/auth-flow.test.ts` | Full auth system test |

## Verification

```bash
# Run all tests
npm test

# Run auth-specific tests
cd backend && npx vitest run tests/unit/auth-service.test.ts
cd backend && npx vitest run tests/integration/api-auth.test.ts
cd backend && npx vitest run --config vitest.system.config.ts tests/system/auth-flow.test.ts

# Manual verification
npm run dev  # Start dev server
# Check terminal output for access key
# Open browser on non-localhost — should see login page
# Paste key — should grant access
# Resize browser to 375px width — dashboard should stack to single column
```
