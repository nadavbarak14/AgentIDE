# API Contracts: Auth & Licensing

**Branch**: `007-auth-licensing-cli` | **Date**: 2026-02-20

## Endpoints

### `POST /api/auth/activate`

Validate a license key, store metadata, set JWT cookie.

**Auth**: Not required (this IS the auth endpoint)
**Rate limit**: 5 failed attempts per IP per 15 minutes

**Request**:
```json
{
  "licenseKey": "eyJlbWFpbCI6InVzZXJA..."
}
```

**200 Response** (sets `agentide_session` cookie):
```json
{
  "email": "user@example.com",
  "plan": "pro",
  "maxSessions": 10,
  "expiresAt": "2027-02-20T00:00:00.000Z"
}
```

**Error Responses**:

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Missing required field: licenseKey" }` | Key not provided |
| 401 | `{ "error": "Invalid license key: signature verification failed" }` | Tampered or wrong format |
| 401 | `{ "error": "License key expired", "expiresAt": "2025-01-01T..." }` | Valid signature, past expiry |
| 429 | `{ "error": "Too many attempts. Try again in X minutes.", "retryAfter": 900 }` | Rate limited |

---

### `GET /api/auth/status`

Check authentication state. **Never returns 401.**

**Auth**: Not required

**200 Response** (always):

Localhost mode (auth disabled):
```json
{
  "authRequired": false,
  "authenticated": true,
  "email": null,
  "plan": null,
  "licenseExpiresAt": null
}
```

Remote mode, authenticated:
```json
{
  "authRequired": true,
  "authenticated": true,
  "email": "user@example.com",
  "plan": "pro",
  "licenseExpiresAt": "2027-02-20T00:00:00.000Z"
}
```

Remote mode, not authenticated:
```json
{
  "authRequired": true,
  "authenticated": false,
  "email": null,
  "plan": null,
  "licenseExpiresAt": null
}
```

---

### `POST /api/auth/logout`

Clear the session cookie. Does not revoke the license.

**Auth**: Not required

**200 Response**:
```json
{
  "ok": true
}
```

Clears cookie: `Set-Cookie: agentide_session=; Max-Age=0`

---

## Auth Middleware

Applied to all `/api/*` routes EXCEPT `/api/auth/*` and `/api/hooks/*`.

**Behavior**:
- If `authRequired = false` (localhost mode): passes through, no checks
- If `authRequired = true`: reads `agentide_session` cookie, verifies JWT
  - Valid → attaches decoded payload to request, passes through
  - Invalid/missing → returns `401 { "error": "Authentication required" }`

**Middleware ordering in Express**:
```
1. express.json()
2. cookieParser()
3. requestLogger
4. /api/auth routes (NO auth check)
5. /api/hooks routes (NO auth check — called by local Claude processes)
6. requireAuth middleware (applied to /api/*)
7. /api/settings, /api/sessions, /api/workers, etc. (PROTECTED)
8. Static frontend
9. errorHandler
```

---

## WebSocket Auth

JWT checked on HTTP upgrade request, before WebSocket handshake.

**Behavior**:
- If `authRequired = false`: skip check, proceed with existing session validation
- If `authRequired = true`: parse `agentide_session` cookie from `request.headers.cookie`, verify JWT
  - Valid → proceed with upgrade
  - Invalid/missing → `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy()`

Browsers automatically send cookies with WebSocket upgrades to the same origin. No client-side code changes needed.

---

## Frontend Integration

### API Client Additions (`frontend/src/services/api.ts`)

```typescript
auth.status()              → GET  /api/auth/status
auth.activate(licenseKey)  → POST /api/auth/activate
auth.logout()              → POST /api/auth/logout
```

### 401 Interceptor

The existing `request()` function is modified to:
1. Add `credentials: 'same-origin'` to ensure cookies are sent
2. On 401 response: dispatch `window.dispatchEvent(new CustomEvent('auth:unauthorized'))`
3. App.tsx listens for this event and shows the license gate

### Auth Check Flow (frontend)

```
App mounts
  → GET /api/auth/status
  → if authRequired=false: show dashboard (no gate)
  → if authenticated=true: show dashboard
  → if authenticated=false: show LicenseGate
    → user enters key → POST /api/auth/activate
    → on success: cookie set, re-check status, show dashboard
    → on error: show error message
```
