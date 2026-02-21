# API Contract Changes: Pre-Launch Cleanup

**Feature**: 013-pre-launch-cleanup
**Date**: 2026-02-21

## Endpoints Removed

### DELETE: `POST /api/auth/activate`

Previously accepted a license key and returned activation details. Removed entirely.

### DELETE: `GET /api/auth/status`

Previously returned auth status (authRequired, authenticated, email, plan). Removed entirely.

### DELETE: `POST /api/auth/logout`

Previously cleared the session cookie. Removed entirely.

## Endpoints Added

### NEW: `GET /api/health`

Lightweight health check endpoint replacing `/api/auth/status` for infrastructure monitoring and test readiness checks.

**Request**: No body, no authentication required.

**Response** (200):
```json
{
  "status": "ok"
}
```

**Behavior**: Always returns 200 with `{ status: "ok" }`. No side effects, no database access.

## Middleware Changes

### Removed: Auth Middleware

Previously applied to all `/api/*` routes (except `/api/auth` and `/api/hooks`). Checked JWT cookie and returned 401 if invalid. **Removed entirely** — all API routes are now accessible without authentication.

### Removed: Cookie Parser

`cookie-parser` middleware removed from Express pipeline. No cookies are read or set by the server.

### Changed: Hooks Localhost Restriction

Previously conditional on `authRequired` flag. Now unconditional — hooks endpoint always restricted to localhost callers when server binds to non-localhost address.

## WebSocket Changes

### Removed: JWT Validation on Upgrade

Previously verified JWT cookie during WebSocket upgrade handshake when `authRequired=true`. **Removed** — WebSocket connections now proceed directly to session validation without auth check.

**Updated function signature**:
```
Before: setupWebSocket(server, repo, sessionManager, ptySpawner, fileWatcher, jwtSecret, authRequired, shellSpawner, remotePtyBridge)
After:  setupWebSocket(server, repo, sessionManager, ptySpawner, fileWatcher, shellSpawner, remotePtyBridge)
```

## CLI Changes

### Removed Flags from `agentide start`:
- `--tls` — Enable HTTPS/TLS
- `--cert <path>` — TLS certificate file
- `--key <path>` — TLS private key file
- `--self-signed` — Generate self-signed certificate
- `--no-auth` — Disable authentication

### Removed Command:
- `agentide activate <license-key>` — License activation command

## Existing Endpoints (Unchanged)

All other API endpoints remain unchanged in behavior:
- `GET/POST /api/sessions`
- `GET/PUT/DELETE /api/sessions/:id`
- `GET/POST /api/workers`
- `GET/PUT/DELETE /api/workers/:id`
- `GET/PUT /api/settings`
- `POST /api/hooks/event`
- All WebSocket endpoints (`/ws/sessions/:id`, `/ws/sessions/:id/shell`)
