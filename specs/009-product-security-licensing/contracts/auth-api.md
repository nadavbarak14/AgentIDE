# API Contract: Authentication & Licensing

**Feature**: 009-product-security-licensing
**Base Path**: `/api/auth`

These endpoints are NOT protected by auth middleware — they must be accessible without a session cookie.

---

## POST /api/auth/activate

Validate a license key and create a browser session.

**Rate limited**: 5 failed attempts per IP per 15 minutes.

### Request

```json
{
  "licenseKey": "base64url-payload.base64url-signature"
}
```

### Responses

**200 OK** — License valid, session cookie set

```json
{
  "email": "user@example.com",
  "plan": "pro",
  "maxSessions": 10,
  "expiresAt": "2027-02-20T00:00:00.000Z"
}
```

Headers: `Set-Cookie: agentide_session=<JWT>; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`

When HTTPS: cookie also includes `Secure` flag.

**400 Bad Request** — Missing licenseKey field

```json
{
  "error": "Missing required field: licenseKey"
}
```

**401 Unauthorized** — Invalid license key (bad signature, malformed)

```json
{
  "error": "Invalid license key: signature verification failed"
}
```

**403 Forbidden** — Expired license key

```json
{
  "error": "License key expired",
  "expiresAt": "2025-01-01T00:00:00.000Z"
}
```

**429 Too Many Requests** — Rate limited

```json
{
  "error": "Too many attempts. Try again later.",
  "retryAfter": 900
}
```

---

## GET /api/auth/status

Check current authentication state. Never returns 401.

### Responses

**200 OK** — Localhost mode (no auth required)

```json
{
  "authRequired": false,
  "authenticated": true,
  "email": null,
  "plan": null,
  "licenseExpiresAt": null
}
```

**200 OK** — Remote mode, not authenticated

```json
{
  "authRequired": true,
  "authenticated": false,
  "email": null,
  "plan": null,
  "licenseExpiresAt": null
}
```

**200 OK** — Remote mode, authenticated

```json
{
  "authRequired": true,
  "authenticated": true,
  "email": "user@example.com",
  "plan": "pro",
  "licenseExpiresAt": "2027-02-20T00:00:00.000Z"
}
```

---

## POST /api/auth/logout

Clear the session cookie.

### Responses

**200 OK**

```json
{
  "ok": true
}
```

Headers: `Set-Cookie: agentide_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
