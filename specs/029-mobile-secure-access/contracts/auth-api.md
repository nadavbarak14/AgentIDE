# Auth API Contract

**Feature Branch**: `029-mobile-secure-access`

## Endpoints

### POST `/api/auth/login`

Validate the access key and issue an auth cookie.

**Rate Limited**: 5 requests per 15 minutes per IP.

**Request**:
```json
{
  "accessKey": "string (base64url-encoded, 43+ characters)"
}
```

**Response (200 — success)**:
```json
{
  "authenticated": true
}
```
Sets cookie: `adyx_auth=<payload>.<hmac>; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/`

**Response (401 — wrong key)**:
```json
{
  "error": "Invalid access key"
}
```

**Response (429 — rate limited)**:
```json
{
  "error": "Too many failed attempts. Try again in <N> minutes.",
  "retryAfter": 900
}
```

### GET `/api/auth/status`

Check if the current request is authenticated.

**Response (200)**:
```json
{
  "authenticated": true,
  "isLocalhost": false,
  "expiresAt": "2026-04-08T12:00:00Z"
}
```

**Response (401)**:
```json
{
  "authenticated": false
}
```

### POST `/api/auth/logout`

Clear the auth cookie.

**Response (200)**:
```json
{
  "authenticated": false
}
```
Clears cookie: `adyx_auth=; Max-Age=0; Path=/`

## Login Page

### GET `/login`

Serves a standalone HTML login page (no React bundle). Contains:
- Single text input for pasting the access key
- Submit button
- Error/lockout messages
- Dark theme matching the main app

Accessible without authentication. Redirects to `/` on successful login.

## Auth Middleware Behavior

Applied globally after `requestLogger`, before all API routes.

**Bypass conditions** (no auth required):
- Request from localhost (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`)
- `GET /api/health`
- `GET /login` and login page static assets
- `POST /api/auth/login`

**For all other requests**:
- Parse `adyx_auth` cookie
- Validate HMAC signature against `cookie_secret`
- Check `issuedAt` is within 30 days
- If invalid/missing: return 401 (API) or redirect to `/login` (HTML)

## WebSocket Auth

WebSocket upgrade requests (`/ws/*`) follow the same rules:
- Localhost: bypass
- Non-localhost: parse `adyx_auth` cookie from upgrade headers, validate, destroy socket if invalid
