# Tasks: Mobile View Support & Secure VPS Access

**Input**: Design documents from `/specs/029-mobile-secure-access/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/auth-api.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend tests: `backend/tests/unit/`, `backend/tests/integration/`, `backend/tests/system/`
- Frontend tests: `frontend/tests/unit/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and prepare shared infrastructure

- [x] T001 Install `express-rate-limit` and `cookie-parser` (+ `@types/cookie-parser`) dependencies in root `package.json`
- [x] T002 Add `auth_config` table to database schema in `backend/src/models/db.ts` — singleton table (id=1) with columns: `key_hash TEXT NOT NULL`, `cookie_secret TEXT NOT NULL`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`. Add migration in the `migrate()` function to create table if not exists.
- [x] T003 Add auth config repository methods in `backend/src/models/repository.ts` — `getAuthConfig(): AuthConfig | null`, `setAuthConfig(keyHash: string, cookieSecret: string): void`. Follow existing patterns (e.g., `getSettings()`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core auth service that MUST be complete before user story integration

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Create auth service in `backend/src/services/auth-service.ts` with functions:
  - `generateAccessKey()`: returns base64url-encoded string (32 random bytes = 256 bits)
  - `hashKey(key: string)`: returns `salt:hash` string using `crypto.scryptSync` (16-byte salt, 64-byte hash)
  - `verifyKey(key: string, storedHash: string)`: extracts salt from stored hash, re-hashes, compares (timing-safe)
  - `createCookieValue(cookieSecret: string)`: creates `<base64-payload>.<hmac>` with `{ authenticated: true, issuedAt: Date.now() }`
  - `validateCookieValue(cookie: string, cookieSecret: string, maxAgeDays: number)`: validates HMAC and checks issuedAt within maxAge
  - Use only Node.js built-in `crypto` module — no external dependencies.

- [x] T005 [P] Create auth unit tests in `backend/tests/unit/auth-service.test.ts`:
  - Test `generateAccessKey()` returns 43+ char base64url string
  - Test `hashKey()` produces `salt:hash` format with correct lengths
  - Test `verifyKey()` returns true for correct key, false for wrong key
  - Test `createCookieValue()` produces `payload.hmac` format
  - Test `validateCookieValue()` accepts valid cookies, rejects tampered/expired ones
  - Test timing-safe comparison (wrong key doesn't short-circuit)

- [x] T006 Create `requireAuth` middleware in `backend/src/api/middleware.ts`:
  - Accept `cookieParser` parsed cookies from `req.cookies`
  - Check if request is from localhost (`req.ip` / `req.socket.remoteAddress` matching `127.0.0.1`, `::1`, `::ffff:127.0.0.1`) — if so, call `next()` immediately
  - Check `adyx_auth` cookie — validate using `validateCookieValue()` from auth service
  - If valid: call `next()`
  - If invalid/missing: for API routes (`/api/*`) return 401 JSON; for other routes redirect to `/login`
  - Accept `Repository` instance to look up `cookie_secret` from `auth_config` table

- [x] T007 Create auth middleware unit test in `backend/tests/unit/auth-middleware.test.ts`:
  - Test localhost requests bypass auth (127.0.0.1, ::1, ::ffff:127.0.0.1)
  - Test valid cookie passes through
  - Test missing cookie returns 401 / redirects to /login
  - Test expired cookie returns 401
  - Test tampered cookie returns 401

**Checkpoint**: Foundation ready — auth service and middleware exist, tested in isolation

---

## Phase 3: User Story 1 — Secure Auto-Generated Key Access (Priority: P1) 🎯 MVP

**Goal**: Users accessing the hub from a non-localhost address must authenticate with an auto-generated access key. Localhost access bypasses auth entirely.

**Independent Test**: Start hub, copy key from terminal, access from non-localhost → see login page → paste key → access granted. Access from localhost → no login needed.

### Tests for User Story 1 ✅

- [x] T008 [P] [US1] Create auth API integration tests in `backend/tests/integration/api-auth.test.ts`:
  - Test `POST /api/auth/login` with correct key returns 200 + sets cookie
  - Test `POST /api/auth/login` with wrong key returns 401
  - Test `POST /api/auth/login` rate limiting (6th attempt in 15min returns 429)
  - Test `GET /api/auth/status` with valid cookie returns `{ authenticated: true }`
  - Test `GET /api/auth/status` without cookie returns `{ authenticated: false }`
  - Test `POST /api/auth/logout` clears cookie
  - Use supertest with an Express app wired to auth routes, real in-memory SQLite DB

- [x] T009 [P] [US1] Create auth system test in `backend/tests/system/auth-flow.test.ts`:
  - Start test server with auth enabled (non-localhost simulation)
  - Test unauthenticated request to `/api/sessions` returns 401
  - Test unauthenticated request to `/api/health` returns 200 (always open)
  - Test login flow: POST to `/api/auth/login` → subsequent request with cookie succeeds
  - Test WebSocket connection without auth cookie is rejected
  - Test WebSocket connection with valid auth cookie succeeds
  - Use real test server from `backend/tests/system/test-server.ts` pattern

### Implementation for User Story 1

- [x] T010 [P] [US1] Create auth routes in `backend/src/api/routes/auth.ts`:
  - `POST /api/auth/login` — validate key against stored hash, set `adyx_auth` cookie (HttpOnly, SameSite=Strict, Max-Age=30 days, Path=/). Apply `express-rate-limit` (5 per 15 min per IP).
  - `GET /api/auth/status` — return auth status from cookie validation
  - `POST /api/auth/logout` — clear `adyx_auth` cookie
  - Router factory function: `createAuthRouter(repo: Repository): Router`

- [x] T011 [P] [US1] Create login page in `backend/src/api/login-page.ts`:
  - Export function `getLoginPageHtml(error?: string, lockoutMinutes?: number): string`
  - Standalone HTML page (inline CSS + JS, no React bundle)
  - Dark theme (bg-gray-900, text-white) matching main app
  - Single paste-friendly input field (type="text", large font, monospace)
  - Submit button (44px+ height for mobile touch)
  - Error message display area
  - Rate limit lockout message area
  - Form POSTs to `/api/auth/login`, handles response client-side with fetch
  - On success: redirect to `/`

- [x] T012 [US1] Wire auth into hub-entry.ts in `backend/src/hub-entry.ts`:
  - Add `cookie-parser` middleware after JSON parser (before security headers)
  - Add `requireAuth` middleware after `requestLogger` — apply to all routes EXCEPT: `GET /api/health`, `GET /login`, `POST /api/auth/login`, static login assets
  - Add `GET /login` route serving the login page HTML
  - Add auth routes: `app.use('/api/auth', createAuthRouter(repo))`
  - On startup in `startHub()`: check if `auth_config` exists in DB. If not, generate access key, hash it, store hash + cookie_secret, log the plaintext key to terminal with clear labeling. If exists, log "Access key already configured" (never re-display the key).

- [x] T013 [US1] Add WebSocket auth check in `backend/src/api/websocket.ts`:
  - In the `server.on('upgrade')` handler, before session validation:
  - Parse cookies from `request.headers.cookie` using `cookie` module (built into cookie-parser)
  - Check if request is from localhost — if so, skip auth
  - Validate `adyx_auth` cookie using auth service
  - If invalid: `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;`

- [x] T014 [US1] Update CLI startup output in `backend/src/cli.ts`:
  - After `startHub()` returns, check if a new access key was generated (returned from startHub)
  - If new key: display it prominently in terminal with box/border formatting, instructions to copy
  - If existing key: display message that auth is active, no key shown
  - Add logging: `logger.info('Authentication enabled for remote access')`
  - Never log the plaintext key to the structured logger (only to console.log for operator visibility)

**Checkpoint**: Auth is fully functional. Non-localhost access requires the access key. Localhost access is frictionless. All auth tests pass.

---

## Phase 4: User Story 2 — Mobile-Friendly Dashboard View (Priority: P2)

**Goal**: Dashboard adapts to small screens — single column on phones, 2 columns on tablets, touch-friendly buttons, no horizontal scroll.

**Independent Test**: Access dashboard at 375px viewport width — cards stack vertically, text readable, buttons tappable (44px+), no horizontal scroll.

### Tests for User Story 2 ✅

- [ ] T015 [P] [US2] Create responsive layout tests in `frontend/tests/unit/responsive-layout.test.ts`:
  - Test SessionGrid renders single column class when window width < 640px
  - Test SessionGrid renders 2-column class when window width 640px–1024px
  - Test SessionGrid renders multi-column (existing) when window width > 1024px
  - Use `@testing-library/react` with `window.innerWidth` mocking

### Implementation for User Story 2

- [x] T016 [P] [US2] Make SessionGrid responsive in `frontend/src/components/SessionGrid.tsx`:
  - Replace hardcoded `const cols = Math.min(activeSessions.length, 3)` (line 59) with responsive CSS grid
  - Use Tailwind classes: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` on the grid container
  - Remove the inline `style={{ gridTemplateColumns: ... }}` — let Tailwind handle it
  - Keep overflow section's `auto-fill` behavior unchanged
  - Ensure smooth transitions on resize

- [x] T017 [P] [US2] Make SessionCard mobile-friendly in `frontend/src/components/SessionCard.tsx`:
  - Hide left file-tree sidebar on mobile: change `w-[200px] min-w-[150px]` to `hidden md:flex md:w-[200px] md:min-w-[150px]`
  - Hide right panel and bottom panels on mobile: `hidden md:flex` / `hidden md:block`
  - Terminal area fills full width on mobile
  - All action buttons (stop, restart, etc.): add `min-h-[44px] min-w-[44px]` for touch targets
  - Session header info (name, status, duration) always visible on mobile

- [x] T018 [US2] Make Dashboard layout responsive in `frontend/src/pages/Dashboard.tsx`:
  - Sidebar (w-80): change to `hidden lg:block lg:w-80` — hidden on mobile/tablet, visible on desktop
  - Top navigation bar: ensure all elements wrap or collapse on narrow screens
  - Add hamburger menu toggle for sidebar on mobile (show/hide with overlay)
  - Ensure no horizontal scrolling at any viewport width
  - All nav buttons/links: `min-h-[44px] min-w-[44px]` tap targets

- [x] T019 [US2] Add mobile viewport test in login page `backend/src/api/login-page.ts`:
  - Ensure login page input field is full width on mobile (`width: 100%`, `max-width: 500px`)
  - Ensure submit button is full width on mobile with 44px height
  - Add `<meta name="viewport">` to login page HTML

**Checkpoint**: Dashboard is usable on phones and tablets. Cards stack, buttons are tappable, no horizontal scroll. Desktop layout unchanged.

---

## Phase 5: User Story 3 — Mobile Session Viewer (Priority: P3)

**Goal**: Users can tap a session on mobile to see read-only terminal output, file changes, and git diffs — no interactive terminal.

**Independent Test**: Tap a session card on a phone — see terminal scrollback as readable text, tap Files tab to see changes, tap a file to see diff.

### Tests for User Story 3 ✅

- [ ] T020 [P] [US3] Create mobile session viewer tests in `frontend/tests/unit/mobile-session-view.test.ts`:
  - Test read-only terminal view renders terminal output as pre-formatted text
  - Test tab navigation between Terminal, Files, and Diff views
  - Test terminal output is vertically scrollable

### Implementation for User Story 3

- [x] T021 [P] [US3] Create mobile session view component in `frontend/src/components/MobileSessionView.tsx`:
  - Full-screen overlay or page when a session is tapped on mobile (viewport < 640px)
  - Tab bar at top: Terminal | Files | Diff (44px height tabs, touch-friendly)
  - Back button to return to dashboard
  - Terminal tab: renders session terminal output as `<pre>` with monospace font, ANSI codes stripped, vertically scrollable
  - Files tab: list of recently changed files with change type indicators (added/modified/deleted)
  - Diff tab: shows selected file diff using diff2html in unified mode, horizontal scroll for long lines
  - Refresh button or pull-to-refresh to update session data

- [x] T022 [US3] Integrate mobile session view in `frontend/src/components/SessionCard.tsx`:
  - Detect mobile viewport (< 640px) — on card tap, open MobileSessionView instead of expanding the desktop panel layout
  - Pass session ID and terminal output data to MobileSessionView
  - Use existing WebSocket connection for real-time terminal output
  - Use existing file change data from the session state

- [x] T023 [US3] Add terminal output text rendering in `frontend/src/components/MobileTerminalOutput.tsx`:
  - Accept terminal output buffer (string array or string)
  - Strip ANSI escape codes for plain text rendering
  - Render as `<pre className="font-mono text-sm whitespace-pre-wrap break-all overflow-y-auto">`
  - Auto-scroll to bottom on new output
  - Smooth scrolling behavior
  - Touch-friendly scroll (no scroll jank)

**Checkpoint**: All three user stories are independently functional. Auth works, dashboard is mobile-friendly, sessions are viewable on mobile.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T024 [P] Verify all auth error paths have structured logging in `backend/src/services/auth-service.ts` and `backend/src/api/routes/auth.ts` (Principle VIII) — log login attempts (success/failure), rate limit triggers, key generation events. Never log plaintext key or cookie values.
- [x] T025 [P] Verify test coverage across all stories (Principle I) — run `npm test:coverage` and ensure new code doesn't decrease overall coverage thresholds
- [x] T026 Security audit (Principle VII) — verify: no plaintext key in DB or logs, HttpOnly/SameSite cookies, rate limiting works, localhost bypass only on actual loopback, no auth bypass via header manipulation
- [x] T027 Run full test suite and fix any failures: `npm test && npm run lint`
- [ ] T028 Push branch, wait for CI green, create PR targeting main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion — auth service + middleware must exist
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion — can run in parallel with US1 (frontend-only changes)
- **User Story 3 (Phase 5)**: Depends on Phase 4 completion — mobile session view builds on mobile dashboard layout
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories. Backend-only.
- **User Story 2 (P2)**: Can start after Phase 2 — frontend-only, independent of US1. Can run in parallel with US1.
- **User Story 3 (P3)**: Depends on US2 — mobile session view requires mobile dashboard layout to be in place.

### Within Each User Story

- Tests written alongside or before implementation
- Models/services before routes/middleware
- Core implementation before integration (wiring into hub-entry.ts, cli.ts)
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 2**: T004 (auth service) and T005 (auth tests) can run in parallel
- **Phase 3**: T008, T009 (tests) and T010, T011 (auth routes, login page) can all run in parallel — they work on different files
- **Phase 3 + Phase 4**: US1 (backend auth) and US2 (frontend mobile) can run in parallel — zero file overlap
- **Phase 4**: T016, T017 (SessionGrid, SessionCard) can run in parallel — different files
- **Phase 5**: T021, T023 (MobileSessionView, MobileTerminalOutput) can run in parallel — new files

---

## Parallel Example: Phase 3 (US1) + Phase 4 (US2) Concurrent

```text
# Agent A: Auth backend (US1)
Task: T010 "Create auth routes in backend/src/api/routes/auth.ts"
Task: T011 "Create login page in backend/src/api/login-page.ts"
Task: T012 "Wire auth into hub-entry.ts"
Task: T013 "Add WebSocket auth check"
Task: T014 "Update CLI startup output"

# Agent B: Mobile frontend (US2) — runs simultaneously
Task: T016 "Make SessionGrid responsive"
Task: T017 "Make SessionCard mobile-friendly"
Task: T018 "Make Dashboard layout responsive"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (deps + DB schema)
2. Complete Phase 2: Foundational (auth service + middleware)
3. Complete Phase 3: User Story 1 (auth routes, login page, hub wiring)
4. **STOP and VALIDATE**: Test auth flow independently
5. Deploy — hub is now secure for VPS access

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Auth works → Deploy (MVP!)
3. Add User Story 2 → Dashboard is mobile-friendly → Deploy
4. Add User Story 3 → Session viewing on mobile → Deploy
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (backend auth)
   - Developer B: User Story 2 (frontend mobile)
3. After US2 completes: Developer B starts User Story 3
4. Stories integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 have zero file overlap — fully parallelizable
- US3 depends on US2 (mobile layout must exist)
- Auth key is displayed in terminal ONCE on first startup — never again
- Login page is standalone HTML — does not load React bundle
- Mobile terminal view uses plain `<pre>` text, not xterm.js (performance)
