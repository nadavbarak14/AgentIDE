# Quickstart: Product Security, Licensing & CLI

**Branch**: `007-auth-licensing-cli` | **Date**: 2026-02-20

## Prerequisites

- Node.js 20 LTS+
- npm 10+
- Existing AgentIDE development environment (`npm install` completed)

## Development Setup

```bash
# Checkout branch
git checkout 007-auth-licensing-cli

# Install new dependencies
npm install

# Start backend (dev mode)
npm run dev:backend

# Start frontend (dev mode, separate terminal)
npm run dev:frontend
```

## Key Files (New)

```
backend/src/
  auth/
    license.ts          # License key parsing, RSA validation, disk I/O
    jwt.ts              # JWT sign/verify using jose, cookie helpers
    tls.ts              # TLS cert loading + self-signed generation
  api/routes/
    auth.ts             # /api/auth/* endpoints (activate, status, logout)
  cli.ts                # CLI entry point (agentide start/activate)

frontend/src/
  pages/
    LicenseGate.tsx     # License key entry page
  hooks/
    useAuth.ts          # Auth state hook

tools/
  generate-license.ts   # Developer-only license key generator
```

## Key Files (Modified)

```
backend/src/
  hub-entry.ts          # Refactored to startHub(), auth/TLS integration
  api/middleware.ts      # Added requireAuth middleware
  api/websocket.ts       # JWT check on upgrade
  models/db.ts           # auth_config table
  models/types.ts        # Auth type definitions
  models/repository.ts   # Auth config methods

frontend/src/
  App.tsx                # Auth gate wrapper
  services/api.ts        # 401 interceptor, auth API methods

package.json (root)      # bin field for CLI
backend/package.json     # New dependencies
```

## Testing

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run specific test file
npx vitest run backend/tests/unit/license.test.ts
```

## Manual Testing

### Local mode (no auth)
```bash
npm run dev:backend
# Open http://localhost:5173 → dashboard loads directly, no license prompt
```

### License activation (CLI)
```bash
# Generate a test key first (see tools/generate-license.ts)
npx tsx tools/generate-license.ts --email test@example.com --plan pro --expires 2027-01-01

# Activate
npx tsx backend/src/cli.ts activate <generated-key>
```

### Remote mode (auth enforced)
```bash
# Start with auth enabled
PORT=3005 HOST=0.0.0.0 npx tsx backend/src/hub-entry.ts

# Open http://localhost:5173 → license gate should appear
# Enter license key → dashboard loads
```

### HTTPS mode
```bash
# Self-signed cert
npx tsx backend/src/cli.ts start --host 0.0.0.0 --tls --self-signed

# User-provided cert
npx tsx backend/src/cli.ts start --host 0.0.0.0 --tls --cert /path/to/cert.pem --key /path/to/key.pem
```

## New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `jose` | ^5.x | JWT sign/verify |
| `cookie-parser` | ^1.4.x | Express cookie middleware |
| `express-rate-limit` | ^7.x | Rate limiting on auth endpoint |
| `commander` | ^12.x | CLI framework |
| `selfsigned` | ^2.x | Self-signed TLS cert generation |

## Architecture Notes

- **Auth middleware** is applied AFTER `/api/auth` and `/api/hooks` routes in the Express stack — those endpoints are always accessible
- **Localhost mode** (`--host 127.0.0.1`, the default) skips ALL auth checks — zero friction for local development
- **Remote mode** (`--host 0.0.0.0`) enforces auth on all `/api/*` routes and WebSocket upgrades
- **JWT secret** is auto-generated on first run and stored in SQLite `auth_config` table — persists across restarts
- **License validation** is offline-only — uses RSA public key embedded in source code
