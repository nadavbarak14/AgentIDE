# Research: Mobile View Support & Secure VPS Access

**Feature Branch**: `029-mobile-secure-access`
**Date**: 2026-03-09

## R1: Access Key Generation & Storage

**Decision**: Use Node.js built-in `crypto.randomBytes(32)` for 256-bit key generation, base64url-encoded (43 characters). Store hash using `crypto.scryptSync` (Node.js built-in) with random salt — no external dependency needed.

**Rationale**:
- `crypto.randomBytes` is cryptographically secure (uses OS entropy source)
- `scrypt` is a memory-hard KDF, resistant to GPU/ASIC brute-force — recommended by OWASP for password hashing
- Both are built into Node.js — no new dependencies (avoids bcrypt native compilation issues, argon2 WASM complexity)
- 256 bits of entropy = ~10^77 possible keys — computationally infeasible to brute-force

**Alternatives considered**:
- `bcrypt` (via npm): Requires native compilation, can fail on some platforms. scrypt is equally secure and built-in.
- `argon2` (via npm): Best-in-class but requires WASM or native addon. Overkill for a single-key scenario.
- `uuid` v4: Only 122 bits of entropy. Insufficient for a private-key-like token.

## R2: Authentication Cookie Signing

**Decision**: Use `crypto.createHmac('sha256', secret)` with a server-side secret derived from the key hash. Cookie format: `accessKey=<base64-payload>.<hmac-signature>`. No JWT library needed.

**Rationale**:
- HMAC-SHA256 is the standard for cookie signing
- No external dependency (no `jose`, no `jsonwebtoken`)
- Cookie payload contains: `{ authenticated: true, issuedAt: timestamp }`
- Server validates by recomputing HMAC and checking expiry
- HttpOnly + SameSite=Strict + Secure (when behind TLS) prevents XSS/CSRF

**Alternatives considered**:
- `jose` (JWT): Full JWT library is overkill for a single boolean "is authenticated" cookie. Adds dependency for no benefit.
- `cookie-signature` (npm): Lightweight but another dependency. HMAC is trivial to implement correctly with built-in crypto.

## R3: Rate Limiting

**Decision**: Use `express-rate-limit` for the login endpoint only. Already listed in CLAUDE.md as a planned dependency.

**Rationale**:
- Well-maintained, TypeScript-typed, minimal footprint
- Only needed on POST `/api/auth/login` — not a global middleware
- In-memory store is fine (resets on restart, which is acceptable for rate limiting)
- 5 attempts per 15 minutes per IP, as specified

**Alternatives considered**:
- Custom in-memory Map: Works but reinvents the wheel. `express-rate-limit` handles edge cases (cleanup, headers, IPv6 normalization).
- `rate-limiter-flexible`: More powerful but more complex than needed for a single endpoint.

## R4: Localhost Detection

**Decision**: Extend existing `isLocalhost` pattern from `hub-entry.ts`. Check `req.ip` / `req.socket.remoteAddress` on each request, matching the pattern already used in `hooks.ts`.

**Rationale**:
- Pattern already exists in the codebase (`hooks.ts` lines 5-18)
- Checks: `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
- Consistent with existing code conventions
- Applied in auth middleware — localhost requests skip auth entirely

**Alternatives considered**:
- Check only at startup (using `isLocalhost` from `hub-entry.ts`): Too coarse — a server bound to `0.0.0.0` can receive both local and remote requests.

## R5: Mobile Layout Strategy

**Decision**: Use Tailwind responsive classes (`sm:`, `md:`, `lg:`) on existing components. No new CSS framework or component library needed.

**Rationale**:
- Tailwind CSS 3 is already installed and configured
- Default breakpoints (sm: 640px, md: 768px, lg: 1024px) align perfectly with spec breakpoints
- Mobile-first approach: default styles for mobile, add responsive prefixes for larger screens
- SessionGrid: change from hardcoded `Math.min(activeSessions.length, 3)` to responsive CSS grid
- SessionCard: hide/collapse panels on mobile, show read-only terminal view

**Key changes identified**:
- `SessionGrid.tsx` line 59: Replace hardcoded column logic with responsive grid classes
- `SessionCard.tsx` line 778: Hide left sidebar on mobile (`hidden md:flex`)
- `Dashboard.tsx` line 904: Collapse sidebar on mobile
- All interactive elements: Add `min-h-[44px] min-w-[44px]` for touch targets

**Alternatives considered**:
- Separate mobile app/PWA: Overkill — the same React app with responsive CSS is sufficient for monitoring use case.
- React Native: Completely different tech stack. Not justified for read-only monitoring.

## R6: Mobile Session Viewer

**Decision**: Create a simplified read-only view for sessions on mobile that shows terminal scrollback as plain text (not xterm.js). Use existing terminal output data from the WebSocket stream.

**Rationale**:
- xterm.js is very heavy on mobile (GPU rendering, keyboard handling) and designed for interactive terminals
- Mobile users only need to read output, not type commands
- Terminal scrollback can be rendered as a `<pre>` block with monospace font and ANSI-stripped text
- File changes and git diffs already have lightweight rendering (diff2html)

**Alternatives considered**:
- xterm.js in read-only mode: Still heavyweight for mobile browsers. Canvas-based rendering is problematic on low-end phones.
- Separate mobile API returning plain text: Would work but requires new backend endpoints. Better to handle client-side.

## R7: Login Page Architecture

**Decision**: Serve the login page as a standalone HTML page (inline CSS/JS, no React bundle). The backend serves it directly for unauthenticated requests.

**Rationale**:
- Login page is a single input field + submit button — no React needed
- Avoids loading the full SPA bundle before auth (security + performance)
- Can be served as a template string from Express or a static HTML file
- After successful auth, redirects to the main SPA

**Alternatives considered**:
- React-based login route: Requires loading the entire SPA bundle before showing login. Exposes frontend code to unauthenticated users.
- Separate Vite entry point: Over-engineered for a single-field form.

## R8: WebSocket Authentication

**Decision**: Validate auth cookie during WebSocket upgrade handshake. Parse cookie from `request.headers.cookie` in the `server.on('upgrade')` handler.

**Rationale**:
- WebSocket upgrade includes HTTP headers including cookies
- Auth check happens once at connection time (not per message)
- Existing pattern in `websocket.ts` already validates session existence before upgrade — auth check fits naturally before this
- Localhost bypass applies here too (check `request.socket.remoteAddress`)

**Alternatives considered**:
- Token in WebSocket URL query param: Exposes token in server logs and browser history. Cookie-based is more secure.
- Per-message auth: Excessive overhead. Connection-level auth is sufficient.

## R9: Dependencies to Add

**Decision**: Add only `express-rate-limit` and `cookie-parser` as new dependencies. All crypto operations use Node.js built-in `crypto`.

| Dependency | Purpose | Already in project? |
|---|---|---|
| `crypto` (Node.js built-in) | Key generation, scrypt hashing, HMAC signing | Yes (built-in) |
| `express-rate-limit` | Rate limit login endpoint | No — add |
| `cookie-parser` | Parse auth cookies from requests | No — add |

**Alternatives considered**:
- Skip `cookie-parser`, parse manually: Possible but error-prone. `cookie-parser` is 3KB, well-tested, handles encoding edge cases.
- Add `bcrypt`: Native compilation issues on some platforms. `crypto.scrypt` is equivalent and built-in.
