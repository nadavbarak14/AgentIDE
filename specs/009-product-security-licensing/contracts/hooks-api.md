# API Contract: Hooks Endpoint

**Feature**: 009-product-security-licensing
**Base Path**: `/api/hooks`

This endpoint is NOT protected by auth middleware but IS restricted to localhost callers when auth is required (remote mode).

---

## POST /api/hooks/event

Receive hook callbacks from spawned Claude processes.

### Access Control

| Mode | Behavior |
|------|----------|
| Localhost (authRequired=false) | Open to all callers |
| Remote (authRequired=true) | Restricted to `127.0.0.1`, `::1`, `::ffff:127.0.0.1` only |

### Request

```json
{
  "event": "SessionEnd",
  "c3SessionId": "uuid",
  "claudeSessionId": "string",
  "cwd": "/path/to/working/dir"
}
```

### Responses

**200 OK**

```json
{
  "ok": true
}
```

**403 Forbidden** — Non-localhost caller in remote mode

```json
{
  "error": "Hooks endpoint is restricted to localhost"
}
```

**400 Bad Request** — Missing required fields

```json
{
  "error": "Missing c3SessionId or event"
}
```
