# Contract: Security Headers & Middleware

**Feature**: 009-product-security-licensing

## Security Response Headers

Applied to ALL responses via Express middleware (before route handlers).

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME-type sniffing |
| X-Frame-Options | DENY | Prevent clickjacking via iframe embedding |
| Content-Security-Policy | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'` | Restrict resource loading origins |

## Auth Middleware

Applied to `/api/*` routes AFTER `/api/auth` and `/api/hooks` routes.

| Mode | Behavior |
|------|----------|
| authRequired=false | Pass through (no check) |
| authRequired=true, no cookie | Return 401 `{"error": "Authentication required"}` |
| authRequired=true, invalid cookie | Return 401 `{"error": "Authentication required"}` |
| authRequired=true, valid cookie, license expired | Return 401 `{"error": "License expired"}` |
| authRequired=true, valid cookie | Pass through, attach `req.auth` payload |

## WebSocket Auth

Applied during HTTP upgrade to `/ws/sessions/:id`.

| Mode | Behavior |
|------|----------|
| authRequired=false | Allow upgrade |
| authRequired=true, no cookie in headers | Respond 401, destroy socket |
| authRequired=true, invalid cookie | Respond 401, destroy socket |
| authRequired=true, valid cookie | Allow upgrade |

## SSRF Protection (URL Proxy)

Applied on `/api/sessions/:id/proxy-url/:encodedUrl`.

**Blocked addresses**: All RFC 1918 private, loopback, link-local, and mapped addresses:
- IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0/8`
- IPv6: `::1`, `fd00::/8`, `fe80::/10`, `::ffff:127.0.0.0/104`

**DNS resolution**: Hostname is resolved to IP addresses before checking. Both A and AAAA records are checked.

Response: `403 {"error": "Proxying to private/internal addresses is not allowed"}`

## Path Traversal Defense

Applied on all file-serving endpoints.

**Layer 1** — `sanitizePath()` middleware:
- Rejects paths containing `..`
- Rejects paths containing null bytes (`\0`)

**Layer 2** — `path.resolve()` + `startsWith()` at serve time:
- Resolves the full path
- Verifies it starts with the session's working directory
